import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FULL_CROP, isFullCrop, normalizeCrop } from "../compositor/crop";
import { sourceMsAtLocal } from "../engine/speedRemap";
import { clipLocalMs, formatTimecode } from "../engine/time";
import { IconPause, IconPlay } from "../icons/Icons";
import {
  openCropPreviewSession,
  type CropPreviewSession,
} from "../media/cropPreviewSession";
import type { CropRect } from "../project/types";
import { findClip, useEditorStore } from "../store/editorStore";
import "./CropDialog.css";

type AspectPreset = "original" | "free" | "16:9" | "9:16" | "1:1";

type Handle =
  | "move"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "e"
  | "w";

type DragState = {
  handle: Handle;
  startClientX: number;
  startClientY: number;
  start: CropRect;
};

const MIN_NORM = 0.02;

function clampCrop(c: CropRect): CropRect {
  const x = Math.min(1 - MIN_NORM, Math.max(0, c.x));
  const y = Math.min(1 - MIN_NORM, Math.max(0, c.y));
  const width = Math.min(1 - x, Math.max(MIN_NORM, c.width));
  const height = Math.min(1 - y, Math.max(MIN_NORM, c.height));
  return { x, y, width, height };
}

function fitAspectInUnit(
  aspect: number,
  anchor?: { cx: number; cy: number },
): CropRect {
  const cx = anchor?.cx ?? 0.5;
  const cy = anchor?.cy ?? 0.5;
  let width: number;
  let height: number;
  if (aspect >= 1) {
    width = 1;
    height = 1 / aspect;
    if (height > 1) {
      height = 1;
      width = aspect;
    }
  } else {
    height = 1;
    width = aspect;
    if (width > 1) {
      width = 1;
      height = 1 / aspect;
    }
  }
  if (width > 1 || height > 1) {
    const scale = Math.min(1 / width, 1 / height);
    width *= scale;
    height *= scale;
  }
  const x = Math.min(1 - width, Math.max(0, cx - width / 2));
  const y = Math.min(1 - height, Math.max(0, cy - height / 2));
  return clampCrop({ x, y, width, height });
}

function presetAspectRatio(
  preset: AspectPreset,
  mediaAspect: number,
): number | null {
  if (preset === "free") return null;
  if (preset === "original") return mediaAspect;
  if (preset === "16:9") return 16 / 9;
  if (preset === "9:16") return 9 / 16;
  return 1;
}

function applyAspectToCrop(
  crop: CropRect,
  aspect: number | null,
  mediaAspect: number,
): CropRect {
  if (aspect === null) return clampCrop(crop);
  const normAspect = aspect / Math.max(1e-8, mediaAspect);
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  return fitAspectInUnit(normAspect, { cx, cy });
}

