import { useMemo, useRef, useState } from "react";
import {
  ADJUST_ANIMATABLE_PATHS,
  evaluateClipAdjust,
  staticAnimatable,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import type { Clip, ColorAdjust, LumaCurvePoint } from "../project/types";
import { useEditorStore } from "../store/editorStore";
import { InspectorKeyframeGroup } from "./InspectorKeyframeGroup";
import { InspectorKeyframeRow } from "./InspectorKeyframeRow";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clip: Clip;
  locked: boolean;
};

const IDENTITY_CURVE: LumaCurvePoint[] = [
  { t: 0, y: 0 },
  { t: 1, y: 1 },
];

export function AdjustPanel({ clip, locked }: Props) {
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const gesture = useClipGestureEdit(clip.id, "Adjust");

  const localMs = clipLocalMs(playheadMs, clip);
  const offClip = localMs === null || locked;
  const resolved =
    localMs !== null
      ? evaluateClipAdjust(clip, localMs)
      : evaluateClipAdjust(clip, 0);
  const brightness = resolved?.brightness ?? 0;
  const contrast = resolved?.contrast ?? 0;
  const saturation = resolved?.saturation ?? 0;
  const hue = resolved?.hue ?? 0;
  const lumaCurve =
    clip.adjust?.lumaCurve && clip.adjust.lumaCurve.length >= 2
      ? clip.adjust.lumaCurve
      : IDENTITY_CURVE;

  const liveValue = (
    path: (typeof ADJUST_ANIMATABLE_PATHS)[number],
    value: number,
  ) => {
    if (offClip) return;
    gesture.ensureBegin();
    setAnimatableValue(clip.id, path, value);
  };

  const resetColor = () => {
    gesture.commit(
      {
        adjust: {
          brightness: staticAnimatable(0),
          contrast: staticAnimatable(0),
          saturation: staticAnimatable(0),
          hue: staticAnimatable(0),
          lumaCurve: IDENTITY_CURVE,
        },
      },
      "Adjust",
    );
  };

  const patchLuma = (pts: LumaCurvePoint[], mode: "live" | "commit") => {
    const next: ColorAdjust = {
      ...(clip.adjust ?? {}),
      lumaCurve: pts,
    };
    if (mode === "commit") gesture.commit({ adjust: next }, "Adjust");
    else gesture.live({ adjust: next });
  };

  return (
    <div className="inspector-adjust">
      <section className="inspector-section">
        <div className="inspector-section__head">
          <h3 className="inspector-section__title">
            Color
            <InspectorKeyframeGroup
              clipId={clip.id}
              paths={[...ADJUST_ANIMATABLE_PATHS]}
            />
          </h3>
          <button
            type="button"
            className="inspector-reset"
            disabled={locked}
            onClick={resetColor}
          >
            Reset
          </button>
        </div>

        {(
          [
            ["adjust.brightness", "Brightness", brightness, -1, 1, 0.01],
            ["adjust.contrast", "Contrast", contrast, -1, 1, 0.01],
            ["adjust.saturation", "Saturation", saturation, -1, 1, 0.01],
            ["adjust.hue", "Hue", hue, -180, 180, 1],
          ] as const
        ).map(([path, label, value, min, max, step]) => (
          <InspectorKeyframeRow
            key={path}
            clipId={clip.id}
            path={path}
            label={label}
            disabled={offClip}
          >
            <input
              type="range"
              className="inspector-slider"
              min={min}
              max={max}
              step={step}
              disabled={offClip}
              value={value}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) => liveValue(path, Number(e.target.value))}
            />
            <input
              type="number"
              className="inspector-number"
              disabled={offClip}
              min={min}
              max={max}
              step={step}
              value={
                Math.round(value * (path === "adjust.hue" ? 1 : 100)) /
                (path === "adjust.hue" ? 1 : 100)
              }
              onFocus={gesture.begin}
              onBlur={gesture.end}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                liveValue(path, Math.min(max, Math.max(min, n)));
              }}
            />
          </InspectorKeyframeRow>
        ))}
      </section>

      <section className="inspector-section">
        <div className="inspector-section__head">
          <h3 className="inspector-section__title">Luma curve</h3>
        </div>
        <LumaCurveEditor
          points={lumaCurve}
          locked={locked}
          onBegin={gesture.begin}
          onLive={(pts) => patchLuma(pts, "live")}
          onEnd={gesture.end}
          onCommit={(pts) => patchLuma(pts, "commit")}
        />
      </section>

      {locked && <p className="inspector-panel__hint">Track is locked.</p>}
    </div>
  );
}

type LumaProps = {
  points: LumaCurvePoint[];
  locked: boolean;
  onBegin: () => void;
  onLive: (pts: LumaCurvePoint[]) => void;
  onEnd: () => void;
  onCommit: (pts: LumaCurvePoint[]) => void;
};

