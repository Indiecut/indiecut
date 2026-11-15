import {
  formatLinearGradientCss,
} from "../compositor/rasterizeText";
import type { Clip, TextProps, Track } from "../project/types";
import {
  applyEffectPreset,
  EFFECT_PRESETS,
  effectRecipePartial,
  parseGradientStops,
} from "../textStyles/effectPresets";
import { ColorField } from "./ColorField";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clip: Clip;
  track: Track;
  text: TextProps;
};

export function TextEffectsPanel({ clip, track, text }: Props) {
  const locked = track.locked;
  const gesture = useClipGestureEdit(clip.id, "Text effects");
  const stops = parseGradientStops(text.gradient);

  const patchText = (partial: Partial<TextProps>, label = "Text effects") => {
    gesture.commit(
      { text: { ...text, ...effectRecipePartial(text, partial) } },
      label,
    );
  };

  const liveText = (partial: Partial<TextProps>) => {
    gesture.live({
      text: { ...text, ...effectRecipePartial(text, partial) },
    });
  };

  const setGradient = (enabled: boolean, angle: number, from: string, to: string) => {
    if (!enabled) {
      liveText({ gradient: null });
      return;
    }
    liveText({ gradient: formatLinearGradientCss(angle, from, to) });
  };

  return (
    <section className="inspector-section">
      <div className="inspector-section__head">
        <h3 className="inspector-section__title">Effects</h3>
      </div>
      <p className="inspector-panel__hint">
        Gradient fill and one-tap glow / outline recipes. Same fields as Basic.
      </p>

      <div
        className="text-anim__grid text-anim__grid--aa"
        role="listbox"
        aria-label="Effect presets"
      >
        {EFFECT_PRESETS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="option"
            disabled={locked}
            title={entry.name}
            className="text-anim__tile"
            onClick={() =>
              gesture.commit(
                { text: applyEffectPreset(text, entry.id) },
                "Text effect",
              )
            }
          >
            <span className="text-aa__sample" aria-hidden>
              Aa
            </span>
            <span className="text-anim__label">{entry.name}</span>
          </button>
        ))}
      </div>

      <label className="inspector-toggle-row">
        <span className="inspector-field__label">Gradient fill</span>
        <input
          type="checkbox"
          className="inspector-switch"
          disabled={locked}
          checked={stops.enabled}
          onChange={(e) => {
            const on = e.target.checked;
            if (on) {
              patchText(
                {
                  gradient: formatLinearGradientCss(
                    stops.angle,
                    stops.from,
                    stops.to,
                  ),
                },
                "Gradient on",
              );
            } else {
              patchText({ gradient: null }, "Gradient off");
            }
          }}
        />
      </label>

      {stops.enabled ? (
        <>
          <ColorField
            label="From"
            value={stops.from}
            fallback="#38bdf8"
            locked={locked}
            onBegin={gesture.begin}
            onEnd={gesture.end}
            onLive={(hex) =>
              setGradient(true, stops.angle, hex, stops.to)
            }
          />
          <ColorField
            label="To"
            value={stops.to}
            fallback="#1d4ed8"
            locked={locked}
            onBegin={gesture.begin}
            onEnd={gesture.end}
            onLive={(hex) =>
              setGradient(true, stops.angle, stops.from, hex)
            }
          />
          <label className="inspector-field">
            <span className="inspector-field__label">Angle</span>
            <div className="inspector-field__controls">
              <input
                type="range"
                className="inspector-slider"
                min={0}
                max={360}
                step={1}
                disabled={locked}
                value={stops.angle}
                onPointerDown={gesture.begin}
                onPointerUp={gesture.end}
                onChange={(e) =>
                  setGradient(
                    true,
                    Number(e.target.value),
                    stops.from,
                    stops.to,
                  )
                }
              />
              <input
                type="number"
                className="inspector-number"
                disabled={locked}
                min={0}
                max={360}
                value={Math.round(stops.angle)}
                onFocus={gesture.begin}
                onBlur={gesture.end}
                onChange={(e) => {
                  const angle = Number(e.target.value);
                  if (!Number.isFinite(angle)) return;
                  setGradient(true, angle, stops.from, stops.to);
                }}
              />
            </div>
          </label>
        </>
      ) : null}
    </section>
  );
}
