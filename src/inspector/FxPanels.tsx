import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_TRANSITION_DURATION_MS,
  resizeTransitionDuration,
} from "../engine/editPoints";
import { effectDisplayName, loadEffectManifest } from "../effects/manifest";
import { filterDisplayName, loadFilterManifest } from "../filters/manifest";
import {
  IconChevronDown,
  IconReset,
  IconStepperDown,
  IconStepperUp,
} from "../icons/Icons";
import {
  evaluateEffectIntensity,
  evaluateFilterStrength,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import type { Clip, Track } from "../project/types";
import { useEditorStore } from "../store/editorStore";
import {
  findTransition,
  loadTransitionManifest,
  transitionDisplayName,
} from "../transitions/manifest";
import { InspectorKeyframeRow } from "./InspectorKeyframeRow";
import { useClipGestureEdit } from "./useClipGestureEdit";

type BaseProps = {
  clip: Clip;
  track: Track;
};

export function FilterClipPanel({ clip, track }: BaseProps) {
  const locked = track.locked;
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const gesture = useClipGestureEdit(clip.id, "Filter");
  const filter = clip.filter;
  const [name, setName] = useState(filter?.lutId ?? "Filter");

  useEffect(() => {
    let cancelled = false;
    void loadFilterManifest().then(() => {
      if (!cancelled && filter?.lutId) {
        setName(filterDisplayName(filter.lutId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter?.lutId]);

  if (!filter) {
    return (
      <div className="inspector-video">
        <p className="inspector-panel__hint">No filter on this clip.</p>
      </div>
    );
  }

  const localMs = clipLocalMs(playheadMs, clip);
  const offClip = localMs === null || locked;
  const strength =
    localMs !== null
      ? evaluateFilterStrength(clip, localMs)
      : (filter.strength.staticValue ?? 1);
  const strengthPct = Math.round(strength * 100);

  return (
    <div className="inspector-video">
      <div className="inspector-video__subtabs">
        <button
          type="button"
          className="inspector-video__subtab inspector-video__subtab--active"
        >
          Filter
        </button>
      </div>
      <section className="inspector-section">
        <label className="inspector-field">
          <span className="inspector-field__label">LUT</span>
          <span className="inspector-panel__hint">{name}</span>
        </label>
        <InspectorKeyframeRow
          clipId={clip.id}
          path="filter.strength"
          label="Strength"
          disabled={offClip}
        >
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={100}
            value={strengthPct}
            disabled={offClip}
            onPointerDown={gesture.begin}
            onPointerUp={gesture.end}
            onChange={(e) => {
              if (offClip) return;
              gesture.ensureBegin();
              setAnimatableValue(
                clip.id,
                "filter.strength",
                Number(e.target.value) / 100,
              );
            }}
          />
          <span className="inspector-field__unit">{strengthPct}%</span>
        </InspectorKeyframeRow>
        <button
          type="button"
          className="media-panel__toolbar-import"
          disabled={locked}
          onClick={() => gesture.commit({ filter: undefined }, "Clear filter")}
        >
          Clear filter
        </button>
      </section>
    </div>
  );
}

export function EffectClipPanel({ clip, track }: BaseProps) {
  const locked = track.locked;
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const gesture = useClipGestureEdit(clip.id, "Effect");
  const effect = clip.effect;
  const [name, setName] = useState(effect?.effectId ?? "Effect");

  useEffect(() => {
    let cancelled = false;
    void loadEffectManifest().then(() => {
      if (!cancelled && effect?.effectId) {
        setName(effectDisplayName(effect.effectId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [effect?.effectId]);

  if (!effect) {
    return (
      <div className="inspector-video">
        <p className="inspector-panel__hint">No effect params.</p>
      </div>
    );
  }

  const localMs = clipLocalMs(playheadMs, clip);
  const offClip = localMs === null || locked;
  const intensity =
    localMs !== null
      ? evaluateEffectIntensity(clip, localMs)
      : (effect.intensity?.staticValue ?? 1);
  const intensityPct = Math.round(intensity * 100);

  return (
    <div className="inspector-video">
      <div className="inspector-video__subtabs">
        <button
          type="button"
          className="inspector-video__subtab inspector-video__subtab--active"
        >
          Effect
        </button>
      </div>
      <section className="inspector-section">
        <label className="inspector-field">
          <span className="inspector-field__label">Preset</span>
          <span className="inspector-panel__hint">{name}</span>
        </label>
        <InspectorKeyframeRow
          clipId={clip.id}
          path="effect.intensity"
          label="Intensity"
          disabled={offClip}
        >
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={100}
            value={intensityPct}
            disabled={offClip}
            onPointerDown={gesture.begin}
            onPointerUp={gesture.end}
            onChange={(e) => {
              if (offClip) return;
              gesture.ensureBegin();
              setAnimatableValue(
                clip.id,
                "effect.intensity",
                Number(e.target.value) / 100,
              );
            }}
          />
          <span className="inspector-field__unit">{intensityPct}%</span>
        </InspectorKeyframeRow>
      </section>
    </div>
  );
}

const TRANSITION_DURATION_MIN_MS = 100;
const TRANSITION_DURATION_MAX_MS = 5000;
const TRANSITION_DURATION_STEP_MS = 100;

function formatDurationSeconds(ms: number): string {
  const s = ms / 1000;
  const rounded = Math.round(s * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}.0s` : `${rounded}s`;
}

function parseDurationSeconds(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/s$/, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}

/** Right inspector when a timeline transition marker is selected. */
export function TransitionInspectorPanel({ clip, track }: BaseProps) {
  const locked = track.locked;
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const transition = clip.transition;
  const [name, setName] = useState(transition?.presetId ?? "Transition");
  const [defaultDurationMs, setDefaultDurationMs] = useState(
    DEFAULT_TRANSITION_DURATION_MS,
  );
  const [open, setOpen] = useState(true);
  const [durationDraft, setDurationDraft] = useState(
    formatDurationSeconds(transition?.durationMs ?? DEFAULT_TRANSITION_DURATION_MS),
  );
  const durationBeforeRef = useRef<Track[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTransitionManifest().then((manifest) => {
      if (cancelled || !transition?.presetId) return;
      setName(transitionDisplayName(transition.presetId));
      const entry = findTransition(manifest, transition.presetId);
      if (entry) setDefaultDurationMs(entry.defaultDurationMs);
    });
    return () => {
      cancelled = true;
    };
  }, [transition?.presetId]);

  useEffect(() => {
    if (transition) {
      setDurationDraft(formatDurationSeconds(transition.durationMs));
    }
  }, [transition?.durationMs]);

  if (!transition) return null;

  const applyDuration = (ms: number, label = "Transition duration") => {
    const clamped = Math.min(
      TRANSITION_DURATION_MAX_MS,
      Math.max(TRANSITION_DURATION_MIN_MS, Math.round(ms)),
    );
    const before = structuredClone(useEditorStore.getState().project.tracks);
    const next = resizeTransitionDuration(before, clip.id, clamped);
    if (!next) return;
    commitTracksTransition(before, next, label);
  };

  const liveDuration = (ms: number) => {
    const clamped = Math.min(
      TRANSITION_DURATION_MAX_MS,
      Math.max(TRANSITION_DURATION_MIN_MS, Math.round(ms)),
    );
    const origin = durationBeforeRef.current ?? useEditorStore.getState().project.tracks;
    const next = resizeTransitionDuration(origin, clip.id, clamped);
    if (next) {
      useEditorStore.setState((s) => ({
        project: { ...s.project, tracks: next },
      }));
    }
  };

  const commitLiveDuration = () => {
    const before = durationBeforeRef.current;
    durationBeforeRef.current = null;
    if (!before) return;
    commitTracksTransition(
      before,
      useEditorStore.getState().project.tracks,
      "Transition duration",
    );
  };

  return (
    <div className="inspector-transition">
      <section className="inspector-transition__section">
        <div className="inspector-transition__head">
          <button
            type="button"
            className="inspector-transition__toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span>Transition parameters</span>
            <IconChevronDown
              size={14}
              className={
                open
                  ? "inspector-transition__chevron"
                  : "inspector-transition__chevron inspector-transition__chevron--closed"
              }
            />
          </button>
          <button
            type="button"
            className="inspector-transition__reset"
            title="Reset"
            aria-label="Reset"
            disabled={locked}
            onClick={() => applyDuration(defaultDurationMs, "Reset transition")}
          >
            <IconReset size={14} />
          </button>
        </div>

        {open && (
          <div className="inspector-transition__body">
            <div className="inspector-transition__name-row">
              <span className="inspector-transition__label">Name</span>
              <span className="inspector-transition__value">{name}</span>
            </div>

            <div className="inspector-transition__duration">
              <span className="inspector-transition__label">Duration</span>
              <div className="inspector-transition__duration-row">
                <input
                  type="range"
                  className="inspector-transition__slider"
                  min={TRANSITION_DURATION_MIN_MS}
                  max={TRANSITION_DURATION_MAX_MS}
                  step={TRANSITION_DURATION_STEP_MS}
                  value={transition.durationMs}
                  disabled={locked}
                  style={{
                    background: `linear-gradient(to right, #fff ${
                      ((transition.durationMs - TRANSITION_DURATION_MIN_MS) /
                        (TRANSITION_DURATION_MAX_MS -
                          TRANSITION_DURATION_MIN_MS)) *
                      100
                    }%, #3a3a3a ${
                      ((transition.durationMs - TRANSITION_DURATION_MIN_MS) /
                        (TRANSITION_DURATION_MAX_MS -
                          TRANSITION_DURATION_MIN_MS)) *
                      100
                    }%)`,
                  }}
                  onPointerDown={() => {
                    durationBeforeRef.current = structuredClone(
                      useEditorStore.getState().project.tracks,
                    );
                  }}
                  onPointerUp={commitLiveDuration}
                  onChange={(e) => liveDuration(Number(e.target.value))}
                />
                <div className="inspector-transition__duration-input">
                  <input
                    type="text"
                    className="inspector-transition__seconds"
                    value={durationDraft}
                    disabled={locked}
                    onChange={(e) => setDurationDraft(e.target.value)}
                    onBlur={() => {
                      const parsed = parseDurationSeconds(durationDraft);
                      if (parsed == null) {
                        setDurationDraft(
                          formatDurationSeconds(transition.durationMs),
                        );
                        return;
                      }
                      applyDuration(parsed);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                  <div className="inspector-transition__steppers">
                    <button
                      type="button"
                      className="inspector-transition__step"
                      aria-label="Increase duration"
                      disabled={locked}
                      onClick={() =>
                        applyDuration(
                          transition.durationMs + TRANSITION_DURATION_STEP_MS,
                        )
                      }
                    >
                      <IconStepperUp size={10} />
                    </button>
                    <button
                      type="button"
                      className="inspector-transition__step"
                      aria-label="Decrease duration"
                      disabled={locked}
                      onClick={() =>
                        applyDuration(
                          transition.durationMs - TRANSITION_DURATION_STEP_MS,
                        )
                      }
                    >
                      <IconStepperDown size={10} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {!locked && (
        <button
          type="button"
          className="inspector-transition__clear"
          onClick={() => {
            const before = structuredClone(
              useEditorStore.getState().project.tracks,
            );
            const after = before.map((t) => {
              if (t.id !== track.id) return t;
              return {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clip.id ? { ...c, transition: undefined } : c,
                ),
              };
            });
            commitTracksTransition(before, after, "Clear transition");
            clearSelection();
          }}
        >
          Clear transition
        </button>
      )}
    </div>
  );
}

/** Compact strength controls when a LUT is applied on a video/image clip. */
export function VideoFilterSection({ clip, track }: BaseProps) {
  const locked = track.locked;
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const gesture = useClipGestureEdit(clip.id, "Filter");
  const filter = clip.filter;
  const [name, setName] = useState(filter?.lutId ?? "");

  useEffect(() => {
    let cancelled = false;
    void loadFilterManifest().then(() => {
      if (!cancelled && filter?.lutId) {
        setName(filterDisplayName(filter.lutId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter?.lutId]);

  if (!filter) return null;
  const localMs = clipLocalMs(playheadMs, clip);
  const offClip = localMs === null || locked;
  const strength =
    localMs !== null
      ? evaluateFilterStrength(clip, localMs)
      : filter.strength.staticValue;
  const strengthPct = Math.round(strength * 100);

  return (
    <section className="inspector-section">
      <div className="inspector-section__head">
        <h3 className="inspector-section__title">Filter</h3>
      </div>
      <label className="inspector-field">
        <span className="inspector-field__label">LUT</span>
        <span className="inspector-panel__hint">{name}</span>
      </label>
      <InspectorKeyframeRow
        clipId={clip.id}
        path="filter.strength"
        label="Strength"
        disabled={offClip}
      >
        <input
          type="range"
          className="inspector-slider"
          min={0}
          max={100}
          value={strengthPct}
          disabled={offClip}
          onPointerDown={gesture.begin}
          onPointerUp={gesture.end}
          onChange={(e) => {
            if (offClip) return;
            gesture.ensureBegin();
            setAnimatableValue(
              clip.id,
              "filter.strength",
              Number(e.target.value) / 100,
            );
          }}
        />
        <span className="inspector-field__unit">{strengthPct}%</span>
      </InspectorKeyframeRow>
      <button
        type="button"
        className="media-panel__toolbar-import"
        disabled={locked}
        onClick={() => gesture.commit({ filter: undefined }, "Clear filter")}
      >
        Clear filter
      </button>
    </section>
  );
}