function LumaCurveEditor({
  points,
  locked,
  onBegin,
  onLive,
  onEnd,
  onCommit,
}: LumaProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const dragIdxRef = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const width = 260;
  const height = 140;
  const pad = 10;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const mapped = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        x: pad + p.t * innerW,
        y: pad + (1 - p.y) * innerH,
      })),
    [innerH, innerW, points],
  );

  const pathD = useMemo(() => {
    if (mapped.length < 2) return "";
    let d = `M ${mapped[0]!.x} ${mapped[0]!.y}`;
    for (let i = 1; i < mapped.length; i++) {
      d += ` L ${mapped[i]!.x} ${mapped[i]!.y}`;
    }
    return d;
  }, [mapped]);

  const clientToPoint = (clientX: number, clientY: number): LumaCurvePoint => {
    const svg = svgRef.current;
    if (!svg) return { t: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { t: 0, y: 0 };
    // Map CSS pixels → viewBox space (SVG may be CSS-scaled).
    const x = ((clientX - rect.left) / rect.width) * width;
    const y = ((clientY - rect.top) / rect.height) * height;
    const t = Math.min(1, Math.max(0, (x - pad) / innerW));
    const yn = 1 - (y - pad) / innerH;
    return { t, y: Math.min(1, Math.max(0, yn)) };
  };

  /** Keep indices stable while dragging — clamp between neighbors, no mid-drag sort. */
  const movePoint = (idx: number, next: LumaCurvePoint) => {
    const pts = pointsRef.current;
    const arr = pts.map((p) => ({ ...p }));
    const last = pts.length - 1;
    if (idx === 0) {
      arr[0] = { t: 0, y: next.y };
    } else if (idx === last) {
      arr[last] = { t: 1, y: next.y };
    } else {
      const lo = pts[idx - 1]!.t + 1e-4;
      const hi = pts[idx + 1]!.t - 1e-4;
      arr[idx] = {
        t: Math.min(hi, Math.max(lo, next.t)),
        y: next.y,
      };
    }
    onLive(arr);
  };

  const endDrag = () => {
    if (dragIdxRef.current === null) return;
    dragIdxRef.current = null;
    setDragIdx(null);
    onEnd();
  };

  return (
    <div className="inspector-curve">
      <svg
        ref={svgRef}
        className="inspector-curve__svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Luma curve"
        onDoubleClick={(e) => {
          if (locked || dragIdxRef.current !== null) return;
          e.preventDefault();
          const p = clientToPoint(e.clientX, e.clientY);
          // Keep endpoints pinned; insert interior only.
          const t = Math.min(1 - 1e-4, Math.max(1e-4, p.t));
          const next = [...points, { t, y: p.y }].sort((a, b) => a.t - b.t);
          next[0] = { t: 0, y: next[0]!.y };
          next[next.length - 1] = { t: 1, y: next[next.length - 1]!.y };
          onCommit(next);
        }}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          className="inspector-curve__bg"
        />
        <g className="inspector-curve__grid" aria-hidden>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={`v-${f}`}
              x1={pad + f * innerW}
              y1={pad}
              x2={pad + f * innerW}
              y2={height - pad}
            />
          ))}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={`h-${f}`}
              x1={pad}
              y1={pad + f * innerH}
              x2={width - pad}
              y2={pad + f * innerH}
            />
          ))}
        </g>
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={pad}
          className="inspector-curve__guide"
        />
        <path d={pathD} className="inspector-curve__path" fill="none" />
        {mapped.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={5}
            className={
              dragIdx === idx
                ? "inspector-curve__knot inspector-curve__knot--active"
                : "inspector-curve__knot"
            }
            onPointerDown={(e) => {
              if (locked || e.button !== 0) return;
              e.stopPropagation();
              e.preventDefault();
              const target = e.currentTarget;
              target.setPointerCapture(e.pointerId);
              dragIdxRef.current = idx;
              setDragIdx(idx);
              onBegin();

              const onMove = (ev: PointerEvent) => {
                if (dragIdxRef.current !== idx) return;
                movePoint(idx, clientToPoint(ev.clientX, ev.clientY));
              };
              const onUp = (ev: PointerEvent) => {
                if (ev.pointerId !== e.pointerId) return;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
                try {
                  target.releasePointerCapture(ev.pointerId);
                } catch {
                  /* ignore */
                }
                endDrag();
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
              window.addEventListener("pointercancel", onUp);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (locked || points.length <= 2) return;
              if (idx === 0 || idx === points.length - 1) return;
              onCommit(points.filter((_, i) => i !== idx));
            }}
          />
        ))}
      </svg>
      <p className="inspector-panel__hint inspector-panel__hint--tight">
        Drag points · double-click to add · right-click to remove.
      </p>
    </div>
  );
}
