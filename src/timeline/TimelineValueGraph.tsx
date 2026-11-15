import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  evaluateProperty,
  getAnimatable,
  humanizeAnimatablePathForClip,
  KEYFRAME_GRAPH_HEIGHT_PX,
  KEYFRAME_GRAPH_TAB_RAIL_PX,
  listKeyedAnimatablePaths,
  moveKeyframeXY as moveKeyXYOnClip,
  updateKeyframeHandles as updateHandlesOnClip,
  type AnimatablePath,
  type KeyframeHandlePatch,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import { EasingPresetPopover } from "../inspector/EasingPresetPopover";
import type {
  Clip,
  EasingPresetId,
  KeyframeHandle,
  PropertyKeyframe,
  Track,
} from "../project/types";
import { useEditorStore } from "../store/editorStore";

type Props = {
  clip: Clip;
  /** Absolute left (px) matching the clip bar. */
  left: number;
  /** Absolute width (px) matching the clip bar. */
  width: number;
  /** Top offset inside the lane (below the clip bar). */
  top: number;
};

type YFrame = { min: number; max: number };

type DragState =
  | {
      kind: "key";
      keyId: string;
      startClientX: number;
      startClientY: number;
      originMs: number;
      originValue: number;
      tracksBefore: Track[];
      moved: boolean;
    }
  | {
      kind: "handle";
      /** Left key of the segment being edited. */
      leftKeyId: string;
      which: "out" | "in";
      tracksBefore: Track[];
      altBroken: boolean;
      moved: boolean;
    };

const CURVE_SAMPLES = 48;
const PAD_T = 22;
const PAD_B = 10;
const PAD_R = 8;

function applyMoveXY(
  tracks: Track[],
  clipId: string,
  path: AnimatablePath,
  keyId: string,
  toLocalMs: number,
  value: number,
  fps: number,
): Track[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((c) => {
      if (c.id !== clipId) return c;
      const patch = moveKeyXYOnClip(c, path, keyId, toLocalMs, value, fps);
      return Object.keys(patch).length === 0 ? c : { ...c, ...patch };
    }),
  }));
}

function applyHandles(
  tracks: Track[],
  clipId: string,
  path: AnimatablePath,
  leftKeyId: string,
  patch: KeyframeHandlePatch,
): Track[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((c) => {
      if (c.id !== clipId) return c;
      const next = updateHandlesOnClip(c, path, leftKeyId, patch);
      return Object.keys(next).length === 0 ? c : { ...c, ...next };
    }),
  }));
}

