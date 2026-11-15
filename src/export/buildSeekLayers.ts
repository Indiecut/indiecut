import { resolvePreviewLayers } from "../compositor/resolvePreviewClip";
import { evaluateFilterStrength } from "../engine/animatable";
import { resolveFrameMode } from "../engine/speedRemap";
import {
  findFilter,
  filterLutUrl,
  loadFilterManifest,
} from "../filters/manifest";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type {
  FilterClipParams,
  MediaAssetRef,
  ProjectDocument,
} from "../project/types";
import {
  findSticker,
  loadStickerManifest,
  STICKER_LOGICAL_SIZE,
} from "../stickers/manifest";
import { rasterizeStickerToPngBuffer } from "../stickers/rasterizeSvg";
import { stickerAssetId as styleStickerAssetId } from "../stickers/stickerStyle";
import type {
  PreviewFilterLayer,
  PreviewSeekLayer,
} from "../preview/previewWorkerProtocol";
import { resolveCaptionDisplayAtLocalMs } from "../ai/captions/resolveCaptionDisplayText";
import { resolveCaptionCueAnimClock } from "../ai/captions/resolveCaptionText";
import { hasActiveTextAnimation } from "../engine/textAnimation";
import type { StickerStyleParams } from "../project/types";

export function stickerAssetId(
  stickerId: string,
  style?: StickerStyleParams | null,
): string {
  return styleStickerAssetId(stickerId, style);
}

export function mimeForAsset(asset: MediaAssetRef): string | undefined {
  if (asset.kind === "image") {
    const lower = asset.path.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
  }
  return "video/mp4";
}

export type LutTextLoader = (lutId: string, text: string) => void;

