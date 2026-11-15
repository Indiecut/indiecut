import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { textHasShadow } from "../compositor/rasterizeText";
import {
  findFontByStack,
  getRecentFontStacks,
  rememberFontStack,
  TEXT_FONTS,
  type TextFontEntry,
} from "../fonts/registry";
import type { Clip, TextProps, Track } from "../project/types";
import {
  AA_CUSTOM_PRESET_ID,
  AA_STYLE_PRESETS,
  applyAaPreset,
  cleanRecipeDefaults,
  resolveActiveAaPresetId,
  touchesAaRecipe,
  type AaPreset,
} from "../textStyles/aaPresets";
import {
  applyTemplateRecipe,
  getTextTemplates,
  type TextTemplateEntry,
} from "../textTemplates/registry";
import { ColorField, toPickerHex } from "./ColorField";
import { Clip3DPanel } from "./Clip3DPanel";
import { TextAnimationPanel } from "./TextAnimationPanel";
import { TextBubblePanel } from "./TextBubblePanel";
import { TextEffectsPanel } from "./TextEffectsPanel";
import { TransformFields } from "./TransformFields";
import { useClipGestureEdit } from "./useClipGestureEdit";

const DEFAULT_RETRO_3D = "#7c2d12";

function aaSampleStyle(preset: AaPreset): CSSProperties {
  const p = { ...cleanRecipeDefaults(), ...preset.patch };
  const strokeW = p.strokeWidth ?? 0;
  const blur = p.shadowBlur ?? 0;
  const ox = p.shadowOffsetX ?? 0;
  const oy = p.shadowOffsetY ?? 0;
  const shadowColor = p.shadowColor ?? "transparent";
  return {
    color: p.color ?? "#ffffff",
    WebkitTextStroke:
      strokeW > 0
        ? `${Math.min(2, strokeW * 0.45)}px ${p.strokeColor ?? "#000000"}`
        : undefined,
    textShadow:
      blur > 0 || ox !== 0 || oy !== 0
        ? `${ox}px ${oy}px ${Math.min(12, blur)}px ${shadowColor}`
        : undefined,
  };
}

function templateSampleStyle(entry: TextTemplateEntry): CSSProperties {
  const r = entry.recipe;
  const strokeW = r.strokeWidth ?? 0;
  const blur = r.shadowBlur ?? 0;
  const ox = r.shadowOffsetX ?? 0;
  const oy = r.shadowOffsetY ?? 0;
  const shadowColor = r.shadowColor ?? "transparent";
  const bubble = r.bubble;
  const chromeOn = Boolean(bubble && bubble.type && bubble.type !== "none");
  return {
    color: r.color ?? "#ffffff",
    fontFamily: r.fontFamily,
    fontWeight: (r.fontWeight as CSSProperties["fontWeight"]) ?? 700,
    fontStyle: r.fontStyle ?? "normal",
    WebkitTextStroke:
      strokeW > 0
        ? `${Math.min(2, strokeW * 0.4)}px ${r.strokeColor ?? "#000000"}`
        : undefined,
    textShadow:
      blur > 0 || ox !== 0 || oy !== 0
        ? `${ox * 0.35}px ${oy * 0.35}px ${Math.min(10, blur * 0.45)}px ${shadowColor}`
        : undefined,
    background: chromeOn ? bubble?.fill : undefined,
    border:
      chromeOn && (bubble?.strokeWidth ?? 0) > 0
        ? `${Math.min(2, bubble?.strokeWidth ?? 1)}px solid ${bubble?.stroke ?? "#000"}`
        : undefined,
    borderRadius:
      bubble?.type === "pill"
        ? 999
        : bubble?.type === "rounded-rect" || bubble?.type === "speech-round"
          ? 8
          : chromeOn
            ? 5
            : undefined,
    padding: chromeOn ? "4px 6px" : undefined,
    boxShadow:
      bubble?.type === "neon-frame"
        ? `0 0 8px ${bubble.stroke}`
        : undefined,
  };
}

function templateSampleLabel(entry: TextTemplateEntry): string {
  const firstLine = entry.defaultText.split("\n")[0] ?? entry.defaultText;
  return firstLine.length > 8 ? `${firstLine.slice(0, 7)}…` : firstLine;
}

type Tab = "Text" | "Animation" | "3D";
type TextSubtab = "Primary" | "Templates" | "Shape" | "Effects";

type Props = {
  clip: Clip;
  track: Track;
};

const DEFAULT_SHADOW = {
  shadowColor: "rgba(0,0,0,0.55)",
  shadowBlur: 4,
  shadowOffsetX: 1.5,
  shadowOffsetY: 1.5,
} as const;

