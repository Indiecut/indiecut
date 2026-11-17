import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CAPTION_CUSTOM_PRESET_ID } from "../ai/captions/captionStylePresets";
import {
  activeCaptionCue,
  resolveCaptionCueOffsetX,
  resolveCaptionCueOffsetY,
  resolveCaptionCueStyle,
  resolveCaptionTextAtLocalMs,
} from "../ai/captions/resolveCaptionText";
import { ensureTextFontsLoaded } from "../fonts/registry";
import { subscribePreviewTextLayouts } from "./previewWorkerClient";
import {
  contentSizeForClip,
  pickClipAtStagePoint,
  stageGeometryForClip,
} from "./previewHitTest";
import {
  patchClipTransformValues,
  type ResolvedTransform,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import type { CaptionCue, CaptionProps, Clip } from "../project/types";
import { findClip, useEditorStore } from "../store/editorStore";
import "./PreviewSelectionOverlay.css";

const ROTATE_GAP_PX = 28;
const MIN_CAPTION_FONT = 12;
const MAX_CAPTION_FONT = 200;

type Corner = "nw" | "ne" | "sw" | "se";

type DragState =
  | {
      kind: "move";
      originX: number;
      originY: number;
      startClientX: number;
      startClientY: number;
      before: ResolvedTransform;
    }
  | {
      kind: "caption-move";
      startClientX: number;
      startClientY: number;
      cueIds: string[];
      startOffsetXByCueId: Record<string, number>;
      startOffsetYByCueId: Record<string, number>;
      before: ResolvedTransform;
    }
  | {
      kind: "scale";
      corner: Corner;
      startClientX: number;
      startClientY: number;
      startDist: number;
      startScale: number;
      before: ResolvedTransform;
    }
  | {
      kind: "caption-scale";
      corner: Corner;
      startClientX: number;
      startClientY: number;
      startDist: number;
      cueIds: string[];
      startFontByCueId: Record<string, number>;
      before: ResolvedTransform;
    }
  | {
      kind: "rotate";
      startAngle: number;
      startRotation: number;
      before: ResolvedTransform;
    };

/** Selected cues on this clip, else the playhead-active cue. */
function captionGestureCueIds(
  clip: Clip,
  localMs: number,
  selectedCueIds: string[],
): string[] {
  const caption = clip.caption;
  if (!caption) return [];
  const onClip = selectedCueIds.filter((id) =>
    caption.cues.some((c) => c.id === id),
  );
  if (onClip.length > 0) return onClip;
  const active = activeCaptionCue(caption.cues, localMs, caption.speed);
  return active ? [active.id] : [];
}

function patchCaptionCues(
  caption: CaptionProps,
  cueIds: string[],
  patchCue: (cue: CaptionCue) => CaptionCue,
): CaptionProps {
  const idSet = new Set(cueIds);
  return {
    ...caption,
    cues: caption.cues.map((c) => (idSet.has(c.id) ? patchCue(c) : c)),
  };
}

/** Dual curved-arrow rotate glyph. */
function RotateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none">
      <path
        d="M19.5 12a7.5 7.5 0 0 0-12.4-5.66"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7.2 3.8v3.6h3.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 12a7.5 7.5 0 0 0 12.4 5.66"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M16.8 20.2v-3.6h-3.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  stageRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * Selection chrome + click-to-select on the preview stage.
 * Text/sticker use native layout size; video/image use fitted frame size.
 * HTML overlay (not drawn into OffscreenCanvas) so handles stay interactive.
 */
export function PreviewSelectionOverlay({ stageRef }: Props) {
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectedCaptionCueIds = useEditorStore((s) => s.selectedCaptionCueIds);
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const tracks = useEditorStore((s) => s.project.tracks);
  const mediaIndex = useEditorStore((s) => s.project.mediaIndex);
  const layoutW = useEditorStore((s) => s.project.width);
  const layoutH = useEditorStore((s) => s.project.height);
  const fps = useEditorStore((s) => s.project.fps);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const previewFitMode = useEditorStore((s) => s.previewFitMode);
  const removeBgEyedropperClipId = useEditorStore(
    (s) => s.removeBgEyedropperClipId,
  );
  const patchClipLive = useEditorStore((s) => s.patchClipLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );
  const selectClip = useEditorStore((s) => s.selectClip);
  const toggleClipSelection = useEditorStore((s) => s.toggleClipSelection);
  const selectCaptionCue = useEditorStore((s) => s.selectCaptionCue);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [fontsEpoch, setFontsEpoch] = useState(0);
  const [textLayoutEpoch, setTextLayoutEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void ensureTextFontsLoaded().then(() => {
      if (!cancelled) setFontsEpoch((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribePreviewTextLayouts(() => {
    setTextLayoutEpoch((n) => n + 1);
  }), []);

  const dragRef = useRef<DragState | null>(null);
  const tracksBeforeRef = useRef(tracks);

  const selected = selectedClipId
    ? findClip(tracks, selectedClipId)
    : null;

  const overlayClip =
    selected &&
    (selected.clip.kind === "text" ||
      selected.clip.kind === "caption" ||
      selected.clip.kind === "sticker" ||
      selected.clip.kind === "video" ||
      selected.clip.kind === "image") &&
    !selected.track.locked &&
    !selected.track.hidden &&
    clipLocalMs(playheadMs, selected.clip) !== null
      ? selected.clip
      : null;

  // Ensure the active caption/text face is in document.fonts before measuring.
  useEffect(() => {
    if (!overlayClip) return;
    if (overlayClip.kind !== "text" && overlayClip.kind !== "caption") return;
    const local = clipLocalMs(playheadMs, overlayClip);
    if (local === null) return;
    const text =
      overlayClip.kind === "caption"
        ? resolveCaptionTextAtLocalMs(overlayClip, local)
        : (overlayClip.text ?? null);
    if (!text) return;
    const family = (text.fontFamily || "system-ui").split(",")[0]?.trim() ||
      "system-ui";
    const weight = text.fontWeight ?? 700;
    const size = Math.max(8, text.fontSize ?? 48);
    const style = text.fontStyle === "italic" ? "italic" : "normal";
    const fonts = typeof document !== "undefined" ? document.fonts : null;
    if (!fonts?.load) return;
    let cancelled = false;
    void fonts
      .load(`${style} ${weight} ${size}px ${family}`)
      .then(() => {
        if (!cancelled) setFontsEpoch((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [overlayClip, playheadMs]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setStageSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(stage);
    const rect = stage.getBoundingClientRect();
    setStageSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, [stageRef]);

  const contentSize = useMemo(() => {
    if (!overlayClip) return null;
    // fontsEpoch / textLayoutEpoch invalidate when faces or worker layouts change.
    void fontsEpoch;
    void textLayoutEpoch;
    return contentSizeForClip({
      clip: overlayClip,
      playheadMs,
      mediaIndex,
      layoutW,
      layoutH,
      previewFitMode,
    });
  }, [
    overlayClip,
    mediaIndex,
    layoutW,
    layoutH,
    previewFitMode,
    playheadMs,
    fontsEpoch,
    textLayoutEpoch,
  ]);

  const localMs = overlayClip
    ? clipLocalMs(playheadMs, overlayClip)
    : null;

  // v1: even when transform3d is enabled, handles use the 2D AABB
  // (position/scale). Orientation is edited in the inspector 3D tab.
  const geometry = useMemo(() => {
    if (!overlayClip || !contentSize || localMs === null) return null;
    return stageGeometryForClip({
      clip: overlayClip,
      contentSize,
      stageW: stageSize.w,
      stageH: stageSize.h,
      layoutW,
      layoutH,
      localMs,
    });
  }, [overlayClip, contentSize, stageSize, layoutW, layoutH, localMs]);

  const applyTransform = useCallback(
    (clip: Clip, next: Partial<ResolvedTransform>) => {
      const local = clipLocalMs(
        useEditorStore.getState().project.playheadMs,
        clip,
      );
      if (local === null) return;
      const patch = patchClipTransformValues(clip, next, local, fps);
      patchClipLive(clip.id, patch);
    },
    [fps, patchClipLive],
  );

  const applyCaptionCuePatch = useCallback(
    (
      clip: Clip,
      cueIds: string[],
      patchCue: (cue: CaptionCue) => CaptionCue,
    ) => {
      if (!clip.caption || cueIds.length === 0) return;
      patchClipLive(clip.id, {
        caption: patchCaptionCues(clip.caption, cueIds, patchCue),
      });
    },
    [patchClipLive],
  );

  const beginGesture = useCallback(() => {
    tracksBeforeRef.current = structuredClone(
      useEditorStore.getState().project.tracks,
    );
  }, []);

  const endGesture = useCallback(() => {
    if (!overlayClip || !dragRef.current) return;
    const before = tracksBeforeRef.current;
    const after = useEditorStore.getState().project.tracks;
    const dragKind = dragRef.current.kind;
    const label =
      dragKind === "caption-scale" || dragKind === "caption-move"
        ? "Caption cue"
        : "Transform";
    commitTracksTransition(before, after, label);
    dragRef.current = null;
  }, [commitTracksTransition, overlayClip]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !overlayClip || !geometry) return;
      const sx = stageSize.w / Math.max(1, layoutW);
      const sy = stageSize.h / Math.max(1, layoutH);

      if (drag.kind === "move") {
        const dx = (e.clientX - drag.startClientX) / sx;
        const dy = (e.clientY - drag.startClientY) / sy;
        applyTransform(overlayClip, {
          x: drag.originX + dx,
          y: drag.originY + dy,
        });
        return;
      }

      if (drag.kind === "caption-move") {
        const dx = (e.clientX - drag.startClientX) / sx;
        const dy = (e.clientY - drag.startClientY) / sy;
        const liveClip =
          findClip(useEditorStore.getState().project.tracks, overlayClip.id)
            ?.clip ?? overlayClip;
        applyCaptionCuePatch(liveClip, drag.cueIds, (cue) => ({
          ...cue,
          offsetX: Math.round(
            (drag.startOffsetXByCueId[cue.id] ??
              resolveCaptionCueOffsetX(
                liveClip.caption!,
                cue,
                drag.before.x,
              )) + dx,
          ),
          offsetY: Math.round(
            (drag.startOffsetYByCueId[cue.id] ??
              resolveCaptionCueOffsetY(liveClip.caption!, cue)) + dy,
          ),
          position:
            cue.position ??
            liveClip.caption?.position ??
            "bottom",
        }));
        return;
      }

      if (drag.kind === "scale") {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + geometry.centerX;
        const cy = rect.top + geometry.centerY;
        const curDist = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (drag.startDist < 1) return;
        const ratio = curDist / drag.startDist;
        const nextScale = Math.min(
          12,
          Math.max(0.05, drag.startScale * ratio),
        );
        applyTransform(overlayClip, {
          scaleX: nextScale,
          scaleY: nextScale,
          uniformScale: true,
        });
        return;
      }

      if (drag.kind === "caption-scale") {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + geometry.centerX;
        const cy = rect.top + geometry.centerY;
        const curDist = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (drag.startDist < 1) return;
        const ratio = curDist / drag.startDist;
        const liveClip =
          findClip(useEditorStore.getState().project.tracks, overlayClip.id)
            ?.clip ?? overlayClip;
        applyCaptionCuePatch(liveClip, drag.cueIds, (cue) => {
          const start =
            drag.startFontByCueId[cue.id] ??
            resolveCaptionCueStyle(liveClip.caption!, cue).fontSize ??
            36;
          const fontSize = Math.min(
            MAX_CAPTION_FONT,
            Math.max(MIN_CAPTION_FONT, Math.round(start * ratio)),
          );
          return {
            ...cue,
            style: {
              ...resolveCaptionCueStyle(liveClip.caption!, cue),
              ...cue.style,
              fontSize,
              stylePresetId: CAPTION_CUSTOM_PRESET_ID,
            },
          };
        });
        return;
      }

      if (drag.kind === "rotate") {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + geometry.centerX;
        const cy = rect.top + geometry.centerY;
        const angle =
          (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
        let delta = angle - drag.startAngle;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        let nextRotation = drag.startRotation + delta;
        while (nextRotation > 180) nextRotation -= 360;
        while (nextRotation < -180) nextRotation += 360;
        applyTransform(overlayClip, {
          rotation: nextRotation,
        });
      }
    },
    [
      applyCaptionCuePatch,
      applyTransform,
      geometry,
      layoutH,
      layoutW,
      overlayClip,
      stageRef,
      stageSize.h,
      stageSize.w,
    ],
  );

  useEffect(() => {
    const up = () => {
      if (dragRef.current) endGesture();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [endGesture, onPointerMove]);

  const beginMoveForClip = useCallback(
    (
      e: ReactPointerEvent,
      clip: Clip,
      transform: ResolvedTransform,
      local: number,
    ) => {
      beginGesture();
      if (clip.kind === "caption" && clip.caption) {
        const cueIds = captionGestureCueIds(
          clip,
          local,
          useEditorStore.getState().selectedCaptionCueIds,
        );
        if (cueIds.length > 0) {
          const startOffsetXByCueId: Record<string, number> = {};
          const startOffsetYByCueId: Record<string, number> = {};
          for (const id of cueIds) {
            const cue = clip.caption.cues.find((c) => c.id === id);
            startOffsetXByCueId[id] = resolveCaptionCueOffsetX(
              clip.caption,
              cue,
              transform.x,
            );
            startOffsetYByCueId[id] = resolveCaptionCueOffsetY(
              clip.caption,
              cue,
            );
          }
          dragRef.current = {
            kind: "caption-move",
            startClientX: e.clientX,
            startClientY: e.clientY,
            cueIds,
            startOffsetXByCueId,
            startOffsetYByCueId,
            before: { ...transform },
          };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          return;
        }
      }
      dragRef.current = {
        kind: "move",
        originX: transform.x,
        originY: transform.y,
        startClientX: e.clientX,
        startClientY: e.clientY,
        before: { ...transform },
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [beginGesture],
  );

  const onPickPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      // Eyedropper sits above (z-index 6); skip pick while it owns sampling.
      // Mask handles also sit above (z-index 3) with their own pointer-events —
      // empty stage areas still pick / clear through this layer.
      if (removeBgEyedropperClipId) return;
      if (stageSize.w < 2 || stageSize.h < 2) return;

      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const stageX = e.clientX - rect.left;
      const stageY = e.clientY - rect.top;

      const state = useEditorStore.getState();
      const hit = pickClipAtStagePoint({
        stageX,
        stageY,
        stageW: stageSize.w,
        stageH: stageSize.h,
        tracks: state.project.tracks,
        mediaIndex: state.project.mediaIndex,
        playheadMs: state.project.playheadMs,
        layoutW: state.project.width,
        layoutH: state.project.height,
        fps: state.project.fps,
        previewFitMode: state.previewFitMode,
      });

      const additive = e.metaKey || e.ctrlKey;

      if (!hit) {
        e.preventDefault();
        if (!additive) clearSelection();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const samePrimary = state.selectedClipId === hit.clip.id;

      if (hit.clip.kind === "caption" && hit.cueId) {
        if (additive) {
          selectCaptionCue(hit.clip.id, hit.cueId, hit.trackId, "toggle");
          return;
        }
        if (!samePrimary || !state.selectedCaptionCueIds.includes(hit.cueId)) {
          selectCaptionCue(hit.clip.id, hit.cueId, hit.trackId, "replace");
        }
        // Same caption + cue → start move when not playing.
        if (samePrimary && !isPlaying && geometry) {
          const local = clipLocalMs(state.project.playheadMs, hit.clip);
          if (local !== null) {
            beginMoveForClip(e, hit.clip, geometry.transform, local);
          }
        }
        return;
      }

      if (additive) {
        toggleClipSelection(hit.clip.id, hit.trackId);
        return;
      }

      if (!samePrimary) {
        selectClip(hit.clip.id, hit.trackId);
        return;
      }

      // Same selected clip → begin move (when chrome would allow it).
      if (!isPlaying && geometry && overlayClip?.id === hit.clip.id) {
        const local = clipLocalMs(state.project.playheadMs, hit.clip);
        if (local !== null) {
          beginMoveForClip(e, hit.clip, geometry.transform, local);
        }
      }
    },
    [
      beginMoveForClip,
      clearSelection,
      geometry,
      isPlaying,
      overlayClip?.id,
      removeBgEyedropperClipId,
      selectCaptionCue,
      selectClip,
      stageRef,
      stageSize.h,
      stageSize.w,
      toggleClipSelection,
    ],
  );

  const showChrome = Boolean(overlayClip && geometry && !isPlaying);
  const { boxW, boxH, centerX, centerY, rotation, transform } = geometry ?? {
    boxW: 0,
    boxH: 0,
    centerX: 0,
    centerY: 0,
    rotation: 0,
    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      uniformScale: true,
    },
  };

  const startScale = (corner: Corner) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!overlayClip || !geometry || localMs === null) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + centerX;
    const cy = rect.top + centerY;
    beginGesture();
    if (overlayClip.kind === "caption" && overlayClip.caption) {
      const cueIds = captionGestureCueIds(
        overlayClip,
        localMs,
        selectedCaptionCueIds,
      );
      if (cueIds.length > 0) {
        const bakeScale =
          Math.abs((transform.scaleX || 1) - 1) > 0.001
            ? transform.scaleX || 1
            : 1;
        const startFontByCueId: Record<string, number> = {};
        for (const id of cueIds) {
          const cue = overlayClip.caption.cues.find((c) => c.id === id);
          const base =
            resolveCaptionCueStyle(overlayClip.caption, cue).fontSize ?? 36;
          startFontByCueId[id] = Math.min(
            MAX_CAPTION_FONT,
            Math.max(MIN_CAPTION_FONT, Math.round(base * bakeScale)),
          );
        }
        if (bakeScale !== 1) {
          applyCaptionCuePatch(overlayClip, cueIds, (cue) => ({
            ...cue,
            style: {
              ...resolveCaptionCueStyle(overlayClip.caption!, cue),
              ...cue.style,
              fontSize: startFontByCueId[cue.id],
              stylePresetId: CAPTION_CUSTOM_PRESET_ID,
            },
          }));
          applyTransform(overlayClip, {
            scaleX: 1,
            scaleY: 1,
            uniformScale: true,
          });
        }
        dragRef.current = {
          kind: "caption-scale",
          corner,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startDist: Math.hypot(e.clientX - cx, e.clientY - cy),
          cueIds,
          startFontByCueId,
          before: { ...transform, scaleX: 1, scaleY: 1 },
        };
        return;
      }
    }
    dragRef.current = {
      kind: "scale",
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startDist: Math.hypot(e.clientX - cx, e.clientY - cy),
      startScale: transform.scaleX,
      before: { ...transform },
    };
  };

  const startRotate = (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!geometry) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + centerX;
    const cy = rect.top + centerY;
    beginGesture();
    dragRef.current = {
      kind: "rotate",
      startAngle: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI,
      startRotation: transform.rotation,
      before: { ...transform },
    };
  };

  return (
    <div className="preview-selection" aria-hidden={false}>
      <div
        className="preview-selection__pick-layer"
        onPointerDown={onPickPointerDown}
      />
      {showChrome ? (
        <div
          className="preview-selection__box"
          style={{
            width: boxW,
            height: boxH,
            left: centerX,
            top: centerY,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }}
        >
          <span
            className="preview-selection__handle preview-selection__handle--nw"
            onPointerDown={startScale("nw")}
          />
          <span
            className="preview-selection__handle preview-selection__handle--ne"
            onPointerDown={startScale("ne")}
          />
          <span
            className="preview-selection__handle preview-selection__handle--sw"
            onPointerDown={startScale("sw")}
          />
          <span
            className="preview-selection__handle preview-selection__handle--se"
            onPointerDown={startScale("se")}
          />
          <button
            type="button"
            className="preview-selection__rotate"
            style={{ bottom: -(ROTATE_GAP_PX + 10) }}
            aria-label="Rotate"
            onPointerDown={startRotate}
          >
            <RotateIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