async function resolveFilterLayer(
  filter: FilterClipParams,
  projectPath: string,
  loadLut: LutTextLoader,
  isLutLoaded: (lutId: string) => boolean,
  strength = 1,
): Promise<PreviewFilterLayer | null> {
  if (!filter.lutId) return null;

  if (filter.lutPath && projectPath) {
    if (!isLutLoaded(filter.lutId)) {
      const bridge = window.indiecut;
      if (!bridge?.fs) return null;
      const abs = resolveMediaAbsolutePath({
        projectPath,
        storedPath: filter.lutPath,
      });
      const bytes = await bridge.fs.readFile(abs);
      const text = new TextDecoder().decode(bytes);
      loadLut(filter.lutId, text);
    }
    return {
      lutId: filter.lutId,
      lutPath: filter.lutPath,
      strength,
      category: filter.category,
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

/**
 * Build compositor seek layers at globalMs — same mapping as live preview.
 */
export async function buildSeekLayersAtTime(
  project: ProjectDocument,
  globalMs: number,
  loadLut: LutTextLoader,
  isLutLoaded: (lutId: string) => boolean,
): Promise<PreviewSeekLayer[]> {
  const { tracks, mediaIndex, fps, projectPath, height } = project;
  const layers = resolvePreviewLayers(
    tracks,
    mediaIndex,
    globalMs,
    fps,
    height,
  );
  const seekLayers: PreviewSeekLayer[] = [];

  for (const l of layers) {
    if (l.kind === "filter" && l.filter) {
      const filterLayer = await resolveFilterLayer(
        l.filter,
        projectPath,
        loadLut,
        isLutLoaded,
        l.resolvedFilterStrength ?? 1,
      );
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
        l.kind === "caption" ? l.resolvedText : (l.resolvedText ?? l.clip.text);
      if (!text) continue;
      if (l.kind === "caption" && l.clip.caption) {
        const clock = resolveCaptionCueAnimClock(l.clip.caption, l.localMs);
        const displayed = resolveCaptionDisplayAtLocalMs(
          l.clip,
          l.localMs,
          project.width,
        );
        const karaoke =
          displayed?.karaoke && !hasActiveTextAnimation(clock?.animation)
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
          textKey: clock ? `${l.clip.id}:${clock.cue.id}` : l.clip.id,
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
      seekLayers.push({
        assetId: stickerAssetId(l.stickerId, l.clip.stickerStyle),
        sourceMs: 0,
        transform: l.resolvedTransform,
        transform3d: l.resolvedTransform3d,
        blendMode: l.clip.blendMode,
        opacity: l.resolvedOpacity,
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

    const clipFilter = l.clip.filter
      ? await resolveFilterLayer(
          l.clip.filter,
          projectPath,
          loadLut,
          isLutLoaded,
          l.resolvedFilterStrength ?? 1,
        )
      : null;

    if (l.transition && l.transitionPartner && l.transitionProgress != null) {
      const partnerFilter = l.transitionPartner.clip.filter
        ? await resolveFilterLayer(
            l.transitionPartner.clip.filter,
            projectPath,
            loadLut,
            isLutLoaded,
            evaluateFilterStrength(
              l.transitionPartner.clip,
              l.transitionPartner.localMs,
            ),
          )
        : null;
      const partner = mediaSeekLayer({
        mediaId: l.transitionPartner.mediaId!,
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
        filter: partnerFilter,
      });
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

  return seekLayers;
}

export type ExportAssetNeed = {
  assetId: string;
  kind: "video" | "image";
  /** Absolute or project-relative stored path for masters */
  source: "media" | "sticker";
  mediaId?: string;
  stickerId?: string;
  stickerStyle?: StickerStyleParams | null;
};

/** Collect unique media/sticker assets needed for the full timeline. */
export async function collectExportAssets(
  project: ProjectDocument,
): Promise<ExportAssetNeed[]> {
  const needs = new Map<string, ExportAssetNeed>();
  const duration = Math.max(
    0,
    ...project.tracks.flatMap((t) =>
      t.clips.map((c) => c.startMs + c.durationMs),
    ),
  );
  // Sample at 0 and scan all clips directly for assets
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.stickerId) {
        const id = stickerAssetId(clip.stickerId, clip.stickerStyle);
        needs.set(id, {
          assetId: id,
          kind: "image",
          source: "sticker",
          stickerId: clip.stickerId,
          stickerStyle: clip.stickerStyle,
        });
      }
      if (clip.mediaId) {
        const asset = project.mediaIndex.find((m) => m.id === clip.mediaId);
        if (!asset) continue;
        if (asset.kind === "video" || asset.kind === "image") {
          needs.set(asset.id, {
            assetId: asset.id,
            kind: asset.kind,
            source: "media",
            mediaId: asset.id,
          });
        }
      }
    }
  }
  // Ensure stickers referenced only via layers at t=0 still get picked if any
  void duration;
  // Warm sticker manifest so fetch paths resolve later
  await loadStickerManifest();
  return [...needs.values()];
}

export async function loadExportAssetBuffer(
  need: ExportAssetNeed,
  project: ProjectDocument,
): Promise<{ buffer: ArrayBuffer; mimeHint?: string }> {
  if (need.source === "sticker" && need.stickerId) {
    const manifest = await loadStickerManifest();
    const entry = findSticker(manifest, need.stickerId);
    if (!entry) throw new Error(`Missing sticker ${need.stickerId}`);
    const buffer = await rasterizeStickerToPngBuffer(
      need.stickerId,
      need.stickerStyle,
    );
    return { buffer, mimeHint: "image/png" };
  }

  const asset = project.mediaIndex.find((m) => m.id === need.mediaId);
  if (!asset) throw new Error(`Missing media ${need.mediaId}`);
  const bridge = window.indiecut;
  if (!bridge?.fs) throw new Error("Electron fs bridge unavailable");
  // Masters only for export
  const abs = resolveMediaAbsolutePath({
    projectPath: project.projectPath,
    storedPath: asset.path,
  });
  const bytes = await bridge.fs.readFile(abs);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return { buffer: copy.buffer, mimeHint: mimeForAsset(asset) };
}