function computeYFrame(keys: PropertyKeyframe<number>[]): YFrame {
  if (keys.length === 0) return { min: 0, max: 1 };
  let min = keys[0]!.value;
  let max = keys[0]!.value;
  for (const k of keys) {
    min = Math.min(min, k.value);
    max = Math.max(max, k.value);
  }
  if (Math.abs(max - min) < 1e-6) {
    const pad = Math.max(Math.abs(min) * 0.15, 0.5);
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.15;
  return { min: min - pad, max: max + pad };
}

function segmentPixelSize(
  t0: number,
  t1: number,
  v0: number,
  v1: number,
  xAt: (ms: number) => number,
  yAt: (v: number) => number,
  plotH: number,
): { w: number; h: number; hSigned: number } {
  const w = Math.max(1, xAt(t1) - xAt(t0));
  const dyPx = yAt(v1) - yAt(v0);
  const h = Math.max(Math.abs(dyPx), plotH * 0.2);
  const hSigned = Math.abs(dyPx) < 1 ? (v1 >= v0 ? -h : h) : dyPx;
  return { w, h, hSigned };
}

function handleToScreen(
  which: "out" | "in",
  left: PropertyKeyframe<number>,
  right: PropertyKeyframe<number>,
  handle: KeyframeHandle,
  xAt: (ms: number) => number,
  yAt: (v: number) => number,
  plotH: number,
): { x: number; y: number } {
  const { w, hSigned } = segmentPixelSize(
    left.timeOffsetMs,
    right.timeOffsetMs,
    left.value,
    right.value,
    xAt,
    yAt,
    plotH,
  );
  if (which === "out") {
    return {
      x: xAt(left.timeOffsetMs) + handle.dx * w,
      y: yAt(left.value) + handle.dy * hSigned,
    };
  }
  return {
    x: xAt(left.timeOffsetMs) + handle.dx * w,
    y: yAt(left.value) + handle.dy * hSigned,
  };
}

function screenToHandle(
  which: "out" | "in",
  left: PropertyKeyframe<number>,
  right: PropertyKeyframe<number>,
  clientLocalX: number,
  clientLocalY: number,
  xAt: (ms: number) => number,
  yAt: (v: number) => number,
  plotH: number,
): KeyframeHandle {
  const { w, hSigned } = segmentPixelSize(
    left.timeOffsetMs,
    right.timeOffsetMs,
    left.value,
    right.value,
    xAt,
    yAt,
    plotH,
  );
  const originX = xAt(left.timeOffsetMs);
  const originY = yAt(left.value);
  let dx = (clientLocalX - originX) / w;
  let dy = (clientLocalY - originY) / hSigned;
  if (which === "out") {
    dx = Math.min(1, Math.max(0, dx));
  } else {
    dx = Math.min(1, Math.max(0, dx));
  }
  if (!Number.isFinite(dy)) dy = 0;
  return { dx, dy };
}

/** Screen-space offset of a key's outHandle relative to the key (next segment). */
function outOffsetFromKey(
  key: PropertyKeyframe<number>,
  next: PropertyKeyframe<number>,
  xAt: (ms: number) => number,
  yAt: (v: number) => number,
  plotH: number,
): { x: number; y: number; w: number; hSigned: number } {
  const { w, hSigned } = segmentPixelSize(
    key.timeOffsetMs,
    next.timeOffsetMs,
    key.value,
    next.value,
    xAt,
    yAt,
    plotH,
  );
  return {
    x: key.outHandle.dx * w,
    y: key.outHandle.dy * hSigned,
    w,
    hSigned,
  };
}

/**
 * Screen-space offset of a key's inHandle relative to the key (prev segment).
 * inHandle lives in the previous segment's unit square.
 */
function inOffsetFromKey(
  prev: PropertyKeyframe<number>,
  key: PropertyKeyframe<number>,
  xAt: (ms: number) => number,
  yAt: (v: number) => number,
  plotH: number,
): { x: number; y: number; w: number; hSigned: number } {
  const { w, hSigned } = segmentPixelSize(
    prev.timeOffsetMs,
    key.timeOffsetMs,
    prev.value,
    key.value,
    xAt,
    yAt,
    plotH,
  );
  const absX = xAt(prev.timeOffsetMs) + key.inHandle.dx * w;
  const absY = yAt(prev.value) + key.inHandle.dy * hSigned;
  return {
    x: absX - xAt(key.timeOffsetMs),
    y: absY - yAt(key.value),
    w,
    hSigned,
  };
}

/** Convert a screen offset from the key back into prev-segment inHandle. */
function inHandleFromOffset(
  prev: PropertyKeyframe<number>,
  key: PropertyKeyframe<number>,
  ox: number,
  oy: number,
  xAt: (ms: number) => number,
  yAt: (v: number) => number,
  plotH: number,
): KeyframeHandle {
  const { w, hSigned } = segmentPixelSize(
    prev.timeOffsetMs,
    key.timeOffsetMs,
    prev.value,
    key.value,
    xAt,
    yAt,
    plotH,
  );
  const absX = xAt(key.timeOffsetMs) + ox;
  const absY = yAt(key.value) + oy;
  const dx = (absX - xAt(prev.timeOffsetMs)) / w;
  const dy = (absY - yAt(prev.value)) / hSigned;
  return {
    dx: Math.min(1, Math.max(0, Number.isFinite(dx) ? dx : 0.67)),
    dy: Number.isFinite(dy) ? dy : 0,
  };
}

/** Convert a screen offset from the key into next-segment outHandle. */
function outHandleFromOffset(
  key: PropertyKeyframe<number>,
  next: PropertyKeyframe<number>,
  ox: number,
  oy: number,
  xAt: (ms: number) => number,
  yAt: (v: number) => number,
  plotH: number,
): KeyframeHandle {
  const { w, hSigned } = segmentPixelSize(
    key.timeOffsetMs,
    next.timeOffsetMs,
    key.value,
    next.value,
    xAt,
    yAt,
    plotH,
  );
  const dx = ox / w;
  const dy = oy / hSigned;
  return {
    dx: Math.min(1, Math.max(0, Number.isFinite(dx) ? dx : 0.33)),
    dy: Number.isFinite(dy) ? dy : 0,
  };
}

function mirrorScreenOffset(
  draggedX: number,
  draggedY: number,
  oppositeLen: number,
): { x: number; y: number } {
  const len = Math.hypot(draggedX, draggedY) || 1;
  return {
    x: (-draggedX / len) * oppositeLen,
    y: (-draggedY / len) * oppositeLen,
  };
}

/**
 * Single-property value graph under a clip.
 */
export function TimelineValueGraph({ clip, left, width, top }: Props) {
  const fps = useEditorStore((s) => s.project.fps);
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const focusedPath = useEditorStore((s) => s.focusedAnimatablePath);
  const selectedKey = useEditorStore((s) => s.selectedTimelineKeyframe);
  const selectedSeg = useEditorStore((s) => s.selectedEasingSegment);
  const setFocusedAnimatablePath = useEditorStore(
    (s) => s.setFocusedAnimatablePath,
  );
  const selectTimelineKeyframe = useEditorStore((s) => s.selectTimelineKeyframe);
  const selectEasingSegment = useEditorStore((s) => s.selectEasingSegment);
  const patchTracksLive = useEditorStore((s) => s.patchTracksLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );
  const applyEasingPreset = useEditorStore((s) => s.applyEasingPreset);
  const toggleKeyframe = useEditorStore((s) => s.toggleKeyframe);
  const setExpandedKeyframeClipId = useEditorStore(
    (s) => s.setExpandedKeyframeClipId,
  );
  const setKeyframeDrawerMode = useEditorStore((s) => s.setKeyframeDrawerMode);

  const paths = useMemo(() => listKeyedAnimatablePaths(clip), [clip]);
  const path: AnimatablePath | null =
    focusedPath && paths.includes(focusedPath)
      ? focusedPath
      : (paths[0] ?? null);

  useEffect(() => {
    if (path && focusedPath !== path) {
      setFocusedAnimatablePath(path);
    }
  }, [path, focusedPath, setFocusedAnimatablePath]);

  const prop = path ? getAnimatable(clip, path) : null;
  const keys = useMemo(
    () =>
      [...(prop?.keyframes ?? [])].sort(
        (a, b) => a.timeOffsetMs - b.timeOffsetMs,
      ),
    [prop?.keyframes],
  );

  const [yFrame, setYFrame] = useState<YFrame>(() => computeYFrame(keys));
  const [fitTick, setFitTick] = useState(0);
  const prevPathRef = useRef(path);

  useEffect(() => {
    if (prevPathRef.current !== path) {
      prevPathRef.current = path;
      setYFrame(computeYFrame(keys));
    }
  }, [path, keys]);

  useEffect(() => {
    if (fitTick > 0) setYFrame(computeYFrame(keys));
  }, [fitTick, keys]);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingTracksRef = useRef<Track[] | null>(null);

  const [popover, setPopover] = useState<{
    leftKeyId: string;
    x: number;
    y: number;
  } | null>(null);

  const tabW = Math.min(KEYFRAME_GRAPH_TAB_RAIL_PX, Math.max(72, width * 0.28));
  const plotW = Math.max(1, width - tabW);
  const plotH = KEYFRAME_GRAPH_HEIGHT_PX;
  const innerH = Math.max(1, plotH - PAD_T - PAD_B);
  const innerW = Math.max(1, plotW - PAD_R);

  const xAt = useCallback(
    (ms: number) => {
      const dur = Math.max(1e-6, clip.durationMs);
      return (Math.min(Math.max(0, ms), clip.durationMs) / dur) * innerW;
    },
    [clip.durationMs, innerW],
  );

  const yAt = useCallback(
    (v: number) => {
      const span = Math.max(1e-6, yFrame.max - yFrame.min);
      const t = (v - yFrame.min) / span;
      return PAD_T + (1 - t) * innerH;
    },
    [innerH, yFrame.max, yFrame.min],
  );

  const clientToPlot = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const sx = rect.width > 0 ? plotW / rect.width : 1;
      const sy = rect.height > 0 ? plotH / rect.height : 1;
      return {
        x: (clientX - rect.left) * sx,
        y: (clientY - rect.top) * sy,
      };
    },
    [plotH, plotW],
  );

  const plotToValue = useCallback(
    (px: number, py: number) => {
      const dur = Math.max(1e-6, clip.durationMs);
      const ms = Math.min(
        Math.max(0, (px / innerW) * dur),
        Math.max(0, clip.durationMs),
      );
      const span = Math.max(1e-6, yFrame.max - yFrame.min);
      const t = 1 - (py - PAD_T) / innerH;
      const value = yFrame.min + t * span;
      return { ms, value };
    },
    [clip.durationMs, innerH, innerW, yFrame.max, yFrame.min],
  );

  const flushLive = useCallback(() => {
    rafRef.current = null;
    const next = pendingTracksRef.current;
    if (!next) return;
    pendingTracksRef.current = null;
    patchTracksLive(next);
  }, [patchTracksLive]);

  const scheduleLive = useCallback(
    (tracks: Track[]) => {
      pendingTracksRef.current = tracks;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(flushLive);
    },
    [flushLive],
  );

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const localPlayhead =
    clipLocalMs(playheadMs, clip) ??
    Math.min(Math.max(0, playheadMs - clip.startMs), clip.durationMs);

  const curvePath = useMemo(() => {
    if (!prop || keys.length === 0 || clip.durationMs <= 0) return "";
    const parts: string[] = [];
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const ms = (i / CURVE_SAMPLES) * clip.durationMs;
      const v = evaluateProperty(prop, ms);
      const x = xAt(ms);
      const y = yAt(v);
      parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return parts.join(" ");
  }, [clip.durationMs, keys.length, prop, xAt, yAt]);

  const activeSegLeftId =
    selectedSeg?.clipId === clip.id && selectedSeg.path === path
      ? selectedSeg.leftKeyId
      : selectedKey?.clipId === clip.id &&
          selectedKey.path === path &&
          keys.length >= 2
        ? (() => {
            const idx = keys.findIndex((k) => k.id === selectedKey.keyId);
            if (idx < 0) return null;
            if (idx < keys.length - 1) return keys[idx]!.id;
            return keys[idx - 1]?.id ?? null;
          })()
        : keys.length >= 2
          ? keys[0]!.id
          : null;

  const activeSeg = useMemo(() => {
    if (!activeSegLeftId) return null;
    const i = keys.findIndex((k) => k.id === activeSegLeftId);
    if (i < 0 || i >= keys.length - 1) return null;
    return { left: keys[i]!, right: keys[i + 1]! };
  }, [activeSegLeftId, keys]);

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      flushLive();
    }
    if (drag.moved) {
      const after = useEditorStore.getState().project.tracks;
      const label =
        drag.kind === "key" ? "Move keyframe" : "Edit keyframe curve";
      commitTracksTransition(drag.tracksBefore, after, label);
      if (drag.kind === "key") {
        setFitTick((n) => n + 1);
      }
    }
    dragRef.current = null;
  }, [commitTracksTransition, flushLive]);

  const moveDrag = useCallback(
    (clientX: number, clientY: number, altKey: boolean) => {
      const drag = dragRef.current;
      if (!drag || !path) return;

      if (drag.kind === "key") {
        const dx = clientX - drag.startClientX;
        const dy = clientY - drag.startClientY;
        if (!drag.moved && Math.hypot(dx, dy) < 2) return;
        drag.moved = true;
        const origin = clientToPlot(drag.startClientX, drag.startClientY);
        const cur = clientToPlot(clientX, clientY);
        const deltaMs =
          plotToValue(cur.x, cur.y).ms - plotToValue(origin.x, origin.y).ms;
        const deltaV =
          plotToValue(cur.x, cur.y).value -
          plotToValue(origin.x, origin.y).value;
        const toMs = Math.min(
          Math.max(0, drag.originMs + deltaMs),
          Math.max(0, clip.durationMs),
        );
        const toV = drag.originValue + deltaV;
        const next = applyMoveXY(
          structuredClone(drag.tracksBefore),
          clip.id,
          path,
          drag.keyId,
          toMs,
          toV,
          fps,
        );
        scheduleLive(next);
        selectTimelineKeyframe({
          clipId: clip.id,
          path,
          keyId: drag.keyId,
        });
        return;
      }

      const leftIdx = keys.findIndex((k) => k.id === drag.leftKeyId);
      if (leftIdx < 0 || leftIdx >= keys.length - 1) return;
      const leftK = keys[leftIdx]!;
      const rightK = keys[leftIdx + 1]!;
      const prevK = leftIdx > 0 ? keys[leftIdx - 1]! : null;
      const nextAfterRight =
        leftIdx + 2 < keys.length ? keys[leftIdx + 2]! : null;
      const pt = clientToPlot(clientX, clientY);
      const broken = drag.altBroken || altKey;
      drag.moved = true;

      if (drag.which === "out") {
        // Drag left key's outHandle (this segment). Aligned → mirror left.inHandle.
        const outHandle = screenToHandle(
          "out",
          leftK,
          rightK,
          pt.x,
          pt.y,
          xAt,
          yAt,
          innerH,
        );
        const patch: KeyframeHandlePatch = {
          outHandle,
          tangentMode: broken ? "broken" : "aligned",
        };
        if (!broken && prevK) {
          const dragged = outOffsetFromKey(
            { ...leftK, outHandle },
            rightK,
            xAt,
            yAt,
            innerH,
          );
          const opp = inOffsetFromKey(prevK, leftK, xAt, yAt, innerH);
          const oppLen = Math.hypot(opp.x, opp.y) || 24;
          const mirrored = mirrorScreenOffset(dragged.x, dragged.y, oppLen);
          patch.inHandleOnSelf = inHandleFromOffset(
            prevK,
            leftK,
            mirrored.x,
            mirrored.y,
            xAt,
            yAt,
            innerH,
          );
        }
        scheduleLive(
          applyHandles(
            structuredClone(drag.tracksBefore),
            clip.id,
            path,
            drag.leftKeyId,
            patch,
          ),
        );
      } else {
        // Drag right key's inHandle (this segment). Aligned → mirror right.outHandle.
        const inHandle = screenToHandle(
          "in",
          leftK,
          rightK,
          pt.x,
          pt.y,
          xAt,
          yAt,
          innerH,
        );
        const patch: KeyframeHandlePatch = {
          inHandle,
          tangentMode: broken ? "broken" : "aligned",
        };
        if (!broken && nextAfterRight) {
          const opp = outOffsetFromKey(rightK, nextAfterRight, xAt, yAt, innerH);
          const oppLen = Math.hypot(opp.x, opp.y) || 24;
          // Incoming control absolute → offset from right key
          const { w, hSigned } = segmentPixelSize(
            leftK.timeOffsetMs,
            rightK.timeOffsetMs,
            leftK.value,
            rightK.value,
            xAt,
            yAt,
            innerH,
          );
          const absX = xAt(leftK.timeOffsetMs) + inHandle.dx * w;
          const absY = yAt(leftK.value) + inHandle.dy * hSigned;
          const draggedX = absX - xAt(rightK.timeOffsetMs);
          const draggedY = absY - yAt(rightK.value);
          const mirrored = mirrorScreenOffset(draggedX, draggedY, oppLen);
          patch.outHandleOnRight = outHandleFromOffset(
            rightK,
            nextAfterRight,
            mirrored.x,
            mirrored.y,
            xAt,
            yAt,
            innerH,
          );
        }
        scheduleLive(
          applyHandles(
            structuredClone(drag.tracksBefore),
            clip.id,
            path,
            drag.leftKeyId,
            patch,
          ),
        );
      }
    },
    [
      clientToPlot,
      clip.durationMs,
      clip.id,
      fps,
      innerH,
      keys,
      path,
      plotToValue,
      scheduleLive,
      selectTimelineKeyframe,
      xAt,
      yAt,
    ],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      moveDrag(e.clientX, e.clientY, e.altKey);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      endDrag();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endDrag, moveDrag]);

  const onKeyPointerDown = useCallback(
    (e: ReactPointerEvent, key: PropertyKeyframe<number>) => {
      if (!path) return;
      e.preventDefault();
      e.stopPropagation();
      selectTimelineKeyframe({ clipId: clip.id, path, keyId: key.id });
      dragRef.current = {
        kind: "key",
        keyId: key.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originMs: key.timeOffsetMs,
        originValue: key.value,
        tracksBefore: structuredClone(
          useEditorStore.getState().project.tracks,
        ),
        moved: false,
      };
    },
    [clip.id, path, selectTimelineKeyframe],
  );

  const onHandlePointerDown = useCallback(
    (
      e: ReactPointerEvent,
      leftKeyId: string,
      which: "out" | "in",
    ) => {
      if (!path) return;
      e.preventDefault();
      e.stopPropagation();
      selectEasingSegment({ clipId: clip.id, path, leftKeyId });
      dragRef.current = {
        kind: "handle",
        leftKeyId,
        which,
        tracksBefore: structuredClone(
          useEditorStore.getState().project.tracks,
        ),
        altBroken: e.altKey,
        moved: false,
      };
    },
    [clip.id, path, selectEasingSegment],
  );

  const onSegmentClick = useCallback(
    (e: React.MouseEvent, leftKeyId: string) => {
      if (!path) return;
      e.preventDefault();
      e.stopPropagation();
      selectEasingSegment({ clipId: clip.id, path, leftKeyId });
    },
    [clip.id, path, selectEasingSegment],
  );

  const onSegmentContextMenu = useCallback(
    (e: React.MouseEvent, leftKeyId: string) => {
      if (!path) return;
      e.preventDefault();
      e.stopPropagation();
      selectEasingSegment({ clipId: clip.id, path, leftKeyId });
      setPopover({ leftKeyId, x: e.clientX, y: e.clientY });
    },
    [clip.id, path, selectEasingSegment],
  );

  const commitPreset = useCallback(
    (leftKeyId: string, preset: "none" | "ease_in" | "ease_out") => {
      if (!path) return;
      const before = structuredClone(
        useEditorStore.getState().project.tracks,
      );
      applyEasingPreset(clip.id, path, leftKeyId, preset);
      const after = useEditorStore.getState().project.tracks;
      commitTracksTransition(before, after, "Easing preset");
    },
    [applyEasingPreset, clip.id, commitTracksTransition, path],
  );

  const onToggleKeyAtPlayhead = useCallback(() => {
    if (!path) return;
    const before = structuredClone(
      useEditorStore.getState().project.tracks,
    );
    toggleKeyframe(clip.id, path);
    const after = useEditorStore.getState().project.tracks;
    commitTracksTransition(before, after, "Toggle keyframe");
    setFitTick((n) => n + 1);
  }, [clip.id, commitTracksTransition, path, toggleKeyframe]);

  if (paths.length === 0 || !path || clip.durationMs <= 0) return null;

  const yTicks = [yFrame.max, (yFrame.min + yFrame.max) / 2, yFrame.min];
  const playX = xAt(localPlayhead);

  const outScreen =
    activeSeg &&
    handleToScreen(
      "out",
      activeSeg.left,
      activeSeg.right,
      activeSeg.left.outHandle,
      xAt,
      yAt,
      innerH,
    );
  const inScreen =
    activeSeg &&
    handleToScreen(
      "in",
      activeSeg.left,
      activeSeg.right,
      activeSeg.right.inHandle,
      xAt,
      yAt,
      innerH,
    );

  const activePresetId = (() => {
    if (!activeSeg) return undefined;
    const id = activeSeg.left.easingPresetId;
    return id === "custom" ? undefined : id;
  })();

  return (
    <div
      className="timeline-kf-graph"
      style={{
        left,
        width,
        top,
        height: KEYFRAME_GRAPH_HEIGHT_PX,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="timeline-kf-graph__tabs" style={{ width: tabW }}>
        {paths.map((p) => {
          const active = p === path;
          return (
            <button
              key={p}
              type="button"
              className={
                active
                  ? "timeline-kf-graph__tab timeline-kf-graph__tab--active"
                  : "timeline-kf-graph__tab"
              }
              title={humanizeAnimatablePathForClip(clip, p)}
              onClick={() => setFocusedAnimatablePath(p)}
            >
              {humanizeAnimatablePathForClip(clip, p)}
            </button>
          );
        })}
      </div>

      <div className="timeline-kf-graph__main">
        <div className="timeline-kf-graph__toolbar">
          <button
            type="button"
            className="timeline-kf-graph__tool"
            title="Linear"
            disabled={!activeSegLeftId}
            onClick={() =>
              activeSegLeftId && commitPreset(activeSegLeftId, "none")
            }
          >
            ⟋
          </button>
          <button
            type="button"
            className="timeline-kf-graph__tool"
            title="Ease In"
            disabled={!activeSegLeftId}
            onClick={() =>
              activeSegLeftId && commitPreset(activeSegLeftId, "ease_in")
            }
          >
            ⤴
          </button>
          <button
            type="button"
            className="timeline-kf-graph__tool"
            title="Ease Out"
            disabled={!activeSegLeftId}
            onClick={() =>
              activeSegLeftId && commitPreset(activeSegLeftId, "ease_out")
            }
          >
            ⤵
          </button>
          <button
            type="button"
            className="timeline-kf-graph__tool"
            title="Add / remove key at playhead"
            onClick={onToggleKeyAtPlayhead}
          >
            ◆
          </button>
          <button
            type="button"
            className="timeline-kf-graph__tool"
            title="Fit vertical range"
            onClick={() => setFitTick((n) => n + 1)}
          >
            ⤢
          </button>
          <button
            type="button"
            className="timeline-kf-graph__tool"
            title="Show dope sheet (Alt+K)"
            onClick={() => setKeyframeDrawerMode("dope")}
          >
            ⌒
          </button>
          <button
            type="button"
            className="timeline-kf-graph__tool"
            title="Close keyframes"
            aria-label="Close keyframes"
            onClick={() => setExpandedKeyframeClipId(null)}
          >
            ✕
          </button>
        </div>

        <svg
          ref={svgRef}
          className="timeline-kf-graph__svg"
          width={plotW}
          height={plotH}
          viewBox={`0 0 ${plotW} ${plotH}`}
        >
          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={0}
                x2={innerW}
                y1={yAt(v)}
                y2={yAt(v)}
                className="timeline-kf-graph__grid"
              />
              <text
                x={4}
                y={yAt(v) - 2}
                className="timeline-kf-graph__ylabel"
              >
                {formatAxis(v)}
              </text>
            </g>
          ))}

          <line
            x1={playX}
            x2={playX}
            y1={0}
            y2={plotH}
            className="timeline-kf-graph__playhead"
          />

          {curvePath && (
            <path
              d={curvePath}
              className="timeline-kf-graph__curve"
              fill="none"
            />
          )}

          {keys.slice(0, -1).map((k, i) => {
            const n = keys[i + 1]!;
            const x0 = xAt(k.timeOffsetMs);
            const x1 = xAt(n.timeOffsetMs);
            const selected = activeSegLeftId === k.id;
            return (
              <rect
                key={`seg-${k.id}`}
                x={x0}
                y={PAD_T}
                width={Math.max(4, x1 - x0)}
                height={innerH}
                className={
                  selected
                    ? "timeline-kf-graph__seghit timeline-kf-graph__seghit--selected"
                    : "timeline-kf-graph__seghit"
                }
                onClick={(e) => onSegmentClick(e, k.id)}
                onContextMenu={(e) => onSegmentContextMenu(e, k.id)}
              />
            );
          })}

          {activeSeg && outScreen && inScreen && (
            <g className="timeline-kf-graph__handles">
              <line
                x1={xAt(activeSeg.left.timeOffsetMs)}
                y1={yAt(activeSeg.left.value)}
                x2={outScreen.x}
                y2={outScreen.y}
                className="timeline-kf-graph__stem"
              />
              <line
                x1={xAt(activeSeg.right.timeOffsetMs)}
                y1={yAt(activeSeg.right.value)}
                x2={inScreen.x}
                y2={inScreen.y}
                className="timeline-kf-graph__stem"
              />
              <circle
                cx={outScreen.x}
                cy={outScreen.y}
                r={5}
                className="timeline-kf-graph__handle"
                onPointerDown={(e) =>
                  onHandlePointerDown(e, activeSeg.left.id, "out")
                }
              />
              <circle
                cx={inScreen.x}
                cy={inScreen.y}
                r={5}
                className="timeline-kf-graph__handle"
                onPointerDown={(e) =>
                  onHandlePointerDown(e, activeSeg.left.id, "in")
                }
              />
            </g>
          )}

          {keys.map((k) => {
            const selected =
              selectedKey?.clipId === clip.id &&
              selectedKey.path === path &&
              selectedKey.keyId === k.id;
            const cx = xAt(k.timeOffsetMs);
            const cy = yAt(k.value);
            return (
              <g
                key={k.id}
                className={
                  selected
                    ? "timeline-kf-graph__key timeline-kf-graph__key--selected"
                    : "timeline-kf-graph__key"
                }
                transform={`translate(${cx}, ${cy})`}
                onPointerDown={(e) => onKeyPointerDown(e, k)}
              >
                <rect
                  x={-5}
                  y={-5}
                  width={10}
                  height={10}
                  transform="rotate(45)"
                  rx={1}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {popover && path && (
        <EasingPresetPopover
          anchor={{ x: popover.x, y: popover.y }}
          activePresetId={
            activePresetId as Exclude<EasingPresetId, "custom"> | undefined
          }
          segmentEdit={{
            clipId: clip.id,
            path,
            leftKeyId: popover.leftKeyId,
          }}
          onSelect={(preset) => {
            const before = structuredClone(
              useEditorStore.getState().project.tracks,
            );
            applyEasingPreset(clip.id, path, popover.leftKeyId, preset);
            const after = useEditorStore.getState().project.tracks;
            commitTracksTransition(before, after, "Easing preset");
            setPopover(null);
          }}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

function formatAxis(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/** Extra lane height when the value graph is open. */
export function keyframeGraphExtraHeight(): number {
  return KEYFRAME_GRAPH_HEIGHT_PX;
}
