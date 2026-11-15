import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  getAnimatable,
  solveCubicBezier,
  updateKeyframeHandles as updateHandlesOnClip,
  type AnimatablePath,
} from "../engine/animatable";
import type { Clip, KeyframeHandle, Track } from "../project/types";
import { useEditorStore } from "../store/editorStore";

type Props = {
  clipId: string;
  path: AnimatablePath;
  leftKeyId: string;
};

const SIZE = 120;
const PAD = 10;
const INNER = SIZE - PAD * 2;

function applyHandles(
  tracks: Track[],
  clipId: string,
  path: AnimatablePath,
  leftKeyId: string,
  outHandle: KeyframeHandle,
  inHandle: KeyframeHandle,
): Track[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((c) => {
      if (c.id !== clipId) return c;
      const next = updateHandlesOnClip(c, path, leftKeyId, {
        outHandle,
        inHandle,
        tangentMode: "broken",
      });
      return Object.keys(next).length === 0 ? c : { ...c, ...next };
    }),
  }));
}

function toPx(u: number, v: number): { x: number; y: number } {
  return {
    x: PAD + u * INNER,
    y: PAD + (1 - v) * INNER,
  };
}

function fromPx(x: number, y: number): KeyframeHandle {
  const dx = Math.min(1, Math.max(0, (x - PAD) / INNER));
  const dy = 1 - (y - PAD) / INNER;
  return { dx, dy: Number.isFinite(dy) ? dy : 0 };
}

/**
 * Normalized 1:1 mini Bézier editor for a keyframe segment (CSS cubic space).
 */
export function SegmentCurveMiniEditor({ clipId, path, leftKeyId }: Props) {
  const clip = useEditorStore((s) => {
    for (const t of s.project.tracks) {
      const c = t.clips.find((x) => x.id === clipId);
      if (c) return c;
    }
    return null as Clip | null;
  });
  const patchTracksLive = useEditorStore((s) => s.patchTracksLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    which: "out" | "in";
    tracksBefore: Track[];
  } | null>(null);

  const segment = useMemo(() => {
    if (!clip) return null;
    const prop = getAnimatable(clip, path);
    if (!prop) return null;
    const keys = [...prop.keyframes].sort(
      (a, b) => a.timeOffsetMs - b.timeOffsetMs,
    );
    const i = keys.findIndex((k) => k.id === leftKeyId);
    if (i < 0 || i >= keys.length - 1) return null;
    return { left: keys[i]!, right: keys[i + 1]! };
  }, [clip, leftKeyId, path]);

  const curveD = useMemo(() => {
    if (!segment) return "";
    const { left, right } = segment;
    const x1 = left.outHandle.dx;
    const y1 = left.outHandle.dy;
    const x2 = right.inHandle.dx;
    const y2 = right.inHandle.dy;
    const parts: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const u = i / 32;
      const p = solveCubicBezier(x1, y1, x2, y2, u);
      const { x, y } = toPx(u, p);
      parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return parts.join(" ");
  }, [segment]);

  const clientToLocal = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = rect.width > 0 ? SIZE / rect.width : 1;
    const sy = rect.height > 0 ? SIZE / rect.height : 1;
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    };
  }, []);

  const onHandleDown = useCallback(
    (e: ReactPointerEvent, which: "out" | "in") => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        which,
        tracksBefore: structuredClone(
          useEditorStore.getState().project.tracks,
        ),
      };
    },
    [],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Read live segment from store so we keep the untouched handle.
      const state = useEditorStore.getState();
      let liveClip: Clip | null = null;
      for (const t of state.project.tracks) {
        const c = t.clips.find((x) => x.id === clipId);
        if (c) {
          liveClip = c;
          break;
        }
      }
      if (!liveClip) return;
      const prop = getAnimatable(liveClip, path);
      if (!prop) return;
      const keys = [...prop.keyframes].sort(
        (a, b) => a.timeOffsetMs - b.timeOffsetMs,
      );
      const i = keys.findIndex((k) => k.id === leftKeyId);
      if (i < 0 || i >= keys.length - 1) return;
      const left = keys[i]!;
      const right = keys[i + 1]!;
      const pt = clientToLocal(e.clientX, e.clientY);
      const h = fromPx(pt.x, pt.y);
      const outHandle = drag.which === "out" ? h : left.outHandle;
      const inHandle = drag.which === "in" ? h : right.inHandle;
      patchTracksLive(
        applyHandles(
          structuredClone(drag.tracksBefore),
          clipId,
          path,
          leftKeyId,
          outHandle,
          inHandle,
        ),
      );
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const after = useEditorStore.getState().project.tracks;
      commitTracksTransition(drag.tracksBefore, after, "Edit keyframe curve");
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    clientToLocal,
    clipId,
    commitTracksTransition,
    leftKeyId,
    path,
    patchTracksLive,
  ]);

  if (!segment) return null;

  const outPt = toPx(segment.left.outHandle.dx, segment.left.outHandle.dy);
  const inPt = toPx(segment.right.inHandle.dx, segment.right.inHandle.dy);
  const p0 = toPx(0, 0);
  const p3 = toPx(1, 1);

  return (
    <div className="segment-curve-mini">
      <div className="segment-curve-mini__label">Custom</div>
      <svg
        ref={svgRef}
        className="segment-curve-mini__svg"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
      >
        <rect
          x={PAD}
          y={PAD}
          width={INNER}
          height={INNER}
          className="segment-curve-mini__frame"
        />
        <line
          x1={p0.x}
          y1={p0.y}
          x2={p3.x}
          y2={p3.y}
          className="segment-curve-mini__guide"
        />
        {curveD && (
          <path d={curveD} className="segment-curve-mini__curve" fill="none" />
        )}
        <line
          x1={p0.x}
          y1={p0.y}
          x2={outPt.x}
          y2={outPt.y}
          className="segment-curve-mini__stem"
        />
        <line
          x1={p3.x}
          y1={p3.y}
          x2={inPt.x}
          y2={inPt.y}
          className="segment-curve-mini__stem"
        />
        <circle
          cx={outPt.x}
          cy={outPt.y}
          r={5}
          className="segment-curve-mini__handle"
          onPointerDown={(e) => onHandleDown(e, "out")}
        />
        <circle
          cx={inPt.x}
          cy={inPt.y}
          r={5}
          className="segment-curve-mini__handle"
          onPointerDown={(e) => onHandleDown(e, "in")}
        />
        <circle cx={p0.x} cy={p0.y} r={3.5} className="segment-curve-mini__knot" />
        <circle cx={p3.x} cy={p3.y} r={3.5} className="segment-curve-mini__knot" />
      </svg>
    </div>
  );
}