function resolvePanelText(clip: Clip): TextProps {
  const t = clip.text;
  return {
    content: t?.content ?? "Text",
    fontFamily: t?.fontFamily ?? "system-ui, sans-serif",
    fontSize: t?.fontSize ?? 48,
    fontWeight: t?.fontWeight ?? 600,
    fontStyle: t?.fontStyle ?? "normal",
    textDecoration: t?.textDecoration ?? "none",
    textTransform: t?.textTransform,
    color: t?.color ?? "#ffffff",
    gradient: t?.gradient,
    align: t?.align ?? "center",
    letterSpacing: t?.letterSpacing ?? 0,
    lineHeight: t?.lineHeight,
    strokeColor: t?.strokeColor ?? "#000000",
    strokeWidth: t?.strokeWidth ?? 0,
    shadowColor: t?.shadowColor,
    shadowBlur: t?.shadowBlur,
    shadowOffsetX: t?.shadowOffsetX,
    shadowOffsetY: t?.shadowOffsetY,
    retro3DColor: t?.retro3DColor,
    bubble: t?.bubble,
    stylePresetId: t?.stylePresetId,
    templateId: t?.templateId,
  };
}

function FontPicker({
  value,
  locked,
  onPick,
}: {
  value: string;
  locked: boolean;
  onPick: (stack: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => getRecentFontStacks());
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const active = findFontByStack(value) ?? TEXT_FONTS[0]!;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const recentEntries = useMemo(() => {
    return recent
      .map((stack) => findFontByStack(stack))
      .filter((f): f is TextFontEntry => Boolean(f));
  }, [recent]);

  const pick = (entry: TextFontEntry) => {
    onPick(entry.stack);
    rememberFontStack(entry.stack);
    setRecent(getRecentFontStacks());
    setOpen(false);
  };

  const renderRow = (entry: TextFontEntry) => {
    const selected = entry.stack === active.stack;
    return (
      <button
        key={entry.id}
        type="button"
        role="option"
        aria-selected={selected}
        className={
          selected
            ? "inspector-font-picker__option inspector-font-picker__option--active"
            : "inspector-font-picker__option"
        }
        style={{ fontFamily: entry.stack }}
        onClick={() => pick(entry)}
      >
        <span className="inspector-font-picker__name">{entry.label}</span>
        {selected ? (
          <span className="inspector-font-picker__check" aria-hidden>
            ✓
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="inspector-font-picker" ref={rootRef}>
      <button
        type="button"
        className="inspector-font-picker__trigger"
        disabled={locked}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        style={{ fontFamily: active.stack }}
      >
        <span>{active.label}</span>
        <span className="inspector-font-picker__chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="inspector-font-picker__menu"
        >
          {recentEntries.length > 0 ? (
            <div className="inspector-font-picker__group">
              <div className="inspector-font-picker__group-label">
                Recently used
              </div>
              {recentEntries.map(renderRow)}
            </div>
          ) : null}
          <div className="inspector-font-picker__group">
            <div className="inspector-font-picker__group-label">Presets</div>
            {TEXT_FONTS.map(renderRow)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TextBasicPanel({ clip, track }: Props) {
  const [tab, setTab] = useState<Tab>("Text");
  const [textSubtab, setTextSubtab] = useState<TextSubtab>("Primary");
  const locked = track.locked;
  const gesture = useClipGestureEdit(clip.id, "Text");
  const templates = useMemo(() => getTextTemplates(), []);

  const text = resolvePanelText(clip);
  const shadowOn = textHasShadow(text);
  const retroOn =
    typeof text.retro3DColor === "string" && text.retro3DColor.length > 0;
  const activeAaId = resolveActiveAaPresetId(text);
  const weightNum =
    typeof text.fontWeight === "number"
      ? text.fontWeight
      : Number.parseInt(String(text.fontWeight), 10) || 600;
  const boldOn = weightNum >= 700;
  const italicOn = text.fontStyle === "italic";
  const underlineOn = text.textDecoration === "underline";

  const recipePartial = (partial: Partial<TextProps>): Partial<TextProps> => {
    if (!touchesAaRecipe(partial)) return partial;
    if (text.stylePresetId === AA_CUSTOM_PRESET_ID) return partial;
    return { ...partial, stylePresetId: AA_CUSTOM_PRESET_ID };
  };

  const patchText = (partial: Partial<TextProps>, label = "Text") => {
    gesture.commit({ text: { ...text, ...recipePartial(partial) } }, label);
  };

  const liveText = (partial: Partial<TextProps>) => {
    gesture.live({ text: { ...text, ...recipePartial(partial) } });
  };

  const applyStylePreset = (presetId: string) => {
    gesture.commit(
      { text: applyAaPreset(text, presetId) },
      "Text style",
    );
  };

  const applyTemplate = (entry: TextTemplateEntry) => {
    const nextText = applyTemplateRecipe(text, entry);
    if (entry.defaultAnimation) {
      gesture.commit(
        { text: nextText, animation: entry.defaultAnimation },
        "Text template",
      );
    } else {
      gesture.commit({ text: nextText }, "Text template");
    }
  };

  return (
    <div className="inspector-video">
      <div className="inspector-video__tabs" role="tablist">
        {(["Text", "Animation", "3D"] as const).map((name) => (
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

      {tab === "Animation" ? (
        <div className="inspector-video__body">
          <TextAnimationPanel clip={clip} track={track} />
        </div>
      ) : tab === "3D" ? (
        <div className="inspector-video__body">
          <Clip3DPanel clip={clip} track={track} />
        </div>
      ) : (
        <>
          <div className="inspector-video__subtabs" role="tablist">
            {(["Primary", "Templates", "Shape", "Effects"] as const).map(
              (name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={textSubtab === name}
                  className={
                    textSubtab === name
                      ? "inspector-video__subtab inspector-video__subtab--active"
                      : "inspector-video__subtab"
                  }
                  onClick={() => setTextSubtab(name)}
                >
                  {name}
                </button>
              ),
            )}
          </div>

          <div className="inspector-video__body">
          {textSubtab === "Templates" ? (
            <section className="inspector-section">
              <div className="inspector-section__head">
                <h3 className="inspector-section__title">Shape styles</h3>
              </div>
              <p className="inspector-panel__hint">
                Applies style to this clip. Content is kept.
              </p>
              <div
                className="text-anim__grid text-anim__grid--aa"
                role="listbox"
                aria-label="Text templates"
              >
                {templates.map((entry) => {
                  const active = text.templateId === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={locked}
                      title={entry.name}
                      className={
                        active
                          ? "text-anim__tile text-anim__tile--active"
                          : "text-anim__tile"
                      }
                      onClick={() => applyTemplate(entry)}
                    >
                      <span
                        className="text-aa__sample"
                        style={templateSampleStyle(entry)}
                        aria-hidden
                      >
                        {templateSampleLabel(entry)}
                      </span>
                      <span className="text-anim__label">{entry.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : textSubtab === "Shape" ? (
            <TextBubblePanel clip={clip} track={track} text={text} />
          ) : textSubtab === "Effects" ? (
            <TextEffectsPanel clip={clip} track={track} text={text} />
          ) : (
            <>
          <section className="inspector-section">
            <div className="inspector-section__head">
              <h3 className="inspector-section__title">Content</h3>
            </div>
            <label className="inspector-field inspector-field--stack">
              <span className="inspector-field__label">Text</span>
              <textarea
                className="inspector-textarea"
                disabled={locked}
                rows={3}
                value={text.content}
                onFocus={gesture.begin}
                onBlur={gesture.end}
                onChange={(e) => liveText({ content: e.target.value })}
              />
            </label>

            <div className="inspector-field">
              <span className="inspector-field__label">Font</span>
              <FontPicker
                value={text.fontFamily ?? "system-ui, sans-serif"}
                locked={locked}
                onPick={(stack) => patchText({ fontFamily: stack }, "Font")}
              />
            </div>

            <label className="inspector-field">
              <span className="inspector-field__label">Size</span>
              <div className="inspector-field__controls">
                <input
                  type="range"
                  className="inspector-slider"
                  min={12}
                  max={200}
                  step={1}
                  disabled={locked}
                  value={text.fontSize}
                  onPointerDown={gesture.begin}
                  onPointerUp={gesture.end}
                  onChange={(e) =>
                    liveText({ fontSize: Number(e.target.value) })
                  }
                />
                <input
                  type="number"
                  className="inspector-number"
                  disabled={locked}
                  value={text.fontSize}
                  min={12}
                  max={200}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const fontSize = Number(e.target.value);
                    if (!Number.isFinite(fontSize)) return;
                    liveText({
                      fontSize: Math.min(200, Math.max(12, fontSize)),
                    });
                  }}
                />
              </div>
            </label>

            <div className="inspector-field">
              <span className="inspector-field__label">Style</span>
              <div className="inspector-field__controls inspector-chip-row">
                <button
                  type="button"
                  className={
                    boldOn
                      ? "inspector-chip inspector-chip--style inspector-chip--active"
                      : "inspector-chip inspector-chip--style"
                  }
                  disabled={locked}
                  aria-pressed={boldOn}
                  onClick={() =>
                    patchText(
                      { fontWeight: boldOn ? 600 : 700 },
                      "Bold",
                    )
                  }
                >
                  B
                </button>
                <button
                  type="button"
                  className={
                    italicOn
                      ? "inspector-chip inspector-chip--style inspector-chip--active"
                      : "inspector-chip inspector-chip--style"
                  }
                  disabled={locked}
                  aria-pressed={italicOn}
                  onClick={() =>
                    patchText(
                      { fontStyle: italicOn ? "normal" : "italic" },
                      "Italic",
                    )
                  }
                >
                  I
                </button>
                <button
                  type="button"
                  className={
                    underlineOn
                      ? "inspector-chip inspector-chip--style inspector-chip--active"
                      : "inspector-chip inspector-chip--style"
                  }
                  disabled={locked}
                  aria-pressed={underlineOn}
                  onClick={() =>
                    patchText(
                      {
                        textDecoration: underlineOn ? "none" : "underline",
                      },
                      "Underline",
                    )
                  }
                >
                  U
                </button>
              </div>
            </div>

            <ColorField
              label="Color"
              value={text.color ?? "#ffffff"}
              fallback="#ffffff"
              locked={locked}
              onBegin={gesture.begin}
              onEnd={gesture.end}
              onLive={(hex) => liveText({ color: hex })}
            />

            <label className="inspector-field">
              <span className="inspector-field__label">Align</span>
              <div className="inspector-field__controls inspector-chip-row">
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={
                      text.align === a
                        ? "inspector-chip inspector-chip--active"
                        : "inspector-chip"
                    }
                    disabled={locked}
                    onClick={() => patchText({ align: a }, "Align")}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </label>

            <ColorField
              label="Stroke"
              value={text.strokeColor ?? "#000000"}
              fallback="#000000"
              locked={locked}
              onBegin={gesture.begin}
              onEnd={gesture.end}
              onLive={(hex) => liveText({ strokeColor: hex })}
            />

            <label className="inspector-field">
              <span className="inspector-field__label">Stroke width</span>
              <div className="inspector-field__controls">
                <input
                  type="number"
                  className="inspector-number"
                  disabled={locked}
                  min={0}
                  max={24}
                  value={text.strokeWidth ?? 0}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const strokeWidth = Number(e.target.value);
                    if (!Number.isFinite(strokeWidth)) return;
                    liveText({
                      strokeWidth: Math.min(24, Math.max(0, strokeWidth)),
                    });
                  }}
                />
              </div>
            </label>

            <label className="inspector-toggle-row">
              <span>Shadow</span>
              <input
                type="checkbox"
                className="inspector-switch"
                disabled={locked}
                checked={shadowOn}
                onChange={(e) => {
                  if (e.target.checked) {
                    patchText({ ...DEFAULT_SHADOW }, "Shadow");
                  } else {
                    const next: TextProps = { ...text };
                    delete next.shadowColor;
                    delete next.shadowBlur;
                    delete next.shadowOffsetX;
                    delete next.shadowOffsetY;
                    if (text.stylePresetId !== AA_CUSTOM_PRESET_ID) {
                      next.stylePresetId = AA_CUSTOM_PRESET_ID;
                    }
                    gesture.commit({ text: next }, "Shadow");
                  }
                }}
              />
            </label>

            {shadowOn ? (
              <>
                <ColorField
                  label="Shadow color"
                  value={toPickerHex(text.shadowColor, "#000000")}
                  fallback="#000000"
                  locked={locked}
                  onBegin={gesture.begin}
                  onEnd={gesture.end}
                  onLive={(hex) => liveText({ shadowColor: hex })}
                />
                <label className="inspector-field">
                  <span className="inspector-field__label">Blur</span>
                  <div className="inspector-field__controls">
                    <input
                      type="range"
                      className="inspector-slider"
                      min={0}
                      max={40}
                      step={1}
                      disabled={locked}
                      value={text.shadowBlur ?? 0}
                      onPointerDown={gesture.begin}
                      onPointerUp={gesture.end}
                      onChange={(e) =>
                        liveText({ shadowBlur: Number(e.target.value) })
                      }
                    />
                    <input
                      type="number"
                      className="inspector-number"
                      disabled={locked}
                      min={0}
                      max={40}
                      value={text.shadowBlur ?? 0}
                      onFocus={gesture.begin}
                      onBlur={gesture.end}
                      onChange={(e) => {
                        const shadowBlur = Number(e.target.value);
                        if (!Number.isFinite(shadowBlur)) return;
                        liveText({
                          shadowBlur: Math.min(40, Math.max(0, shadowBlur)),
                        });
                      }}
                    />
                  </div>
                </label>
                <label className="inspector-field">
                  <span className="inspector-field__label">Offset X</span>
                  <div className="inspector-field__controls">
                    <input
                      type="number"
                      className="inspector-number"
                      disabled={locked}
                      min={-40}
                      max={40}
                      value={text.shadowOffsetX ?? 0}
                      onFocus={gesture.begin}
                      onBlur={gesture.end}
                      onChange={(e) => {
                        const shadowOffsetX = Number(e.target.value);
                        if (!Number.isFinite(shadowOffsetX)) return;
                        liveText({
                          shadowOffsetX: Math.min(
                            40,
                            Math.max(-40, shadowOffsetX),
                          ),
                        });
                      }}
                    />
                  </div>
                </label>
                <label className="inspector-field">
                  <span className="inspector-field__label">Offset Y</span>
                  <div className="inspector-field__controls">
                    <input
                      type="number"
                      className="inspector-number"
                      disabled={locked}
                      min={-40}
                      max={40}
                      value={text.shadowOffsetY ?? 0}
                      onFocus={gesture.begin}
                      onBlur={gesture.end}
                      onChange={(e) => {
                        const shadowOffsetY = Number(e.target.value);
                        if (!Number.isFinite(shadowOffsetY)) return;
                        liveText({
                          shadowOffsetY: Math.min(
                            40,
                            Math.max(-40, shadowOffsetY),
                          ),
                        });
                      }}
                    />
                  </div>
                </label>
              </>
            ) : null}

            <label className="inspector-toggle-row">
              <span>3D extrusion</span>
              <input
                type="checkbox"
                className="inspector-switch"
                disabled={locked}
                checked={retroOn}
                onChange={(e) => {
                  if (e.target.checked) {
                    patchText(
                      { retro3DColor: text.retro3DColor || DEFAULT_RETRO_3D },
                      "3D extrusion",
                    );
                  } else {
                    patchText({ retro3DColor: null }, "3D extrusion");
                  }
                }}
              />
            </label>

            {retroOn ? (
              <ColorField
                label="Extrusion color"
                value={toPickerHex(text.retro3DColor ?? undefined, DEFAULT_RETRO_3D)}
                fallback={DEFAULT_RETRO_3D}
                locked={locked}
                onBegin={gesture.begin}
                onEnd={gesture.end}
                onLive={(hex) => liveText({ retro3DColor: hex })}
              />
            ) : null}

            <label className="inspector-field">
              <span className="inspector-field__label">Letter spacing</span>
              <div className="inspector-field__controls">
                <input
                  type="number"
                  className="inspector-number"
                  disabled={locked}
                  step={0.5}
                  value={text.letterSpacing ?? 0}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const letterSpacing = Number(e.target.value);
                    if (!Number.isFinite(letterSpacing)) return;
                    liveText({ letterSpacing });
                  }}
                />
              </div>
            </label>

            <label className="inspector-field">
              <span className="inspector-field__label">Line height</span>
              <div className="inspector-field__controls">
                <input
                  type="number"
                  className="inspector-number"
                  disabled={locked}
                  min={0.5}
                  max={4}
                  step={0.05}
                  placeholder="Auto"
                  value={text.lineHeight ?? ""}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      liveText({ lineHeight: undefined });
                      return;
                    }
                    const lineHeight = Number(raw);
                    if (!Number.isFinite(lineHeight)) return;
                    liveText({
                      lineHeight: Math.min(4, Math.max(0.5, lineHeight)),
                    });
                  }}
                />
              </div>
            </label>

            <div className="inspector-section__head">
              <h3 className="inspector-section__title">Preset style</h3>
            </div>
            <div
              className="text-anim__grid text-anim__grid--aa"
              role="listbox"
              aria-label="Text preset styles"
            >
              {AA_STYLE_PRESETS.map((preset) => {
                const active = activeAaId === preset.id;
                return (
                  <button
                    key={preset.id}
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
                    onClick={() => applyStylePreset(preset.id)}
                  >
                    {preset.id === "none" ? (
                      <span className="text-anim__none">None</span>
                    ) : (
                      <span
                        className="text-aa__sample"
                        style={aaSampleStyle(preset)}
                        aria-hidden
                      >
                        Aa
                      </span>
                    )}
                    <span className="text-anim__label">{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <TransformFields clip={clip} locked={locked} maxScalePercent={800} />
            </>
          )}
          </div>
        </>
      )}
    </div>
  );
}
