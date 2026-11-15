import { useState } from "react";
import {
  evaluateClipTransform,
  patchClipTransformValues,
  TRANSFORM_ANIMATABLE_PATHS,
  type ResolvedTransform,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import { IconChevronDown, IconRotate } from "../icons/Icons";
import type { Clip } from "../project/types";
import { useEditorStore } from "../store/editorStore";
import { InspectorKeyframeGroup } from "./InspectorKeyframeGroup";
import { InspectorKeyframeRow } from "./InspectorKeyframeRow";
import { PositionPad } from "./PositionPad";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clip: Clip;
  locked: boolean;
  /** Max scale percent (text/stickers often need >400). */
  maxScalePercent?: number;
};

/**
 * Shared scale / position / rotation controls for video Basic, text, stickers.
 * Transform layout: scale slider, 2D positioning pad, rotate.
 */
export function TransformFields({
  clip,
  locked,
  maxScalePercent = 400,
}: Props) {
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const fps = useEditorStore((s) => s.project.fps);
  const frameW = useEditorStore((s) => s.project.width);
  const frameH = useEditorStore((s) => s.project.height);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const gesture = useClipGestureEdit(clip.id, "Transform");
  const [open, setOpen] = useState(true);

  const localMs = clipLocalMs(playheadMs, clip);
  const transform =
    localMs !== null
      ? evaluateClipTransform(clip, localMs)
      : evaluateClipTransform(clip, 0);
  const scalePercent = Math.round(transform.scaleX * 1000) / 10;
  const scaleYPercent = Math.round(transform.scaleY * 1000) / 10;
  const offClip = localMs === null || locked;
  const rangeX = Math.max(1, frameW / 2);
  const rangeY = Math.max(1, frameH / 2);

  const liveValue = (
    path: Parameters<typeof setAnimatableValue>[1],
    value: number,
  ) => {
    if (offClip) return;
    gesture.ensureBegin();
    setAnimatableValue(clip.id, path, value);
  };

  const setUniform = (on: boolean) => {
    if (offClip || localMs === null) return;
    const patch = patchClipTransformValues(
      clip,
      {
        uniformScale: on,
        ...(on ? { scaleX: transform.scaleX, scaleY: transform.scaleX } : {}),
      },
      localMs,
      fps,
    );
    gesture.commit(patch, "Uniform scale");
  };

  return (
    <section className="inspector-section transform-fields">
      <div className="transform-fields__head">
        <button
          type="button"
          className="transform-fields__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <IconChevronDown
            size={14}
            className={
              open
                ? "transform-fields__chevron"
                : "transform-fields__chevron transform-fields__chevron--closed"
            }
          />
          <h3 className="inspector-section__title transform-fields__title">
            Transform
          </h3>
        </button>
        <InspectorKeyframeGroup
          clipId={clip.id}
          paths={[...TRANSFORM_ANIMATABLE_PATHS]}
        />
      </div>

      {open && (
        <>
          <InspectorKeyframeRow
            clipId={clip.id}
            path="transform.scaleX"
            label={transform.uniformScale !== false ? "Scale" : "Scale X"}
            disabled={offClip}
          >
            <input
              type="range"
              className="inspector-slider"
              min={1}
              max={maxScalePercent}
              step={0.5}
              disabled={offClip}
              value={Math.min(maxScalePercent, scalePercent)}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) => {
                liveValue("transform.scaleX", Number(e.target.value) / 100);
              }}
            />
            <div className="transform-fields__value">
              <input
                type="number"
                className="inspector-number transform-fields__value-input"
                disabled={offClip}
                value={scalePercent}
                min={1}
                max={maxScalePercent}
                step={0.5}
                onFocus={gesture.begin}
                onBlur={gesture.end}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  if (!Number.isFinite(pct)) return;
                  liveValue(
                    "transform.scaleX",
                    Math.min(maxScalePercent, Math.max(1, pct)) / 100,
                  );
                }}
              />
              <span className="transform-fields__value-unit">%</span>
            </div>
          </InspectorKeyframeRow>

          {transform.uniformScale === false && (
            <InspectorKeyframeRow
              clipId={clip.id}
              path="transform.scaleY"
              label="Scale Y"
              disabled={offClip}
            >
              <input
                type="range"
                className="inspector-slider"
                min={1}
                max={maxScalePercent}
                step={0.5}
                disabled={offClip}
                value={Math.min(maxScalePercent, scaleYPercent)}
                onPointerDown={gesture.begin}
                onPointerUp={gesture.end}
                onChange={(e) => {
                  liveValue("transform.scaleY", Number(e.target.value) / 100);
                }}
              />
              <div className="transform-fields__value">
                <input
                  type="number"
                  className="inspector-number transform-fields__value-input"
                  disabled={offClip}
                  value={scaleYPercent}
                  min={1}
                  max={maxScalePercent}
                  step={0.5}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    if (!Number.isFinite(pct)) return;
                    liveValue(
                      "transform.scaleY",
                      Math.min(maxScalePercent, Math.max(1, pct)) / 100,
                    );
                  }}
                />
                <span className="transform-fields__value-unit">%</span>
              </div>
            </InspectorKeyframeRow>
          )}

          <label className="inspector-toggle-row">
            <span>Uniform scale</span>
            <input
              type="checkbox"
              className="inspector-switch"
              disabled={offClip}
              checked={transform.uniformScale !== false}
              onChange={(e) => setUniform(e.target.checked)}
            />
          </label>

          <div className="transform-fields__positioning">
            <span className="inspector-field__label">Positioning</span>
            <div className="transform-fields__positioning-body">
              <PositionPad
                x={transform.x}
                y={transform.y}
                rangeX={rangeX}
                rangeY={rangeY}
                disabled={offClip}
                onDragStart={gesture.begin}
                onDragEnd={gesture.end}
                onChange={(nx, ny) => {
                  if (offClip) return;
                  gesture.ensureBegin();
                  setAnimatableValue(clip.id, "transform.x", nx);
                  setAnimatableValue(clip.id, "transform.y", ny);
                }}
              />
              <div className="transform-fields__xy">
                <InspectorKeyframeRow
                  clipId={clip.id}
                  path="transform.x"
                  label="X"
                  disabled={offClip}
                >
                  <div className="transform-fields__value">
                    <input
                      type="number"
                      className="inspector-number transform-fields__value-input"
                      disabled={offClip}
                      value={Math.round(transform.x * 10) / 10}
                      onFocus={gesture.begin}
                      onBlur={gesture.end}
                      onChange={(e) => {
                        const x = Number(e.target.value);
                        if (!Number.isFinite(x)) return;
                        liveValue("transform.x", x);
                      }}
                    />
                    <span className="transform-fields__value-unit">px</span>
                  </div>
                </InspectorKeyframeRow>
                <InspectorKeyframeRow
                  clipId={clip.id}
                  path="transform.y"
                  label="Y"
                  disabled={offClip}
                >
                  <div className="transform-fields__value">
                    <input
                      type="number"
                      className="inspector-number transform-fields__value-input"
                      disabled={offClip}
                      value={Math.round(transform.y * 10) / 10}
                      onFocus={gesture.begin}
                      onBlur={gesture.end}
                      onChange={(e) => {
                        const y = Number(e.target.value);
                        if (!Number.isFinite(y)) return;
                        liveValue("transform.y", y);
                      }}
                    />
                    <span className="transform-fields__value-unit">px</span>
                  </div>
                </InspectorKeyframeRow>
              </div>
            </div>
          </div>

          <InspectorKeyframeRow
            clipId={clip.id}
            path="transform.rotation"
            label="Rotate"
            disabled={offClip}
          >
            <span className="transform-fields__rotate-icon" aria-hidden>
              <IconRotate size={14} />
            </span>
            <div className="transform-fields__value">
              <input
                type="number"
                className="inspector-number transform-fields__value-input"
                disabled={offClip}
                value={Math.round(transform.rotation * 10) / 10}
                min={-180}
                max={180}
                step={0.5}
                onFocus={gesture.begin}
                onBlur={gesture.end}
                onChange={(e) => {
                  const rotation = Number(e.target.value);
                  if (!Number.isFinite(rotation)) return;
                  liveValue(
                    "transform.rotation",
                    Math.min(180, Math.max(-180, rotation)),
                  );
                }}
              />
              <span className="transform-fields__value-unit">°</span>
            </div>
            <input
              type="range"
              className="inspector-slider"
              min={-180}
              max={180}
              step={0.5}
              disabled={offClip}
              value={transform.rotation}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) => {
                liveValue("transform.rotation", Number(e.target.value));
              }}
            />
          </InspectorKeyframeRow>
        </>
      )}
    </section>
  );
}

/** Align helpers for VideoBasicPanel — writes via animatable paths. */
export function commitAlignTransform(
  clip: Clip,
  values: Pick<ResolvedTransform, "x" | "y">,
  localMs: number,
  fps: number,
): Partial<Clip> {
  return patchClipTransformValues(clip, values, localMs, fps);
}
