import { useEffect, useRef } from "react";
import {
  resolveAudibleClips,
  resolvePreviewLayers,
} from "../compositor/resolvePreviewClip";
import type { CompositorFit } from "../compositor/types";
import { evaluateFilterStrength } from "../engine/animatable";
import { resolveFrameMode } from "../engine/speedRemap";
import { timelineDurationMs } from "../engine/time";
import {
  findFilter,
  filterLutUrl,
  loadFilterManifest,
} from "../filters/manifest";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { FilterClipParams, MediaAssetRef } from "../project/types";
import {
  findSticker,
  loadStickerManifest,
  STICKER_LOGICAL_SIZE,
} from "../stickers/manifest";
import { rasterizeStickerToImageBitmap } from "../stickers/rasterizeSvg";
import { stickerAssetId as styleStickerAssetId } from "../stickers/stickerStyle";
import { resolveCaptionDisplayAtLocalMs } from "../ai/captions/resolveCaptionDisplayText";
import { resolveCaptionCueAnimClock } from "../ai/captions/resolveCaptionText";
import { hasActiveTextAnimation } from "../engine/textAnimation";
import { useEditorStore } from "../store/editorStore";
import {
  disposePreviewAudio,
  stopPreviewAudio,
  syncPreviewAudio,
} from "./audioMixer";
import type {
  PreviewFilterLayer,
  PreviewSeekLayer,
} from "./previewWorkerProtocol";
import {
  clearPreviewStage,
  disposePreviewWorker,
  initPreviewWorker,
  isPreviewAssetLoaded,
  isPreviewLutLoaded,
  loadPreviewAsset,
  loadPreviewLut,
  resizePreviewWorker,
  seekPreview,
  setPreviewScrubbing,
  unloadPreviewAsset,
} from "./previewWorkerClient";
import { getPlatform } from "@indiecut/platform";
function stickerAssetId(
  stickerId: string,
  style?: import("../project/types").StickerStyleParams | null,
): string {
  return styleStickerAssetId(stickerId, style);
}

function fitFromMode(mode: "fit" | "full"): CompositorFit {
  return mode === "full" ? "cover" : "contain";
}

function mimeForAsset(asset: MediaAssetRef): string | undefined {
  if (asset.kind === "image") {
    const lower = asset.path.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
  }
  return "video/mp4";
}

async function resolveFilterLayer(
  filter: FilterClipParams,
  projectPath: string,
  strength = 1,
): Promise<PreviewFilterLayer | null> {
  if (!filter.lutId) return null;

  // User-imported LUT from project folder
  if (filter.lutPath && projectPath) {
    if (!isPreviewLutLoaded(filter.lutId)) {
      const bridge = getPlatform();
      if (!bridge?.fs) return null;
      const abs = resolveMediaAbsolutePath({
        projectPath,
        storedPath: filter.lutPath,
      });
      const bytes = await bridge.fs.readFile(abs);
      const text = new TextDecoder().decode(bytes);
      loadPreviewLut(filter.lutId, text);
    }
    return {
      lutId: filter.lutId,
      lutPath: filter.lutPath,
      strength,
      category: filter.category,
      // Worker uses cache keyed by lutId; URL unused once cached
      lutUrl: `project://${filter.lutId}`,
    };
  }

  const manifest = await loadFilterManifest();
  const entry = findFilter(manifest, filter.lutId);
  if (!entry) return null;
  return {
    lutId: filter.lutId,
    lutPath: filter.lutPath,
    strength,
    category: filter.category,
    lutUrl: filterLutUrl(entry.file),
  };
}

function mediaSeekLayer(args: {
  mediaId: string;
  sourceMs: number;
  transform?: PreviewSeekLayer["transform"];
  transform3d?: PreviewSeekLayer["transform3d"];
  blendMode?: PreviewSeekLayer["blendMode"];
  opacity?: PreviewSeekLayer["opacity"];
  adjust?: PreviewSeekLayer["adjust"];
  masksEnabled?: PreviewSeekLayer["masksEnabled"];
  masks?: PreviewSeekLayer["masks"];
  removeBg?: PreviewSeekLayer["removeBg"];
  crop?: PreviewSeekLayer["crop"];
  frameMode?: PreviewSeekLayer["frameMode"];
  filter?: PreviewFilterLayer | null;
}): PreviewSeekLayer {
  return {
    assetId: args.mediaId,
    sourceMs: args.sourceMs,
    transform: args.transform,
    transform3d: args.transform3d,
    blendMode: args.blendMode,
    opacity: args.opacity,
    adjust: args.adjust,
    masksEnabled: args.masksEnabled,
    masks: args.masks,
    removeBg: args.removeBg,
    crop: args.crop,
    frameMode: args.frameMode,
    filter: args.filter,
    role: "media",
  };
}

