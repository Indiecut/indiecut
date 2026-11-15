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
  const dragIdxRef = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const width = 260;
  const height = 140;
  const pad = 10;

  const mapped = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        x: pad + p.t * (width - pad * 2),
        y: pad + (1 - p.y) * (height - pad * 2),
      })),
    [points],
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
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const t = Math.min(1, Math.max(0, (x - pad) / (width - pad * 2)));
    const yn = 1 - (y - pad) / (height - pad * 2);
    return { t, y: Math.min(1, Math.max(0, yn)) };
  };

  const updatePoint = (idx: number, next: LumaCurvePoint, live: boolean) => {
    const arr = points.map((p, i) => (i === idx ? next : p));
    if (idx === 0) arr[0] = { t: 0, y: next.y };
    if (idx === points.length - 1) arr[points.length - 1] = { t: 1, y: next.y };
    arr.sort((a, b) => a.t - b.t);
    if (live) onLive(arr);
    else onCommit(arr);
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
        onPointerDown={(e) => {
          if (locked) return;
          if (e.detail >= 2) {
            const p = clientToPoint(e.clientX, e.clientY);
            const next = [...points, p].sort((a, b) => a.t - b.t);
            next[0] = { ...next[0]!, t: 0 };
            next[next.length - 1] = { ...next[next.length - 1]!, t: 1 };
            onCommit(next);
          }
        }}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          className="inspector-curve__bg"
        />
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
              if (locked) return;
              e.stopPropagation();
              (e.target as Element).setPointerCapture(e.pointerId);
              dragIdxRef.current = idx;
              setDragIdx(idx);
              onBegin();
            }}
            onPointerMove={(e) => {
              if (dragIdxRef.current !== idx) return;
              updatePoint(idx, clientToPoint(e.clientX, e.clientY), true);
            }}
            onPointerUp={(e) => {
              if (dragIdxRef.current !== idx) return;
              try {
                (e.target as Element).releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
              dragIdxRef.current = null;
              setDragIdx(null);
              onEnd();
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