export function CropDialog() {
  const open = useEditorStore((s) => s.cropDialogOpen);
  const setOpen = useEditorStore((s) => s.setCropDialogOpen);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const tracks = useEditorStore((s) => s.project.tracks);
  const mediaIndex = useEditorStore((s) => s.project.mediaIndex);
  const projectPath = useEditorStore((s) => s.project.projectPath);
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const fps = useEditorStore((s) => s.project.fps);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );

  const selected = selectedClipId ? findClip(tracks, selectedClipId) : null;
  const clip =
    selected &&
    (selected.clip.kind === "video" || selected.clip.kind === "image")
      ? selected.clip
      : null;
  const media = clip?.mediaId
    ? mediaIndex.find((m) => m.id === clip.mediaId) ?? null
    : null;
  const isVideo = clip?.kind === "video";

  const [draft, setDraft] = useState<CropRect>(FULL_CROP);
  const [preset, setPreset] = useState<AspectPreset>("free");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  const [mediaSize, setMediaSize] = useState({ w: 1, h: 1 });
  const [previewPlaying, setPreviewPlaying] = useState(false);
  /** Current source time (sec) shown on the scrubber. */
  const [previewSec, setPreviewSec] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrubTrackRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<CropPreviewSession | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const markerSourceSecRef = useRef(0);
  const sourceRangeRef = useRef({ startSec: 0, endSec: 1 });
  const currentSourceSecRef = useRef(0);
  const playGenRef = useRef(0);
  const drawBusyRef = useRef(false);
  const scrubRafRef = useRef<number | null>(null);

  const mediaAspect = useMemo(() => {
    const w = media?.width && media.width > 0 ? media.width : mediaSize.w;
    const h = media?.height && media.height > 0 ? media.height : mediaSize.h;
    return w / Math.max(1, h);
  }, [media?.width, media?.height, mediaSize.w, mediaSize.h]);

  /** Display size for the media stage — matches source aspect (TikTok vs YouTube). */
  const stageDisplay = useMemo(() => {
    // Prefer probed asset size (true source). Decoded proxy frames were often 16:9.
    const srcW = Math.max(
      1,
      media?.width && media.width > 0 ? media.width : mediaSize.w,
    );
    const srcH = Math.max(
      1,
      media?.height && media.height > 0 ? media.height : mediaSize.h,
    );
    const maxW = 780;
    const maxH = Math.min(
      520,
      typeof window !== "undefined" ? window.innerHeight * 0.55 : 520,
    );
    const scale = Math.min(maxW / srcW, maxH / srcH);
    return {
      width: Math.max(120, Math.round(srcW * scale)),
      height: Math.max(120, Math.round(srcH * scale)),
    };
  }, [media?.width, media?.height, mediaSize.w, mediaSize.h]);

  const measureStage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setStageBox({ w: stage.clientWidth, h: stage.clientHeight });
  }, []);

  const drawAt = useCallback(async (sourceSec: number) => {
    const session = sessionRef.current;
    const canvas = canvasRef.current;
    if (!session || !canvas || drawBusyRef.current) return;
    drawBusyRef.current = true;
    try {
      const size = await session.draw(canvas, sourceSec);
      currentSourceSecRef.current = sourceSec;
      setPreviewSec(sourceSec);
      setMediaSize(size);
      // Keep CSS box locked to source aspect (don't let canvas default stretch).
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      measureStage();
    } finally {
      drawBusyRef.current = false;
    }
  }, [measureStage]);

  const clampSourceSec = useCallback((sec: number) => {
    const { startSec, endSec } = sourceRangeRef.current;
    return Math.min(endSec - 0.001, Math.max(startSec, sec));
  }, []);

  const sourceSecFromClientX = useCallback((clientX: number) => {
    const track = scrubTrackRef.current;
    const { startSec, endSec } = sourceRangeRef.current;
    if (!track) return startSec;
    const rect = track.getBoundingClientRect();
    const t = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return clampSourceSec(startSec + Math.min(1, Math.max(0, t)) * (endSec - startSec));
  }, [clampSourceSec]);

  const scheduleScrubSeek = useCallback(
    (sourceSec: number) => {
      currentSourceSecRef.current = sourceSec;
      setPreviewSec(sourceSec);
      if (scrubRafRef.current != null) cancelAnimationFrame(scrubRafRef.current);
      scrubRafRef.current = requestAnimationFrame(() => {
        scrubRafRef.current = null;
        void drawAt(sourceSec);
      });
    },
    [drawAt],
  );

  const stopPreview = useCallback(() => {
    playGenRef.current += 1;
    setPreviewPlaying(false);
  }, []);

  const close = useCallback(() => {
    stopPreview();
    setOpen(false);
  }, [setOpen, stopPreview]);

  useEffect(() => {
    if (open) setPlaying(false);
  }, [open, setPlaying]);

  // Open decode session + first frame at playhead marker
  useEffect(() => {
    if (!open || !clip || !media || !projectPath) {
      if (!open) {
        stopPreview();
        const prev = sessionRef.current;
        sessionRef.current = null;
        void prev?.dispose();
        setReady(false);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setReady(false);
    stopPreview();
    setDraft(clip.crop ?? { ...FULL_CROP });
    setPreset(isFullCrop(clip.crop) ? "original" : "free");
    // Seed stage aspect from asset metadata so portrait/landscape is correct immediately.
    if (media.width && media.height && media.width > 0 && media.height > 0) {
      setMediaSize({ w: media.width, h: media.height });
    }

    const local = clipLocalMs(playheadMs, clip) ?? 0;
    const sourceMs = sourceMsAtLocal(clip, local, fps);
    markerSourceSecRef.current = Math.max(0, sourceMs / 1000);
    currentSourceSecRef.current = markerSourceSecRef.current;
    setPreviewSec(markerSourceSecRef.current);
    sourceRangeRef.current = {
      startSec: Math.max(0, clip.inMs / 1000),
      endSec: Math.max(clip.inMs / 1000 + 0.04, clip.outMs / 1000),
    };

    void (async () => {
      const prev = sessionRef.current;
      sessionRef.current = null;
      await prev?.dispose().catch(() => undefined);
      try {
        const session = await openCropPreviewSession({
          asset: media,
          projectPath,
        });
        if (cancelled) {
          await session.dispose();
          return;
        }
        sessionRef.current = session;
        setMediaSize({ w: session.width, h: session.height });
        // Mark ready first so the canvas mounts, then paint the marker frame.
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      stopPreview();
    };
  }, [open, clip?.id, media?.id, projectPath]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      stopPreview();
      if (scrubRafRef.current != null) {
        cancelAnimationFrame(scrubRafRef.current);
        scrubRafRef.current = null;
      }
      const prev = sessionRef.current;
      sessionRef.current = null;
      void prev?.dispose();
    };
  }, [stopPreview]);

  // Paint the initial / current frame once the canvas is in the DOM.
  useEffect(() => {
    if (!open || !ready || !sessionRef.current) return;
    let cancelled = false;
    const paint = async () => {
      // Wait a frame so layout can size the canvas.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled || !canvasRef.current || !sessionRef.current) return;
      await drawAt(currentSourceSecRef.current);
    };
    void paint();
    return () => {
      cancelled = true;
    };
  }, [open, ready, drawAt, clip?.id]);

  useEffect(() => {
    if (!ready) return;
    measureStage();
    const ro = new ResizeObserver(() => measureStage());
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [ready, measureStage, stageDisplay.width, stageDisplay.height]);

  const seekToMarker = () => {
    stopPreview();
    void drawAt(markerSourceSecRef.current);
  };

  const onScrubPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!ready || !isVideo) return;
    e.preventDefault();
    e.stopPropagation();
    stopPreview();
    setScrubbing(true);
    const sec = sourceSecFromClientX(e.clientX);
    scheduleScrubSeek(sec);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onScrubPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    e.preventDefault();
    scheduleScrubSeek(sourceSecFromClientX(e.clientX));
  };

  const onScrubPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    e.preventDefault();
    setScrubbing(false);
    scheduleScrubSeek(sourceSecFromClientX(e.clientX));
  };

  const togglePreviewPlay = () => {
    if (!isVideo || !sessionRef.current) return;
    if (previewPlaying) {
      stopPreview();
      return;
    }

    const { startSec, endSec } = sourceRangeRef.current;
    let t = currentSourceSecRef.current;
    if (t < startSec || t >= endSec - 0.02) {
      t = Math.min(endSec - 0.001, Math.max(startSec, markerSourceSecRef.current));
    }

    const gen = ++playGenRef.current;
    setPreviewPlaying(true);
    let lastWall = performance.now();
    currentSourceSecRef.current = t;
    setPreviewSec(t);

    const tick = async (now: number) => {
      if (playGenRef.current !== gen) return;
      const dt = Math.min(0.08, Math.max(0, (now - lastWall) / 1000));
      lastWall = now;
      t += dt;
      if (t >= endSec - 0.01) {
        await drawAt(startSec);
        if (playGenRef.current === gen) setPreviewPlaying(false);
        return;
      }
      await drawAt(t);
      if (playGenRef.current !== gen) return;
      requestAnimationFrame((n) => {
        void tick(n);
      });
    };

    requestAnimationFrame((n) => {
      void tick(n);
    });
  };

  const rangeStart = sourceRangeRef.current.startSec;
  const rangeEnd = sourceRangeRef.current.endSec;
  const rangeDur = Math.max(0.001, rangeEnd - rangeStart);
  const scrubProgress = Math.min(
    1,
    Math.max(0, (previewSec - rangeStart) / rangeDur),
  );
  const markerProgress = Math.min(
    1,
    Math.max(0, (markerSourceSecRef.current - rangeStart) / rangeDur),
  );

  const formatPreviewClock = (sec: number) => {
    const ms = Math.max(0, sec * 1000);
    return formatTimecode(ms, fps);
  };

  const selectPreset = (next: AspectPreset) => {
    setPreset(next);
    if (next === "original") {
      setDraft({ ...FULL_CROP });
      return;
    }
    const aspect = presetAspectRatio(next, mediaAspect);
    setDraft((prev) => applyAspectToCrop(prev, aspect, mediaAspect));
  };

  const reset = () => {
    setPreset("original");
    setDraft({ ...FULL_CROP });
  };

  const apply = () => {
    if (!clip) return;
    stopPreview();
    const before = structuredClone(useEditorStore.getState().project.tracks);
    const normalized = normalizeCrop(draft);
    const after = before.map((track) => ({
      ...track,
      clips: track.clips.map((c) => {
        if (c.id !== clip.id) return c;
        const next = { ...c };
        if (normalized) next.crop = normalized;
        else delete next.crop;
        return next;
      }),
    }));
    commitTracksTransition(before, after, "Crop");
    setOpen(false);
  };

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || stageBox.w < 2 || stageBox.h < 2) return;
      const dx = (e.clientX - drag.startClientX) / stageBox.w;
      const dy = (e.clientY - drag.startClientY) / stageBox.h;
      const start = drag.start;
      const aspect = presetAspectRatio(preset, mediaAspect);
      const normAspect =
        aspect === null ? null : aspect / Math.max(1e-8, mediaAspect);

      let next: CropRect;

      if (drag.handle === "move") {
        next = {
          x: Math.min(1 - start.width, Math.max(0, start.x + dx)),
          y: Math.min(1 - start.height, Math.max(0, start.y + dy)),
          width: start.width,
          height: start.height,
        };
      } else {
        let left = start.x;
        let top = start.y;
        let right = start.x + start.width;
        let bottom = start.y + start.height;
        const h = drag.handle;

        if (h.includes("w") || h === "w") left = start.x + dx;
        if (h.includes("e") || h === "e") right = start.x + start.width + dx;
        if (h.includes("n") || h === "n") top = start.y + dy;
        if (h.includes("s") || h === "s") bottom = start.y + start.height + dy;

        if (normAspect !== null) {
          const isCorner = h.length === 2;
          if (isCorner) {
            const anchorX = h.includes("w") ? right : left;
            const anchorY = h.includes("n") ? bottom : top;
            let width = Math.abs(right - left);
            let height = width / normAspect;
            if (h.includes("n")) {
              top = anchorY - height;
              bottom = anchorY;
            } else {
              top = anchorY;
              bottom = anchorY + height;
            }
            if (h.includes("w")) {
              left = anchorX - width;
              right = anchorX;
            } else {
              left = anchorX;
              right = anchorX + width;
            }
            if (top < 0 || bottom > 1) {
              height = Math.min(1, Math.max(MIN_NORM, bottom - top));
              if (top < 0) {
                top = 0;
                bottom = height;
              }
              if (bottom > 1) {
                bottom = 1;
                top = 1 - height;
              }
              width = height * normAspect;
              if (h.includes("w")) {
                left = anchorX - width;
                right = anchorX;
              } else {
                left = anchorX;
                right = anchorX + width;
              }
            }
          } else {
            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            let width = Math.max(MIN_NORM, right - left);
            let height = Math.max(MIN_NORM, bottom - top);
            if (h === "e" || h === "w") {
              height = width / normAspect;
              top = cy - height / 2;
              bottom = cy + height / 2;
            } else {
              width = height * normAspect;
              left = cx - width / 2;
              right = cx + width / 2;
            }
          }
        }

        if (right < left) [left, right] = [right, left];
        if (bottom < top) [top, bottom] = [bottom, top];

        next = clampCrop({
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        });
      }

      setDraft(next);
    },
    [stageBox.h, stageBox.w, mediaAspect, preset],
  );

  useEffect(() => {
    if (!open) return;
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [open, onPointerMove]);

  const startDrag = (handle: Handle) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (stageBox.w < 2 || stageBox.h < 2) return;
    dragRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      start: { ...draft },
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  if (!open) return null;

  if (!clip || !media) {
    return (
      <div className="crop-dialog" role="presentation" onClick={close}>
        <div
          className="crop-dialog__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-dialog-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="crop-dialog__header">
            <h2 id="crop-dialog-title" className="crop-dialog__title">
              Crop
            </h2>
          </div>
          <div className="crop-dialog__body">
            <p className="crop-dialog__status crop-dialog__status--error">
              Select a video or image clip to crop.
            </p>
          </div>
          <div className="crop-dialog__footer">
            <button type="button" className="crop-dialog__btn" onClick={close}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const rectStyle = {
    left: `${draft.x * 100}%`,
    top: `${draft.y * 100}%`,
    width: `${draft.width * 100}%`,
    height: `${draft.height * 100}%`,
  };

  return (
    <div className="crop-dialog" role="presentation" onClick={close}>
      <div
        className="crop-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crop-dialog__header">
          <h2 id="crop-dialog-title" className="crop-dialog__title">
            Crop
          </h2>
        </div>

        <div className="crop-dialog__body">
          <div className="crop-dialog__stage-wrap">
            <div
              className="crop-dialog__stage"
              ref={stageRef}
              style={{
                width: stageDisplay.width,
                height: stageDisplay.height,
              }}
            >
              <canvas
                ref={canvasRef}
                className="crop-dialog__media"
                aria-label="Crop preview"
              />
              {ready && stageBox.w > 0 ? (
                <div
                  className="crop-dialog__rect"
                  style={rectStyle}
                  onPointerDown={startDrag("move")}
                >
                  {(
                    [
                      "nw",
                      "ne",
                      "sw",
                      "se",
                      "n",
                      "s",
                      "e",
                      "w",
                    ] as const
                  ).map((h) => (
                    <span
                      key={h}
                      className={`crop-dialog__handle crop-dialog__handle--${h}`}
                      onPointerDown={startDrag(h)}
                    />
                  ))}
                </div>
              ) : null}
              {loading && !ready ? (
                <div className="crop-dialog__loading" aria-live="polite">
                  Loading media…
                </div>
              ) : null}
            </div>
          </div>

          {isVideo ? (
            <div className="crop-dialog__playback">
              <button
                type="button"
                className="crop-dialog__play"
                aria-label={previewPlaying ? "Pause" : "Play"}
                title={previewPlaying ? "Pause" : "Play"}
                disabled={!ready || Boolean(error)}
                onClick={() => togglePreviewPlay()}
              >
                {previewPlaying ? (
                  <IconPause size={14} />
                ) : (
                  <IconPlay size={14} />
                )}
              </button>
              <button
                type="button"
                className="crop-dialog__btn crop-dialog__btn--ghost"
                disabled={!ready}
                onClick={seekToMarker}
              >
                Marker
              </button>
              <div className="crop-dialog__scrub">
                <div
                  ref={scrubTrackRef}
                  className={
                    scrubbing
                      ? "crop-dialog__scrub-track crop-dialog__scrub-track--active"
                      : "crop-dialog__scrub-track"
                  }
                  role="slider"
                  aria-label="Crop preview timeline"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(rangeDur * 1000)}
                  aria-valuenow={Math.round((previewSec - rangeStart) * 1000)}
                  tabIndex={ready ? 0 : -1}
                  onPointerDown={onScrubPointerDown}
                  onPointerMove={onScrubPointerMove}
                  onPointerUp={onScrubPointerUp}
                  onPointerCancel={onScrubPointerUp}
                  onKeyDown={(e) => {
                    if (!ready) return;
                    const step = 1 / Math.max(1, fps);
                    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault();
                      stopPreview();
                      const delta = e.key === "ArrowLeft" ? -step : step;
                      scheduleScrubSeek(
                        clampSourceSec(currentSourceSecRef.current + delta),
                      );
                    }
                  }}
                >
                  <div
                    className="crop-dialog__scrub-fill"
                    style={{ width: `${scrubProgress * 100}%` }}
                  />
                  <div
                    className="crop-dialog__scrub-marker"
                    style={{ left: `${markerProgress * 100}%` }}
                    title="Playhead marker"
                    aria-hidden
                  />
                  <div
                    className="crop-dialog__scrub-thumb"
                    style={{ left: `${scrubProgress * 100}%` }}
                  />
                </div>
                <span className="crop-dialog__scrub-time">
                  {formatPreviewClock(previewSec)}
                </span>
              </div>
            </div>
          ) : null}

          <div className="crop-dialog__presets" role="group" aria-label="Aspect">
            {(
              [
                ["original", "Original"],
                ["free", "Free"],
                ["16:9", "16:9"],
                ["9:16", "9:16"],
                ["1:1", "1:1"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={
                  preset === id
                    ? "crop-dialog__preset crop-dialog__preset--active"
                    : "crop-dialog__preset"
                }
                onClick={() => selectPreset(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {error ? (
            <p className="crop-dialog__status crop-dialog__status--error">
              {error}
            </p>
          ) : (
            <p className="crop-dialog__status">
              Drag the box to crop. Apply writes a source crop on this clip.
            </p>
          )}
        </div>

        <div className="crop-dialog__footer">
          <button type="button" className="crop-dialog__btn" onClick={reset}>
            Reset
          </button>
          <button type="button" className="crop-dialog__btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="crop-dialog__btn crop-dialog__btn--primary"
            onClick={apply}
            disabled={!ready || Boolean(error)}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
