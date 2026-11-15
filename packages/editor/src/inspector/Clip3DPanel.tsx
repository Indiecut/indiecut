import {
  defaultTransform3D,
  evaluateClipTransform,
  evaluateProperty,
  TRANSFORM3D_ANIMATABLE_PATHS,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import {
  DEFAULT_TRANSFORM3D_PERSPECTIVE,
  type Clip,
  type Track,
} from "../project/types";
import { useEditorStore } from "../store/editorStore";
import { InspectorKeyframeGroup } from "./InspectorKeyframeGroup";
import { InspectorKeyframeRow } from "./InspectorKeyframeRow";
import { Plane3DWidget } from "./Plane3DWidget";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clip: Clip;
  track: Track;
};

function sampleTransform3D(clip: Clip, localMs: number) {
  const t = clip.transform3d;
  return {
    rotateX: evaluateProperty(t?.rotateX, localMs, 0),
    rotateY: evaluateProperty(t?.rotateY, localMs, 0),
    rotateZ: evaluateProperty(t?.rotateZ, localMs, 0),
    z: evaluateProperty(t?.z, localMs, 0),
    perspective: evaluateProperty(
      t?.perspective,
      localMs,
      DEFAULT_TRANSFORM3D_PERSPECTIVE,
    ),
  };
}

