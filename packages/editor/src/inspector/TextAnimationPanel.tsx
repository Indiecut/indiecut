import { useEffect, useState } from "react";
import {
  DEFAULT_PHASE_MS,
  MAX_PHASE_MS,
  MIN_PHASE_MS,
} from "../engine/textAnimation";
import type {
  Clip,
  TextAnimDirection,
  TextAnimationGranularity,
  TextAnimationParams,
  TextAnimPhase,
  Track,
} from "../project/types";
import {
  findTextAnimPreset,
  loadTextAnimManifest,
  presetsForPhase,
  textAnimThumbUrl,
  type TextAnimManifest,
  type TextAnimPhaseKind,
} from "../textAnimations/registry";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clip: Clip;
  track: Track;
  /**
   * Stickers are a single graphic — hide text granularity and skip
   * character/word presets like typewriter.
   */
  variant?: "text" | "sticker";
};

const PHASE_TABS: { id: TextAnimPhaseKind; label: string }[] = [
  { id: "in", label: "In" },
  { id: "out", label: "Out" },
  { id: "loop", label: "Loop" },
];

const GRANULARITIES: { id: TextAnimationGranularity; label: string }[] = [
  { id: "whole", label: "Whole" },
  { id: "line", label: "Line" },
  { id: "word", label: "Word" },
  { id: "character", label: "Char" },
];

const DIRECTIONS: { id: TextAnimDirection; label: string }[] = [
  { id: "left", label: "←" },
  { id: "right", label: "→" },
  { id: "up", label: "↑" },
  { id: "down", label: "↓" },
];

function resolveAnim(clip: Clip): TextAnimationParams {
  return {
    in: clip.animation?.in,
    out: clip.animation?.out,
    loop: clip.animation?.loop,
    granularity: clip.animation?.granularity ?? "whole",
  };
}

function phasePresetId(
  anim: TextAnimationParams,
  phase: TextAnimPhaseKind,
): string {
  if (phase === "in") return anim.in?.presetId ?? "none";
  if (phase === "out") return anim.out?.presetId ?? "none";
  return anim.loop?.presetId ?? "none";
}