async function readAssetBuffer(
  asset: MediaAssetRef,
  projectPath: string,
  opts?: { preferMaster?: boolean },
): Promise<ArrayBuffer> {
  const bridge = getPlatform();
  if (!bridge?.fs) throw new Error("Electron fs bridge unavailable");

  let storedPath = asset.path;
  if (asset.kind === "video") {
    // Cropped clips must use master — older proxies were letterboxed to 16:9.
    if (opts?.preferMaster || !asset.proxyPath) {
      if (!opts?.preferMaster && !asset.proxyPath) {
        console.warn(
          `[preview] No proxy for ${asset.id}; falling back to master`,
        );
      }
      storedPath = asset.path;
    } else {
      storedPath = asset.proxyPath;
    }
  }

  const abs = resolveMediaAbsolutePath({
    projectPath,
    storedPath,
  });
  const bytes = await bridge.fs.readFile(abs);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Mounts OffscreenCanvas preview, drives RAF playback, multi-layer seek,
 * and clock-synced preview audio.
 */
export function usePreviewController(canvasHostRef: {
  current: HTMLDivElement | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadGenRef = useRef(0);
  /** Tracks whether each asset was loaded from master or proxy (for crop reloads). */
  const loadedAssetSourceRef = useRef(new Map<string, "master" | "proxy">());

  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const tracks = useEditorStore((s) => s.project.tracks);
  const mediaIndex = useEditorStore((s) => s.project.mediaIndex);
  const projectPath = useEditorStore((s) => s.project.projectPath);
  const fps = useEditorStore((s) => s.project.fps);
  const projectWidth = useEditorStore((s) => s.project.width);
  const projectHeight = useEditorStore((s) => s.project.height);
  const aspectRatio = useEditorStore((s) => s.project.aspectRatio);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const previewFitMode = useEditorStore((s) => s.previewFitMode);
  const isScrubbing = useEditorStore((s) => s.isScrubbing);
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs);
  const setPlaying = useEditorStore((s) => s.setPlaying);

  // Create canvas + transfer OffscreenCanvas once.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.className = "preview-panel__canvas";
    canvas.setAttribute("aria-label", "Preview canvas");
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const rect = host.getBoundingClientRect();
    const cssW = Math.max(2, Math.round(rect.width));
    const cssH = Math.max(2, Math.round(rect.height));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    // Backing store at device pixels — avoids soft/pixelated preview on retina.
    const width = Math.max(2, Math.round(cssW * dpr));
    const height = Math.max(2, Math.round(cssH * dpr));
    canvas.width = width;
    canvas.height = height;

    const offscreen = canvas.transferControlToOffscreen();
    initPreviewWorker({
      canvas: offscreen,
      width,
      height,
      fit: fitFromMode(useEditorStore.getState().previewFitMode),
      // Stage buffer is already DPR-scaled; don't multiply again in text ratio.
      devicePixelRatio: 1,
    });

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextDpr = Math.max(1, window.devicePixelRatio || 1);
      const cw = Math.max(2, Math.round(entry.contentRect.width));
      const ch = Math.max(2, Math.round(entry.contentRect.height));
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      resizePreviewWorker({
        width: Math.max(2, Math.round(cw * nextDpr)),
        height: Math.max(2, Math.round(ch * nextDpr)),
        fit: fitFromMode(useEditorStore.getState().previewFitMode),
        devicePixelRatio: 1,
      });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      disposePreviewWorker();
      disposePreviewAudio();
      canvas.remove();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once on host
  }, []);

  // Sync scrubbing throttle flag.
  useEffect(() => {
    setPreviewScrubbing(isScrubbing);
  }, [isScrubbing]);

  // Fit mode changes → resize sink fit.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    resizePreviewWorker({
      width: Math.max(2, Math.round(rect.width * dpr)),
      height: Math.max(2, Math.round(rect.height * dpr)),
      fit: fitFromMode(previewFitMode),
      devicePixelRatio: 1,
    });
  }, [previewFitMode, canvasHostRef, aspectRatio]);

  // RAF play loop — advances global playhead from wall-clock delta (× shuttle rate).
  useEffect(() => {
    if (!isPlaying) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const state = useEditorStore.getState();
      if (!state.isPlaying) return;

      const delta = now - last;
      last = now;
      const rate =
        state.shuttleRate !== 0 ? state.shuttleRate : 1;
      const duration = timelineDurationMs(state.project.tracks);
      const next = state.project.playheadMs + delta * rate;

      if (duration > 0 && next >= duration) {
        setPlayheadMs(duration);
        setPlaying(false);
        return;
      }
      if (next <= 0) {
        setPlayheadMs(0);
        if (rate < 0) {
          setPlaying(false);
          return;
        }
      }

      setPlayheadMs(Math.max(0, next));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, setPlayheadMs, setPlaying]);

  // Resolve layers → load assets → multi-seek.
  useEffect(() => {
    const layers = resolvePreviewLayers(
      tracks,
      mediaIndex,
      playheadMs,
      fps,
      projectHeight,
    );
    if (layers.length === 0) {
      clearPreviewStage();
      return;
    }

    const run = async () => {
      const gen = ++loadGenRef.current;
      try {
        const needsMedia = layers.some(
          (l) => l.kind === "video" || l.kind === "image",
        );
        if (needsMedia && !projectPath) return;

        let stickerManifest:
          | Awaited<ReturnType<typeof loadStickerManifest>>
          | null = null;
        if (layers.some((l) => l.kind === "sticker")) {
          stickerManifest = await loadStickerManifest();
          if (gen !== loadGenRef.current) return;
        }

        // Cropped clips need master decode — letterboxed 16:9 proxies break crop space.
        const mediaNeedsMaster = new Set<string>();
        for (const track of tracks) {
          for (const c of track.clips) {
            if (c.mediaId && c.crop) mediaNeedsMaster.add(c.mediaId);
          }
        }

        const ensureMediaLoaded = async (mediaId: string) => {
          if (!projectPath) return;
          const asset = mediaIndex.find((m) => m.id === mediaId);
          if (!asset || asset.importStatus === "processing") return;
          if (asset.kind !== "video" && asset.kind !== "image") return;
          const preferMaster = mediaNeedsMaster.has(mediaId);
          const sourceKey = preferMaster ? "master" : "proxy";
          const prevSource = loadedAssetSourceRef.current.get(asset.id);
          if (prevSource && prevSource !== sourceKey) {
            unloadPreviewAsset(asset.id);
            loadedAssetSourceRef.current.delete(asset.id);
          }
          if (isPreviewAssetLoaded(asset.id)) return;
          const buffer = await readAssetBuffer(asset, projectPath, {
            preferMaster,
          });
          if (gen !== loadGenRef.current) return;
          await loadPreviewAsset({
            assetId: asset.id,
            kind: asset.kind === "image" ? "image" : "video",
            buffer,
            mimeHint: mimeForAsset(asset),
          });
          loadedAssetSourceRef.current.set(asset.id, sourceKey);
        };

        for (const layer of layers) {
          if (
            layer.kind === "text" ||
            layer.kind === "caption" ||
            layer.kind === "filter" ||
            layer.kind === "effect"
          ) {
            continue;
          }

          if (layer.kind === "sticker" && layer.stickerId) {
            const style = layer.clip.stickerStyle;
            const assetId = stickerAssetId(layer.stickerId, style);
            if (isPreviewAssetLoaded(assetId)) continue;
            const entry = stickerManifest
              ? findSticker(stickerManifest, layer.stickerId)
              : undefined;
            if (!entry) {
              console.warn("Preview: missing sticker", layer.stickerId);
              continue;
            }
            if (gen !== loadGenRef.current) return;
            // Kinetic SVG → ImageBitmap on main; cached by style fingerprint.
            const bitmap = await rasterizeStickerToImageBitmap(
              layer.stickerId,
              style,
            );
            if (gen !== loadGenRef.current) {
              bitmap.close();
              return;
            }
            await loadPreviewAsset({
              assetId,
              kind: "image",
              bitmap,
            });
            if (gen !== loadGenRef.current) return;
            continue;
          }

          if (layer.mediaId) {
            await ensureMediaLoaded(layer.mediaId);
            if (gen !== loadGenRef.current) return;
          }
          if (layer.transitionPartner?.mediaId) {
            await ensureMediaLoaded(layer.transitionPartner.mediaId);
            if (gen !== loadGenRef.current) return;
          }
        }

        if (gen !== loadGenRef.current) return;

        const seekLayers: PreviewSeekLayer[] = [];
        for (const l of layers) {
          if (l.kind === "filter" && l.filter) {
            const filterLayer = await resolveFilterLayer(
              l.filter,
              projectPath,
              l.resolvedFilterStrength ?? 1,
            );
            if (gen !== loadGenRef.current) return;
            if (!filterLayer) continue;
            seekLayers.push({
              sourceMs: 0,
              role: "filter",
              filter: filterLayer,
              localMs: l.localMs,
            });
            continue;
          }

          if (l.kind === "effect" && l.effect) {
            seekLayers.push({
              sourceMs: 0,
              role: "effect",
              effect: {
                effectId: l.effect.effectId,
                intensity: l.resolvedEffectIntensity ?? 1,
              },
              localMs: l.localMs,
            });
            continue;
          }

          if (l.kind === "text" || l.kind === "caption") {
            const text =
              l.kind === "caption"
                ? l.resolvedText
                : (l.resolvedText ?? l.clip.text);
            if (!text) continue;
            if (l.kind === "caption" && l.clip.caption) {
              const clock = resolveCaptionCueAnimClock(
                l.clip.caption,
                l.localMs,
              );
              const displayed = resolveCaptionDisplayAtLocalMs(
                l.clip,
                l.localMs,
                projectWidth,
              );
              const karaoke =
                displayed?.karaoke &&
                !hasActiveTextAnimation(clock?.animation)
                  ? {
                      visible: displayed.karaoke.visible,
                      activeIndex: displayed.karaoke.activeIndex,
                      contentMs: displayed.karaoke.contentMs,
                      maxWrapWidth: displayed.karaoke.maxWrapWidth,
                      display: displayed.display,
                    }
                  : null;
              seekLayers.push({
                sourceMs: 0,
                transform: l.resolvedTransform,
                blendMode: l.clip.blendMode,
                opacity: l.resolvedOpacity,
                text: displayed?.text ?? text,
                textKey: clock
                  ? `${l.clip.id}:${clock.cue.id}`
                  : l.clip.id,
                placement: "native",
                localMs: clock?.animLocalMs ?? l.localMs,
                clipDurationMs: clock?.animDurationMs ?? l.clip.durationMs,
                animation: clock?.animation,
                captionKaraoke: karaoke,
              });
              continue;
            }
            seekLayers.push({
              sourceMs: 0,
              transform: l.resolvedTransform,
              transform3d: l.resolvedTransform3d,
              blendMode: l.clip.blendMode,
              opacity: l.resolvedOpacity,
              text,
              textKey: l.clip.id,
              placement: "native",
              localMs: l.localMs,
              clipDurationMs: l.clip.durationMs,
              animation: l.clip.animation,
            });
            continue;
          }
          if (l.kind === "sticker" && l.stickerId) {
            const assetId = stickerAssetId(l.stickerId, l.clip.stickerStyle);
            if (!isPreviewAssetLoaded(assetId)) {
              console.warn("Preview: sticker not loaded", l.stickerId);
              continue;
            }
            seekLayers.push({
              assetId,
              sourceMs: 0,
              transform: l.resolvedTransform,
              transform3d: l.resolvedTransform3d,
              blendMode: l.clip.blendMode ?? "normal",
              opacity: l.resolvedOpacity ?? 1,
              placement: "native",
              layoutSize: {
                width: STICKER_LOGICAL_SIZE,
                height: STICKER_LOGICAL_SIZE,
              },
              localMs: l.localMs,
              clipDurationMs: l.clip.durationMs,
              animation: l.clip.animation,
            });
            continue;
          }
          if (!l.mediaId) continue;

          if (gen !== loadGenRef.current) return;

          const clipFilter = l.clip.filter
            ? await resolveFilterLayer(
                l.clip.filter,
                projectPath,
                l.resolvedFilterStrength ?? 1,
              )
            : null;
          if (gen !== loadGenRef.current) return;

          if (l.transition && l.transitionPartner && l.transitionProgress != null) {
            const partner = mediaSeekLayer({
              mediaId: l.transitionPartner.mediaId,
              sourceMs: l.transitionPartner.sourceMs,
              transform: l.transitionPartner.resolvedTransform,
              blendMode: l.transitionPartner.clip.blendMode,
              opacity: l.transitionPartner.resolvedOpacity,
              adjust: l.transitionPartner.resolvedAdjust,
              masksEnabled: l.transitionPartner.clip.masksEnabled,
              masks: l.transitionPartner.resolvedMasks,
              removeBg: l.transitionPartner.clip.removeBg,
              crop: l.transitionPartner.clip.crop,
              frameMode: resolveFrameMode(l.transitionPartner.clip.speed),
              filter: l.transitionPartner.clip.filter
                ? await resolveFilterLayer(
                    l.transitionPartner.clip.filter,
                    projectPath,
                    evaluateFilterStrength(
                      l.transitionPartner.clip,
                      l.transitionPartner.localMs,
                    ),
                  )
                : null,
            });
            if (gen !== loadGenRef.current) return;
            seekLayers.push({
              ...mediaSeekLayer({
                mediaId: l.mediaId,
                sourceMs: l.sourceMs,
                transform: l.resolvedTransform,
                transform3d: l.resolvedTransform3d,
                blendMode: l.clip.blendMode,
                opacity: l.resolvedOpacity,
                adjust: l.resolvedAdjust,
                masksEnabled: l.clip.masksEnabled,
                masks: l.resolvedMasks,
                removeBg: l.clip.removeBg,
                crop: l.clip.crop,
                frameMode: resolveFrameMode(l.clip.speed),
                filter: clipFilter,
              }),
              transition: {
                presetId: l.transition.presetId,
                progress: l.transitionProgress,
                direction: l.transition.direction,
                intensity: l.transition.intensity,
                partner,
              },
            });
            continue;
          }

          seekLayers.push(
            mediaSeekLayer({
              mediaId: l.mediaId,
              sourceMs: l.sourceMs,
              transform: l.resolvedTransform,
              transform3d: l.resolvedTransform3d,
              blendMode: l.clip.blendMode,
              opacity: l.resolvedOpacity,
              adjust: l.resolvedAdjust,
              masksEnabled: l.clip.masksEnabled,
              masks: l.resolvedMasks,
              removeBg: l.clip.removeBg,
              crop: l.clip.crop,
              frameMode: resolveFrameMode(l.clip.speed),
              filter: clipFilter,
            }),
          );
        }

        seekPreview({
          layers: seekLayers,
          fps,
          layoutWidth: projectWidth,
          layoutHeight: projectHeight,
          // Stickers load async as bitmaps — always force so a prior miss
          // (same draw-key, empty decode) cannot stick as a skipped frame.
          force:
            !isScrubbing ||
            seekLayers.some((l) => l.assetId?.startsWith("sticker:")),
        });
      } catch (err) {
        console.error("Preview seek failed", err);
      }
    };

    void run();
  }, [
    playheadMs,
    tracks,
    mediaIndex,
    projectPath,
    fps,
    projectWidth,
    projectHeight,
    isScrubbing,
    previewFitMode,
    isPlaying,
  ]);

  // Preview audio — same clock as playhead.
  useEffect(() => {
    if (!isPlaying) {
      stopPreviewAudio();
      return;
    }
    if (!projectPath) return;

    const audible = resolveAudibleClips(tracks, mediaIndex, playheadMs, fps);
    void syncPreviewAudio({
      audible,
      mediaIndex,
      projectPath,
      playheadMs,
      isPlaying,
    });
  }, [isPlaying, playheadMs, tracks, mediaIndex, projectPath, fps]);
}
