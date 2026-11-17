import { useMemo, useState } from "react";
import type { Clip, StickerStyleParams, Track } from "../project/types";
import {
  KINETIC_PALETTE_KEYS,
  KINETIC_PALETTE_LABELS,
  PALETTES,
  type KineticBacking,
  type KineticPaletteKey,
} from "../stickers/kinetic";
import {
  DEFAULT_STICKER_BACKING,
  DEFAULT_STICKER_PALETTE,
  DEFAULT_STICKER_STROKE,
  defaultStickerStyle,
} from "../stickers/stickerStyle";
import { useEditorStore } from "../store/editorStore";
import { Clip3DPanel } from "./Clip3DPanel";
import { TextAnimationPanel } from "./TextAnimationPanel";
import { TransformFields } from "./TransformFields";

type Props = {
  clip: Clip;
  track: Track;
};

type StickerTab = "Primary" | "Color" | "Animation" | "3D";

const BACKING_OPTIONS: { id: KineticBacking; label: string }[] = [
  { id: "diecut", label: "Die-cut" },
  { id: "flat", label: "Flat" },
  { id: "glow", label: "Glow" },
];

export function StickerBasicPanel({ clip, track }: Props) {
  const [tab, setTab] = useState<StickerTab>("Primary");
  const updateClip = useEditorStore((s) => s.updateClip);
  const locked = track.locked;

  const style = useMemo((): StickerStyleParams => {
    return { ...defaultStickerStyle(), ...clip.stickerStyle };
  }, [clip.stickerStyle]);

  const patchStyle = (partial: Partial<StickerStyleParams>) => {
    if (locked) return;
    updateClip(clip.id, { stickerStyle: { ...style, ...partial } });
  };

  const activePalette =
    PALETTES[(style.paletteKey ?? DEFAULT_STICKER_PALETTE) as KineticPaletteKey];

  return (
    <div className="inspector-video">
      <div className="inspector-video__tabs" role="tablist">
        {(["Primary", "Color", "Animation", "3D"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={
              tab === name
                ? "inspector-video__tab inspector-video__tab--active"
                : "inspector-video__tab"
            }
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="inspector-video__body">
        {tab === "3D" ? (
          <Clip3DPanel clip={clip} track={track} />
        ) : tab === "Animation" ? (
          <TextAnimationPanel clip={clip} track={track} variant="sticker" />
        ) : tab === "Color" ? (
          <section className="inspector-section">
            <div className="inspector-section__head">
              <h3 className="inspector-section__title">Sticker color</h3>
            </div>

            <div className="inspector-field inspector-field--stack">
              <span className="inspector-field__label">Palette</span>
              <div className="inspector-field__controls" style={{ flexWrap: "wrap", gap: 6 }}>
                {KINETIC_PALETTE_KEYS.map((key) => {
                  const pal = PALETTES[key];
                  const active =
                    (style.paletteKey ?? DEFAULT_STICKER_PALETTE) === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={locked}
                      title={KINETIC_PALETTE_LABELS[key]}
                      className={
                        active
                          ? "inspector-chip inspector-chip--active"
                          : "inspector-chip"
                      }
                      onClick={() => patchStyle({ paletteKey: key })}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: pal.primary,
                          boxShadow: `0 0 0 1px ${pal.stroke}`,
                        }}
                      />
                      {KINETIC_PALETTE_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {activePalette ? (
              <div className="inspector-field inspector-field--stack">
                <span className="inspector-field__label">Swatches</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    activePalette.primary,
                    activePalette.secondary,
                    activePalette.accent,
                    activePalette.mint,
                    activePalette.cyan,
                    activePalette.orange,
                    activePalette.purple,
                  ].map((c) => (
                    <span
                      key={c}
                      title={c}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: c,
                        border: "1px solid rgba(255,255,255,0.2)",
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="inspector-field inspector-field--stack">
              <span className="inspector-field__label">Style</span>
              <div className="inspector-field__controls inspector-field__controls--pair">
                {BACKING_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={locked}
                    className={
                      (style.backingMode ?? DEFAULT_STICKER_BACKING) === opt.id
                        ? "inspector-chip inspector-chip--active"
                        : "inspector-chip"
                    }
                    onClick={() => patchStyle({ backingMode: opt.id })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="inspector-field inspector-field--stack">
              <span className="inspector-field__label">
                Stroke {(style.strokeScale ?? DEFAULT_STICKER_STROKE).toFixed(1)}×
              </span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                disabled={locked}
                value={style.strokeScale ?? DEFAULT_STICKER_STROKE}
                onChange={(e) =>
                  patchStyle({ strokeScale: Number(e.target.value) })
                }
              />
            </label>

            <button
              type="button"
              className="inspector-chip"
              disabled={locked}
              style={{ marginTop: 8 }}
              onClick={() => updateClip(clip.id, { stickerStyle: defaultStickerStyle() })}
            >
              Reset color
            </button>
          </section>
        ) : (
          <TransformFields
            clip={clip}
            locked={track.locked}
            maxScalePercent={1200}
          />
        )}
      </div>
    </div>
  );
}
