import { useEffect, useRef, useState } from "react";
import {
  estimateSmartKeyParams,
  smartKeyBackdropSampleUVs,
  smartKeySubjectSampleUVs,
} from "../compositor/removeBgColor";
import { IconChevronDown, IconEyedropper } from "../icons/Icons";
import { sourceMsAtLocal } from "../engine/speedRemap";
import { clipLocalMs } from "../engine/time";
import {
  createDefaultRemoveBg,
  DEFAULT_REMOVE_BG_COLOR,
} from "../project/removeBgDefaults";
import type { Clip, RemoveBgParams, Track } from "../project/types";
import { samplePreviewSourcePixel } from "../preview/previewWorkerClient";
import { useEditorStore } from "../store/editorStore";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clip: Clip;
  track: Track;
};

function rgbToHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb;
  return `#${[r, g, b]
    .map((c) =>
      Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, "0"),
    )
    .join("")}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function cloneParams(removeBg: RemoveBgParams): RemoveBgParams {
  return {
    ...removeBg,
    color: {
      ...removeBg.color,
      keyColor: [...removeBg.color.keyColor] as [number, number, number],
    },
  };
}

export function VideoRemoveBgPanel({ clip, track }: Props) {
  const locked = track.locked;
  const gesture = useClipGestureEdit(clip.id, "Remove BG");
  const removeBgEyedropperClipId = useEditorStore(
    (s) => s.removeBgEyedropperClipId,
  );
  const setRemoveBgEyedropperClipId = useEditorStore(
    (s) => s.setRemoveBgEyedropperClipId,
  );

  const removeBg = clip.removeBg;
  const enabled = Boolean(removeBg?.enabled);
  const [bodyOpen, setBodyOpen] = useState(true);
  const [sampling, setSampling] = useState(false);
  const eyedropperOn = removeBgEyedropperClipId === clip.id;
  const autoSampledRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      const id = useEditorStore.getState().removeBgEyedropperClipId;
      if (id === clip.id) setRemoveBgEyedropperClipId(null);
    };
  }, [clip.id, setRemoveBgEyedropperClipId]);

  const patchRemoveBg = (next: RemoveBgParams): Partial<Clip> => ({
    removeBg: next,
  });

  const ensureParams = (): RemoveBgParams =>
    removeBg ? cloneParams(removeBg) : createDefaultRemoveBg();

  const runSmartKeyAutoSample = async (): Promise<boolean> => {
    if (locked || !clip.mediaId || sampling) return false;
    // Mark early so enable + effect don't race a second pass.
    autoSampledRef.current = clip.id;
    const project = useEditorStore.getState().project;
    const local = clipLocalMs(project.playheadMs, clip);
    if (local === null) {
      autoSampledRef.current = null;
      return false;
    }
    const sourceMs = sourceMsAtLocal(clip, local, project.fps);
    const media = project.mediaIndex.find((m) => m.id === clip.mediaId);
    const w = media?.width && media.width > 0 ? media.width : project.width;
    const h = media?.height && media.height > 0 ? media.height : project.height;
    const backdropUVs = smartKeyBackdropSampleUVs(w, h);
    const subjectUVs = smartKeySubjectSampleUVs();

    setSampling(true);
    try {
      const [backdropColors, subjectColors] = await Promise.all([
        Promise.all(
          backdropUVs.map(([u, v]) =>
            samplePreviewSourcePixel({
              assetId: clip.mediaId!,
              sourceMs,
              u,
              v,
            }),
          ),
        ),
        Promise.all(
          subjectUVs.map(([u, v]) =>
            samplePreviewSourcePixel({
              assetId: clip.mediaId!,
              sourceMs,
              u,
              v,
            }),
          ),
        ),
      ]);
      const estimated = estimateSmartKeyParams({
        backdropSamples: backdropColors.map(
          (c) => [c.r, c.g, c.b] as [number, number, number],
        ),
        subjectSamples: subjectColors.map(
          (c) => [c.r, c.g, c.b] as [number, number, number],
        ),
      });
      const base = ensureParams();
      gesture.commit(
        patchRemoveBg({
          ...base,
          enabled: true,
          color: {
            ...base.color,
            ...estimated,
            keyColor: [...estimated.keyColor] as [number, number, number],
          },
        }),
        "Remove BG",
      );
      return true;
    } catch (err) {
      console.warn("Remove BG Smart Key auto-sample failed", err);
      autoSampledRef.current = null;
      return false;
    } finally {
      setSampling(false);
    }
  };

  // When opening a clip that already has Remove BG on default emerald, auto-tune once.
  useEffect(() => {
    if (!enabled || locked || !clip.mediaId) return;
    if (autoSampledRef.current === clip.id) return;
    const color = removeBg?.color;
    const stillDefaultKey =
      !color ||
      (color.keyColor[0] === DEFAULT_REMOVE_BG_COLOR.keyColor[0] &&
        color.keyColor[1] === DEFAULT_REMOVE_BG_COLOR.keyColor[1] &&
        color.keyColor[2] === DEFAULT_REMOVE_BG_COLOR.keyColor[2]);
    if (!stillDefaultKey) {
      autoSampledRef.current = clip.id;
      return;
    }
    void runSmartKeyAutoSample();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sample once per enable/clip
  }, [enabled, clip.id, clip.mediaId, locked]);

  const enableRemoveBg = (on: boolean) => {
    if (locked) return;
    if (on) {
      autoSampledRef.current = null;
      const next = removeBg
        ? { ...cloneParams(removeBg), enabled: true }
        : createDefaultRemoveBg();
      gesture.commit(patchRemoveBg(next), "Remove BG");
      setBodyOpen(true);
      void runSmartKeyAutoSample();
    } else {
      if (!removeBg) return;
      setRemoveBgEyedropperClipId(null);
      gesture.commit(
        patchRemoveBg({ ...cloneParams(removeBg), enabled: false }),
        "Remove BG",
      );
    }
  };

  const liveColorField = (
    field: "tolerance" | "softness" | "spill" | "choke",
    value: number,
  ) => {
    if (locked || !enabled) return;
    const base = ensureParams();
    gesture.ensureBegin();
    gesture.live(
      patchRemoveBg({
        ...base,
        enabled: true,
        color: { ...base.color, [field]: value },
      }),
    );
  };

  const color = removeBg?.color ?? createDefaultRemoveBg().color;
  const colorControls = {
    tolerance: color.tolerance ?? DEFAULT_REMOVE_BG_COLOR.tolerance,
    softness: color.softness ?? DEFAULT_REMOVE_BG_COLOR.softness,
    spill: color.spill ?? DEFAULT_REMOVE_BG_COLOR.spill,
    choke: color.choke ?? DEFAULT_REMOVE_BG_COLOR.choke,
  };
  const hex = rgbToHex(color.keyColor);

  return (
    <section className="inspector-section inspector-blend inspector-remove-bg">
      <div className="inspector-blend__head">
        <label className="inspector-blend__enable">
          <input
            type="checkbox"
            className="inspector-switch"
            disabled={locked}
            checked={enabled}
            onChange={(e) => enableRemoveBg(e.target.checked)}
          />
          <span>Remove BG</span>
        </label>
        <button
          type="button"
          className="inspector-blend__chevron-btn"
          disabled={!enabled}
          aria-expanded={bodyOpen}
          aria-label={bodyOpen ? "Collapse Remove BG" : "Expand Remove BG"}
          onClick={() => setBodyOpen((v) => !v)}
        >
          <IconChevronDown
            size={14}
            className={
              bodyOpen
                ? "inspector-blend__chevron"
                : "inspector-blend__chevron inspector-blend__chevron--closed"
            }
          />
        </button>
      </div>

      {enabled && bodyOpen && (
        <div className="inspector-blend__body inspector-remove-bg__body">
          <label className="inspector-field">
            <span className="inspector-field__label">Key color</span>
            <div className="inspector-remove-bg__color-row">
              <input
                type="color"
                className="inspector-color"
                disabled={locked || sampling}
                value={hex}
                onChange={(e) => {
                  const rgb = hexToRgb(e.target.value);
                  if (!rgb || locked) return;
                  const base = ensureParams();
                  gesture.commit(
                    patchRemoveBg({
                      ...base,
                      enabled: true,
                      color: { ...base.color, keyColor: rgb },
                    }),
                    "Remove BG",
                  );
                }}
              />
              <button
                type="button"
                className={
                  eyedropperOn
                    ? "inspector-basic-footer__btn inspector-basic-footer__btn--active"
                    : "inspector-basic-footer__btn"
                }
                disabled={locked || sampling}
                title="Pick key color from preview"
                aria-pressed={eyedropperOn}
                aria-label="Eyedropper"
                onClick={() => {
                  if (locked) return;
                  setRemoveBgEyedropperClipId(eyedropperOn ? null : clip.id);
                }}
              >
                <IconEyedropper size={14} />
              </button>
              <button
                type="button"
                className="inspector-basic-footer__btn"
                disabled={locked || sampling || !clip.mediaId}
                title="Auto-sample backdrop and tune Smart Key"
                onClick={() => {
                  autoSampledRef.current = null;
                  void runSmartKeyAutoSample();
                }}
              >
                {sampling ? "…" : "Auto-Sample"}
              </button>
            </div>
          </label>

          {(
            [
              ["tolerance", "Similarity", colorControls.tolerance],
              ["softness", "Smoothness", colorControls.softness],
              ["spill", "Edge Snap", colorControls.spill],
              ["choke", "Edge Shrink", colorControls.choke],
            ] as const
          ).map(([field, label, value]) => (
            <div key={field} className="inspector-field">
              <span className="inspector-field__label">{label}</span>
              <div className="inspector-field__controls">
                <input
                  type="range"
                  className="inspector-slider"
                  min={0}
                  max={100}
                  step={1}
                  disabled={locked || sampling}
                  value={Math.round(value * 100)}
                  onPointerDown={gesture.begin}
                  onPointerUp={gesture.end}
                  onChange={(e) =>
                    liveColorField(field, Number(e.target.value) / 100)
                  }
                />
                <input
                  type="number"
                  className="inspector-number"
                  disabled={locked || sampling}
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(value * 100)}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    if (!Number.isFinite(pct)) return;
                    liveColorField(
                      field,
                      Math.min(100, Math.max(0, pct)) / 100,
                    );
                  }}
                />
                <span className="inspector-field__unit">%</span>
              </div>
            </div>
          ))}

          {eyedropperOn && (
            <p className="inspector-panel__hint inspector-panel__hint--tight">
              Click the preview to pick the backdrop color.
            </p>
          )}
          {!eyedropperOn && (
            <p className="inspector-panel__hint inspector-panel__hint--tight">
              Auto-Sample picks the backdrop and tunes Similarity / Smoothness
              from the current frame.
            </p>
          )}
        </div>
      )}

      {locked && <p className="inspector-panel__hint">Track is locked.</p>}
    </section>
  );
}