export function TextAnimationPanel({
  clip,
  track,
  variant = "text",
}: Props) {
  const locked = track.locked;
  const isSticker = variant === "sticker";
  const gesture = useClipGestureEdit(
    clip.id,
    isSticker ? "Sticker animation" : "Text animation",
  );
  const [phaseTab, setPhaseTab] = useState<TextAnimPhaseKind>("in");
  const [manifest, setManifest] = useState<TextAnimManifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTextAnimManifest()
      .then((m) => {
        if (!cancelled) setManifest(m);
      })
      .catch((err) => {
        console.error("Failed to load text animations", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const anim = resolveAnim(clip);
  const selectedId = phasePresetId(anim, phaseTab);
  const presets = (manifest ? presetsForPhase(manifest, phaseTab) : []).filter(
    (p) => {
      if (!isSticker) return true;
      if (p.id === "typewriter") return false;
      if (p.preferGranularity && p.preferGranularity !== "whole") return false;
      return true;
    },
  );
  const selectedMeta = manifest
    ? findTextAnimPreset(manifest, phaseTab, selectedId)
    : undefined;

  const activePhase: TextAnimPhase | undefined =
    phaseTab === "in" ? anim.in : phaseTab === "out" ? anim.out : undefined;

  const supportsDirection = Boolean(selectedMeta?.supportsDirection);
  const showDuration = phaseTab !== "loop" && selectedId !== "none";

  const patchAnim = (
    next: TextAnimationParams,
    label = "Text animation",
  ) => {
    gesture.commit({ animation: next }, label);
  };

  const liveAnim = (next: TextAnimationParams) => {
    gesture.live({ animation: next });
  };

  const applyPreset = (presetId: string) => {
    const meta = manifest
      ? findTextAnimPreset(manifest, phaseTab, presetId)
      : undefined;
    const next: TextAnimationParams = { ...anim };

    if (phaseTab === "loop") {
      next.loop =
        presetId === "none" ? undefined : { presetId };
    } else {
      if (presetId === "none") {
        if (phaseTab === "in") next.in = undefined;
        else next.out = undefined;
      } else {
        const phase: TextAnimPhase = {
          presetId,
          durationMs:
            meta?.defaultDurationMs ??
            activePhase?.durationMs ??
            DEFAULT_PHASE_MS,
          direction: activePhase?.direction ?? "up",
        };
        if (phaseTab === "in") next.in = phase;
        else next.out = phase;
      }
    }

    if (isSticker) {
      next.granularity = "whole";
    } else if (meta?.preferGranularity) {
      next.granularity = meta.preferGranularity;
    }

    patchAnim(next, `Animation ${phaseTab}`);
  };

  const setDirection = (direction: TextAnimDirection) => {
    if (phaseTab === "loop" || selectedId === "none") return;
    const phase: TextAnimPhase = {
      presetId: selectedId,
      durationMs: activePhase?.durationMs ?? DEFAULT_PHASE_MS,
      direction,
    };
    const next: TextAnimationParams = { ...anim };
    if (phaseTab === "in") next.in = phase;
    else next.out = phase;
    patchAnim(next, "Animation direction");
  };

  const durationPhasePatch = (durationMs: number): TextAnimationParams => {
    const clamped = Math.min(
      MAX_PHASE_MS,
      Math.max(MIN_PHASE_MS, durationMs),
    );
    const phase: TextAnimPhase = {
      presetId: selectedId,
      durationMs: clamped,
      direction: activePhase?.direction ?? "up",
    };
    const next: TextAnimationParams = { ...anim };
    if (phaseTab === "in") next.in = phase;
    else if (phaseTab === "out") next.out = phase;
    return next;
  };

  const setGranularity = (granularity: TextAnimationGranularity) => {
    patchAnim({ ...anim, granularity }, "Animation granularity");
  };

  const durationMs = activePhase?.durationMs ?? DEFAULT_PHASE_MS;
  const durationSec = durationMs / 1000;

  return (
    <div className="text-anim">
      <div className="inspector-video__subtabs" role="tablist">
        {PHASE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={phaseTab === tab.id}
            className={
              phaseTab === tab.id
                ? "inspector-video__subtab inspector-video__subtab--active"
                : "inspector-video__subtab"
            }
            onClick={() => setPhaseTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="inspector-section">
        <div
          className="text-anim__grid"
          role="listbox"
          aria-label={`${phaseTab} animation presets`}
        >
          {presets.map((preset) => {
            const active = selectedId === preset.id;
            return (
              <button
                key={`${preset.phase}-${preset.id}`}
                type="button"
                role="option"
                aria-selected={active}
                disabled={locked}
                title={preset.name}
                className={
                  active
                    ? "text-anim__tile text-anim__tile--active"
                    : "text-anim__tile"
                }
                onClick={() => applyPreset(preset.id)}
              >
                {preset.id === "none" || !preset.thumb ? (
                  <span className="text-anim__none">None</span>
                ) : (
                  <img
                    className="text-anim__thumb"
                    src={textAnimThumbUrl(preset.thumb)}
                    alt=""
                    draggable={false}
                  />
                )}
                <span className="text-anim__label">{preset.name}</span>
              </button>
            );
          })}
        </div>

        {supportsDirection && (
          <label className="inspector-field">
            <span className="inspector-field__label">Direction</span>
            <div className="inspector-field__controls inspector-chip-row">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={
                    (activePhase?.direction ?? "up") === d.id
                      ? "inspector-chip inspector-chip--active"
                      : "inspector-chip"
                  }
                  disabled={locked}
                  onClick={() => setDirection(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </label>
        )}

        {showDuration && (
          <label className="inspector-field">
            <span className="inspector-field__label">Duration</span>
            <div className="inspector-field__controls">
              <input
                type="range"
                className="inspector-slider"
                min={MIN_PHASE_MS / 1000}
                max={MAX_PHASE_MS / 1000}
                step={0.1}
                disabled={locked}
                value={durationSec}
                onPointerDown={gesture.begin}
                onPointerUp={gesture.end}
                onChange={(e) =>
                  liveAnim(durationPhasePatch(Number(e.target.value) * 1000))
                }
              />
              <input
                type="number"
                className="inspector-number"
                disabled={locked}
                min={MIN_PHASE_MS / 1000}
                max={MAX_PHASE_MS / 1000}
                step={0.1}
                value={Number(durationSec.toFixed(1))}
                onFocus={gesture.begin}
                onBlur={gesture.end}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  liveAnim(durationPhasePatch(v * 1000));
                }}
              />
              <span className="text-anim__unit">s</span>
            </div>
          </label>
        )}

        {!isSticker ? (
          <label className="inspector-field">
            <span className="inspector-field__label">Granularity</span>
            <div className="inspector-field__controls inspector-chip-row">
              {GRANULARITIES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={
                    (anim.granularity ?? "whole") === g.id
                      ? "inspector-chip inspector-chip--active"
                      : "inspector-chip"
                  }
                  disabled={locked}
                  onClick={() => setGranularity(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </label>
        ) : null}
      </section>
    </div>
  );
}