export function Clip3DPanel({ clip, track }: Props) {
  const locked = track.locked;
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const frameWidth = useEditorStore((s) => s.project.width);
  const frameHeight = useEditorStore((s) => s.project.height);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const gesture = useClipGestureEdit(clip.id, "3D");

  const localMs = clipLocalMs(playheadMs, clip);
  const sampleMs = localMs ?? 0;
  const offClip = localMs === null || locked;
  const enabled = clip.transform3d?.enabled === true;
  const values = sampleTransform3D(clip, sampleMs);
  const transform2d = evaluateClipTransform(clip, sampleMs);
  const scaleX = transform2d.scaleX;
  const scaleY =
    transform2d.uniformScale !== false
      ? transform2d.scaleX
      : transform2d.scaleY;

  const liveValue = (
    path: (typeof TRANSFORM3D_ANIMATABLE_PATHS)[number],
    value: number,
  ) => {
    if (offClip || !enabled) return;
    gesture.ensureBegin();
    setAnimatableValue(clip.id, path, value);
  };

  const setEnabled = (on: boolean) => {
    if (locked) return;
    if (on) {
      // First enable → identity (no tilt). Re-enable restores last values.
      const next = clip.transform3d
        ? { ...clip.transform3d, enabled: true }
        : defaultTransform3D(true);
      gesture.commit({ transform3d: next }, "Enable 3D");
    } else if (clip.transform3d) {
      gesture.commit(
        { transform3d: { ...clip.transform3d, enabled: false } },
        "Disable 3D",
      );
    }
  };

  const reset = () => {
    if (locked) return;
    gesture.commit({ transform3d: defaultTransform3D(true) }, "Reset 3D");
  };

  return (
    <section className="inspector-section clip3d-panel">
      <div className="inspector-section__head">
        <h3 className="inspector-section__title">
          3D
          {enabled ? (
            <InspectorKeyframeGroup
              clipId={clip.id}
              paths={[...TRANSFORM3D_ANIMATABLE_PATHS]}
            />
          ) : null}
        </h3>
      </div>

      {!enabled ? (
        <>
          <p className="inspector-panel__hint">
            3D is off for this clip. Enable to tilt it as a perspective plane
            without changing other layers.
          </p>
          <label className="inspector-field inspector-field--check">
            <input
              type="checkbox"
              className="inspector-switch"
              disabled={locked}
              checked={false}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Enable 3D</span>
          </label>
        </>
      ) : (
        <>
          <label className="inspector-field inspector-field--check">
            <input
              type="checkbox"
              className="inspector-switch"
              disabled={locked}
              checked
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Enable 3D</span>
          </label>

          <p className="inspector-panel__hint">
            Grid is the preview screen (fixed). The red plane is this clip —
            Primary position/scale stick to it; drag or use sliders to tilt.
          </p>

          <Plane3DWidget
            rotateX={values.rotateX}
            rotateY={values.rotateY}
            rotateZ={values.rotateZ + transform2d.rotation}
            offsetX={transform2d.x}
            offsetY={transform2d.y}
            scaleX={scaleX}
            scaleY={scaleY}
            frameWidth={frameWidth}
            frameHeight={frameHeight}
            disabled={offClip}
            onDragStart={gesture.begin}
            onDragEnd={gesture.end}
            onRotate={(rx, ry) => {
              if (offClip) return;
              gesture.ensureBegin();
              setAnimatableValue(clip.id, "transform3d.rotateX", rx);
              setAnimatableValue(clip.id, "transform3d.rotateY", ry);
            }}
          />

          <InspectorKeyframeRow
            clipId={clip.id}
            path="transform3d.rotateX"
            label="Rotate X"
            disabled={offClip}
          >
            <input
              type="range"
              className="inspector-slider"
              min={-180}
              max={180}
              step={0.5}
              disabled={offClip}
              value={values.rotateX}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) =>
                liveValue("transform3d.rotateX", Number(e.target.value))
              }
            />
            <input
              type="number"
              className="inspector-number"
              disabled={offClip}
              value={Math.round(values.rotateX * 10) / 10}
              min={-180}
              max={180}
              step={0.5}
              onFocus={gesture.begin}
              onBlur={gesture.end}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                liveValue(
                  "transform3d.rotateX",
                  Math.min(180, Math.max(-180, v)),
                );
              }}
            />
            <span className="inspector-field__unit">°</span>
          </InspectorKeyframeRow>

          <InspectorKeyframeRow
            clipId={clip.id}
            path="transform3d.rotateY"
            label="Rotate Y"
            disabled={offClip}
          >
            <input
              type="range"
              className="inspector-slider"
              min={-180}
              max={180}
              step={0.5}
              disabled={offClip}
              value={values.rotateY}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) =>
                liveValue("transform3d.rotateY", Number(e.target.value))
              }
            />
            <input
              type="number"
              className="inspector-number"
              disabled={offClip}
              value={Math.round(values.rotateY * 10) / 10}
              min={-180}
              max={180}
              step={0.5}
              onFocus={gesture.begin}
              onBlur={gesture.end}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                liveValue(
                  "transform3d.rotateY",
                  Math.min(180, Math.max(-180, v)),
                );
              }}
            />
            <span className="inspector-field__unit">°</span>
          </InspectorKeyframeRow>

          <InspectorKeyframeRow
            clipId={clip.id}
            path="transform3d.rotateZ"
            label="Rotate Z"
            disabled={offClip}
          >
            <input
              type="range"
              className="inspector-slider"
              min={-180}
              max={180}
              step={0.5}
              disabled={offClip}
              value={values.rotateZ}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) =>
                liveValue("transform3d.rotateZ", Number(e.target.value))
              }
            />
            <input
              type="number"
              className="inspector-number"
              disabled={offClip}
              value={Math.round(values.rotateZ * 10) / 10}
              min={-180}
              max={180}
              step={0.5}
              onFocus={gesture.begin}
              onBlur={gesture.end}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                liveValue(
                  "transform3d.rotateZ",
                  Math.min(180, Math.max(-180, v)),
                );
              }}
            />
            <span className="inspector-field__unit">°</span>
          </InspectorKeyframeRow>

          <InspectorKeyframeRow
            clipId={clip.id}
            path="transform3d.z"
            label="Depth Z"
            disabled={offClip}
          >
            <input
              type="range"
              className="inspector-slider"
              min={-400}
              max={400}
              step={1}
              disabled={offClip}
              value={values.z}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) =>
                liveValue("transform3d.z", Number(e.target.value))
              }
            />
            <input
              type="number"
              className="inspector-number"
              disabled={offClip}
              value={Math.round(values.z)}
              min={-400}
              max={400}
              step={1}
              onFocus={gesture.begin}
              onBlur={gesture.end}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                liveValue("transform3d.z", Math.min(400, Math.max(-400, v)));
              }}
            />
          </InspectorKeyframeRow>

          <InspectorKeyframeRow
            clipId={clip.id}
            path="transform3d.perspective"
            label="Perspective"
            disabled={offClip}
          >
            <input
              type="range"
              className="inspector-slider"
              min={200}
              max={2000}
              step={10}
              disabled={offClip}
              value={values.perspective}
              onPointerDown={gesture.begin}
              onPointerUp={gesture.end}
              onChange={(e) =>
                liveValue("transform3d.perspective", Number(e.target.value))
              }
            />
            <input
              type="number"
              className="inspector-number"
              disabled={offClip}
              value={Math.round(values.perspective)}
              min={200}
              max={2000}
              step={10}
              onFocus={gesture.begin}
              onBlur={gesture.end}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                liveValue(
                  "transform3d.perspective",
                  Math.min(2000, Math.max(200, v)),
                );
              }}
            />
          </InspectorKeyframeRow>

          <button
            type="button"
            className="inspector-video__subtab"
            disabled={locked}
            onClick={reset}
          >
            Reset 3D
          </button>
        </>
      )}
    </section>
  );
}
