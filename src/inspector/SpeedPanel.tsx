import { useMemo, useRef, useState } from "react";
import { applySpeedToClip } from "../engine/timelineOps";
import {
  SPEED_MAX,
  SPEED_MIN,
  defaultSpeedKeyframes,
  resolveSpeedCurve,
  timelineDurationForSpeed,
} from "../engine/speedRemap";
import type {
  Clip,
  SpeedCurve,
  SpeedCurvePresetId,
  SpeedKeyframe,
} from "../project/types";
import { useEditorStore } from "../store/editorStore";
import {
  SPEED_CURVE_PRESETS,
  getSpeedPreset,
  resolvePresetId,
} from "./speedPresets";
import { useTracksGestureEdit } from "./useTracksGestureEdit";

type Props = {
  clip: Clip;
  locked: boolean;
};

function formatDurationShort(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem.toString().padStart(2, "0")}s`;
}

function mergeSpeed(clip: Clip, partial: Partial<SpeedCurve>): SpeedCurve {
  const base = resolveSpeedCurve(clip.speed);
  return {
    ...base,
    ...partial,
    constant: partial.constant ?? base.constant,
    keyframes: partial.keyframes ?? base.keyframes,
    frameMode: partial.frameMode ?? base.frameMode,
    presetId: partial.presetId ?? base.presetId,
  };
}

function markCustomized(keys: SpeedKeyframe[]): SpeedCurve {
  return {
    mode: "curve",
    keyframes: keys,
    presetId: "customized",
  };
}

export function SpeedPanel({ clip, locked }: Props) {
  const gesture = useTracksGestureEdit("Speed");
  const canRedo = useEditorStore((s) => s.history.redoStack.length > 0);
  const redo = useEditorStore((s) => s.redo);
  const speed = resolveSpeedCurve(clip.speed);
  const constant = speed.constant ?? 1;
  const frameMode = speed.frameMode === "blend" ? "blend" : "nearest";
  const keys =
    speed.keyframes && speed.keyframes.length >= 2
      ? speed.keyframes
      : defaultSpeedKeyframes();
  const presetId = resolvePresetId(speed.presetId, speed.mode);

  const sourceSpanMs = Math.max(0, clip.outMs - clip.inMs);
  const nextDurationMs =
    speed.mode === "curve"
      ? timelineDurationForSpeed(sourceSpanMs, speed)
      : timelineDurationForSpeed(sourceSpanMs, {
          mode: "constant",
          constant,
        });

  const apply = (next: SpeedCurve, mode: "live" | "commit") => {
    const tracks = useEditorStore.getState().project.tracks;
    const after = applySpeedToClip(tracks, clip.id, next);
    if (mode === "commit") gesture.commit(after, "Speed");
    else gesture.live(after);
  };

  const applyPreset = (id: SpeedCurvePresetId) => {
    if (locked) return;
    if (id === "customized") {
      // Switch to curve editing without resetting knots
      apply(
        mergeSpeed(clip, {
          mode: "curve",
          presetId: "customized",
          keyframes: keys.length >= 2 ? keys : defaultSpeedKeyframes(),
        }),
        "commit",
      );
      return;
    }
    const def = getSpeedPreset(id);
    if (!def) return;
    apply(
      mergeSpeed(clip, {
        mode: "curve",
        presetId: id,
        keyframes: structuredClone(def.keyframes),
      }),
      "commit",
    );
  };

  return (
    <div className="inspector-speed">
      <section className="inspector-section">
        <div className="inspector-segment" role="group" aria-label="Speed mode">
          {(
            [
              ["constant", "Normal"],
              ["curve", "Curve"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                speed.mode === id
                  ? "inspector-segment__btn inspector-segment__btn--active"
                  : "inspector-segment__btn"
              }
              disabled={locked}
              onClick={() => {
                if (speed.mode === id) return;
                if (id === "curve") {
                  apply(
                    mergeSpeed(clip, {
                      mode: "curve",
                      presetId: speed.presetId ?? "none",
                      keyframes:
                        keys.length >= 2 ? keys : defaultSpeedKeyframes(),
                    }),
                    "commit",
                  );
                } else {
                  apply(
                    mergeSpeed(clip, {
                      mode: "constant",
                      constant: constant,
                    }),
                    "commit",
                  );
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {speed.mode === "constant" ? (
          <label className="inspector-field">
            <span className="inspector-field__label">Playback speed</span>
            <div className="inspector-field__controls">
              <input
                type="range"
                className="inspector-slider"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={0.05}
                disabled={locked}
                value={constant}
                onPointerDown={gesture.begin}
                onPointerUp={() => gesture.end()}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  apply(
                    mergeSpeed(clip, { constant: v, mode: "constant" }),
                    "live",
                  );
                }}
              />
              <input
                type="number"
                className="inspector-number"
                disabled={locked}
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={0.05}
                value={Math.round(constant * 100) / 100}
                onFocus={gesture.begin}
                onBlur={() => gesture.end()}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  apply(
                    mergeSpeed(clip, {
                      constant: Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)),
                      mode: "constant",
                    }),
                    "live",
                  );
                }}
              />
              <span className="inspector-field__unit">×</span>
            </div>
          </label>
        ) : (
          <>
            <div
              className="speed-presets"
              role="listbox"
              aria-label="Speed curve presets"
            >
              {SPEED_CURVE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="option"
                  aria-selected={presetId === preset.id}
                  title={preset.label}
                  disabled={locked}
                  className={
                    presetId === preset.id
                      ? "speed-presets__tile speed-presets__tile--active"
                      : "speed-presets__tile"
                  }
                  onClick={() => applyPreset(preset.id)}
                >
                  <PresetIcon id={preset.id} path={preset.iconPath} />
                  <span className="speed-presets__label">{preset.label}</span>
                </button>
              ))}
            </div>

            <div className="speed-curve-panel">
              <div className="speed-curve-panel__duration" aria-live="polite">
                <span className="speed-curve-panel__duration-label">
                  Duration
                </span>
                <span className="speed-curve-panel__duration-from">
                  {formatDurationShort(sourceSpanMs)}
                </span>
                <span className="speed-curve-panel__duration-rule" />
                <span className="speed-curve-panel__duration-to">
                  {formatDurationShort(nextDurationMs)}
                </span>
              </div>

              <SpeedCurveEditor
                keys={keys}
                locked={locked}
                onBegin={gesture.begin}
                onLive={(keyframes) =>
                  apply(mergeSpeed(clip, markCustomized(keyframes)), "live")
                }
                onEnd={() => gesture.end()}
                onCommit={(keyframes) =>
                  apply(mergeSpeed(clip, markCustomized(keyframes)), "commit")
                }
              />

              <div className="speed-curve-panel__toolbar">
                <button
                  type="button"
                  className="speed-curve-panel__tool"
                  disabled={locked || !canRedo}
                  title="Redo"
                  onClick={() => redo()}
                >
                  Redo
                </button>
                <button
                  type="button"
                  className="speed-curve-panel__tool speed-curve-panel__tool--icon"
                  disabled={locked}
                  title="Add keyframe"
                  aria-label="Add keyframe"
                  onClick={() => {
                    const mid = {
                      t: 0.5,
                      v: 1,
                      outHandle: { dt: 0.08, dv: 0 },
                      inHandle: { dt: -0.08, dv: 0 },
                    };
                    const next = [...keys, mid].sort((a, b) => a.t - b.t);
                    next[0] = { ...next[0]!, t: 0 };
                    next[next.length - 1] = {
                      ...next[next.length - 1]!,
                      t: 1,
                    };
                    apply(mergeSpeed(clip, markCustomized(next)), "commit");
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="inspector-section">
        <div className="inspector-section__head">
          <h3 className="inspector-section__title">Frame sampling</h3>
        </div>
        <div className="inspector-segment" role="group" aria-label="Frame mode">
          {(
            [
              ["nearest", "Nearest"],
              ["blend", "Frame blend"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                frameMode === id
                  ? "inspector-segment__btn inspector-segment__btn--active"
                  : "inspector-segment__btn"
              }
              disabled={locked}
              onClick={() => {
                if (frameMode === id) return;
                apply(mergeSpeed(clip, { frameMode: id }), "commit");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {locked && <p className="inspector-panel__hint">Track is locked.</p>}
    </div>
  );
}

function PresetIcon({
  id,
  path,
}: {
  id: SpeedCurvePresetId;
  path: string;
}) {
  if (id === "none") {
    return (
      <svg className="speed-presets__icon" viewBox="0 0 40 28" aria-hidden>
        <circle cx="20" cy="14" r="8" className="speed-presets__icon-stroke" />
        <line
          x1="14"
          y1="20"
          x2="26"
          y2="8"
          className="speed-presets__icon-stroke"
        />
      </svg>
    );
  }
  if (id === "customized") {
    return (
      <svg className="speed-presets__icon" viewBox="0 0 40 28" aria-hidden>
        <line x1="8" y1="8" x2="32" y2="8" className="speed-presets__icon-stroke" />
        <circle cx="14" cy="8" r="2.5" className="speed-presets__icon-fill" />
        <line x1="8" y1="14" x2="32" y2="14" className="speed-presets__icon-stroke" />
        <circle cx="24" cy="14" r="2.5" className="speed-presets__icon-fill" />
        <line x1="8" y1="20" x2="32" y2="20" className="speed-presets__icon-stroke" />
        <circle cx="18" cy="20" r="2.5" className="speed-presets__icon-fill" />
      </svg>
    );
  }
  return (
    <svg className="speed-presets__icon" viewBox="0 0 44 28" aria-hidden>
      <line
        x1="2"
        y1="14"
        x2="42"
        y2="14"
        className="speed-presets__icon-guide"
      />
      <path d={path} className="speed-presets__icon-path" fill="none" />
    </svg>
  );
}

type CurveEditorProps = {
  keys: SpeedKeyframe[];
  locked: boolean;
  onBegin: () => void;
  onLive: (keys: SpeedKeyframe[]) => void;
  onEnd: () => void;
  onCommit: (keys: SpeedKeyframe[]) => void;
};

function SpeedCurveEditor({
  keys,
  locked,
  onBegin,
  onLive,
  onEnd,
  onCommit,
}: CurveEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const width = 240;
  const height = 96;
  const padL = 22;
  const padR = 8;
  const padT = 8;
  const padB = 8;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const yAt = (v: number) =>
    padT + (1 - (v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * plotH;
  const xAt = (t: number) => padL + t * plotW;
  const oneY = yAt(1);

  const points = useMemo(() => {
    return keys.map((k) => ({
      ...k,
      x: xAt(k.t),
      y: yAt(k.v),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry constants
  }, [keys]);

  const pathD = useMemo(() => {
    if (points.length < 2) return "";
    let d = `M ${points[0]!.x} ${points[0]!.y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const out = a.outHandle ?? { dt: (b.t - a.t) / 3, dv: 0 };
      const inn = b.inHandle ?? { dt: (a.t - b.t) / 3, dv: 0 };
      const c1x = xAt(Math.min(1, Math.max(0, a.t + out.dt)));
      const c1y = yAt(
        Math.min(SPEED_MAX, Math.max(SPEED_MIN, a.v + out.dv)),
      );
      const c2x = xAt(Math.min(1, Math.max(0, b.t + inn.dt)));
      const c2y = yAt(
        Math.min(SPEED_MAX, Math.max(SPEED_MIN, b.v + inn.dv)),
      );
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const clientToKey = (clientX: number, clientY: number): SpeedKeyframe => {
    const svg = svgRef.current;
    if (!svg) return { t: 0, v: 1 };
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const t = Math.min(1, Math.max(0, (x - padL) / plotW));
    const vNorm = 1 - (y - padT) / plotH;
    const v =
      SPEED_MIN +
      Math.min(1, Math.max(0, vNorm)) * (SPEED_MAX - SPEED_MIN);
    return { t, v };
  };

  const updateKey = (idx: number, next: SpeedKeyframe, live: boolean) => {
    const sorted = keys.map((k, i) => (i === idx ? { ...k, ...next } : k));
    if (idx === 0) sorted[0] = { ...sorted[0]!, t: 0, v: next.v };
    if (idx === keys.length - 1) {
      sorted[keys.length - 1] = {
        ...sorted[keys.length - 1]!,
        t: 1,
        v: next.v,
      };
    }
    sorted.sort((a, b) => a.t - b.t);
    if (live) onLive(sorted);
    else onCommit(sorted);
  };

  return (
    <div className="speed-curve-graph">
      <svg
        ref={svgRef}
        className="speed-curve-graph__svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Speed curve"
        onPointerDown={(e) => {
          if (locked) return;
          if (e.detail >= 2) {
            const k = clientToKey(e.clientX, e.clientY);
            const next = [...keys, k].sort((a, b) => a.t - b.t);
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
          className="speed-curve-graph__bg"
        />

        {[10, 1, 0.1].map((v) => (
          <line
            key={v}
            x1={padL}
            x2={width - padR}
            y1={yAt(v)}
            y2={yAt(v)}
            className={
              v === 1
                ? "speed-curve-graph__guide speed-curve-graph__guide--one"
                : "speed-curve-graph__guide"
            }
          />
        ))}

        <text x={3} y={yAt(10) + 2.5} className="speed-curve-graph__axis">
          10x
        </text>
        <text x={5} y={oneY + 2.5} className="speed-curve-graph__axis">
          1x
        </text>
        <text x={1} y={yAt(0.1) + 2.5} className="speed-curve-graph__axis">
          0.1x
        </text>

        <path d={pathD} className="speed-curve-graph__path" fill="none" />

        {points.map((p, idx) => (
          <g
            key={idx}
            className={
              dragIdx === idx
                ? "speed-curve-graph__knot speed-curve-graph__knot--active"
                : "speed-curve-graph__knot"
            }
            transform={`translate(${p.x}, ${p.y})`}
            onPointerDown={(e) => {
              if (locked) return;
              e.stopPropagation();
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              dragIdxRef.current = idx;
              setDragIdx(idx);
              onBegin();
            }}
            onPointerMove={(e) => {
              if (dragIdxRef.current !== idx) return;
              const k = clientToKey(e.clientX, e.clientY);
              updateKey(idx, k, true);
            }}
            onPointerUp={(e) => {
              if (dragIdxRef.current !== idx) return;
              try {
                (e.currentTarget as Element).releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
              dragIdxRef.current = null;
              setDragIdx(null);
              onEnd();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (locked || keys.length <= 2) return;
              if (idx === 0 || idx === keys.length - 1) return;
              onCommit(keys.filter((_, i) => i !== idx));
            }}
          >
            {/* Invisible hit target keeps drag easy without bulky knots */}
            <circle r={8} className="speed-curve-graph__knot-hit" />
            <circle r={3.5} className="speed-curve-graph__knot-disk" />
            <line
              x1={-1.6}
              y1={-1.8}
              x2={-1.6}
              y2={1.8}
              className="speed-curve-graph__knot-grip"
            />
            <line
              x1={0}
              y1={-1.8}
              x2={0}
              y2={1.8}
              className="speed-curve-graph__knot-grip"
            />
            <line
              x1={1.6}
              y1={-1.8}
              x2={1.6}
              y2={1.8}
              className="speed-curve-graph__knot-grip"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
