import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { textHasShadow } from "../compositor/rasterizeText";
import { evaluateClipOpacity } from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import {
  findFontByStack,
  getRecentFontStacks,
  rememberFontStack,
  TEXT_FONTS,
  type TextFontEntry,
} from "../fonts/registry";
import type { Clip, TextProps, TextRunStyle, Track } from "../project/types";
import { useEditorStore } from "../store/editorStore";
import {
  applyStyleToRange,
  expandRunChars,
  mapRunStyles,
  normalizeTextProps,
  replaceContentKeepingBaseStyle,
  resolvedRuns,
} from "../text/runs";
import {
  WORD_ART_PRESETS,
  wordArtById,
  wordArtSampleStyle,
} from "../text/wordArt";
import {
  AA_CUSTOM_PRESET_ID,
  touchesAaRecipe,
} from "../textStyles/aaPresets";
import {
  applyTemplateRecipe,
  getTextTemplates,
  type TextTemplateEntry,
} from "../textTemplates/registry";
import { ColorField, toPickerHex } from "./ColorField";
import { Clip3DPanel } from "./Clip3DPanel";
import { InspectorKeyframeRow } from "./InspectorKeyframeRow";
import { TextAnimationPanel } from "./TextAnimationPanel";
import { TextBubblePanel } from "./TextBubblePanel";
import { TextEffectsPanel } from "./TextEffectsPanel";
import { TextTemplateThumb } from "./TextTemplateThumb";
import { TransformFields } from "./TransformFields";
import { useClipGestureEdit } from "./useClipGestureEdit";

const DEFAULT_RETRO_3D = "#7c2d12";

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
  return normalizeTextProps({
    content: t?.content ?? "Text",
    runs: t?.runs,
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
  });
}

const RUN_STYLE_KEYS = new Set<keyof TextRunStyle>([
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "textTransform",
  "script",
  "color",
  "gradient",
  "highlight",
  "strokeColor",
  "strokeWidth",
  "letterSpacing",
]);

function pickRunStylePartial(
  partial: Partial<TextProps>,
): TextRunStyle | null {
  const out: TextRunStyle = {};
  let any = false;
  for (const key of RUN_STYLE_KEYS) {
    if (key in partial) {
      (out as Record<string, unknown>)[key] = (partial as TextRunStyle)[key];
      any = true;
    }
  }
  return any ? out : null;
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
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const localMs = clipLocalMs(playheadMs, clip);
  const opacity =
    localMs !== null
      ? evaluateClipOpacity(clip, localMs)
      : evaluateClipOpacity(clip, 0);
  const opacityDisabled = locked || localMs === null;

  const text = resolvePanelText(clip);
  const shadowOn = textHasShadow(text);
  const retroOn =
    typeof text.retro3DColor === "string" && text.retro3DColor.length > 0;
  const weightNum =
    typeof text.fontWeight === "number"
      ? text.fontWeight
      : Number.parseInt(String(text.fontWeight), 10) || 600;

  /** Content textarea selection — styles apply to this range when non-empty. */
  const [contentSel, setContentSel] = useState({ start: 0, end: 0 });
  const hasContentRange = contentSel.start !== contentSel.end;

  const syncContentSel = (
    el: HTMLTextAreaElement | null | undefined,
  ) => {
    if (!el) return;
    setContentSel({ start: el.selectionStart, end: el.selectionEnd });
  };

  /** Active style at caret / selection start (for chip pressed state). */
  const activeStyle: TextRunStyle = (() => {
    const chars = expandRunChars(resolvedRuns(text));
    if (chars.length === 0) {
      return {
        fontFamily: text.fontFamily,
        fontSize: text.fontSize,
        fontWeight: text.fontWeight,
        fontStyle: text.fontStyle,
        textDecoration: text.textDecoration,
        textTransform: text.textTransform,
        color: text.color,
        gradient: text.gradient,
        strokeColor: text.strokeColor,
        strokeWidth: text.strokeWidth,
        letterSpacing: text.letterSpacing,
        script: "normal" as const,
        highlight: null,
      };
    }
    const idx = Math.min(
      Math.max(0, Math.min(contentSel.start, contentSel.end)),
      chars.length - 1,
    );
    const runStyle = chars[idx]?.style ?? {};
    return {
      fontFamily: runStyle.fontFamily ?? text.fontFamily,
      fontSize: runStyle.fontSize ?? text.fontSize,
      fontWeight: runStyle.fontWeight ?? text.fontWeight,
      fontStyle: runStyle.fontStyle ?? text.fontStyle,
      textDecoration: runStyle.textDecoration ?? text.textDecoration,
      textTransform: runStyle.textTransform ?? text.textTransform,
      color: runStyle.color ?? text.color,
      gradient:
        runStyle.gradient !== undefined ? runStyle.gradient : text.gradient,
      highlight: runStyle.highlight ?? null,
      strokeColor: runStyle.strokeColor ?? text.strokeColor,
      strokeWidth: runStyle.strokeWidth ?? text.strokeWidth,
      letterSpacing: runStyle.letterSpacing ?? text.letterSpacing,
      script: runStyle.script ?? "normal",
    };
  })();

  const boldOn =
    (typeof activeStyle.fontWeight === "number"
      ? activeStyle.fontWeight
      : Number.parseInt(String(activeStyle.fontWeight ?? weightNum), 10) ||
        600) >= 700;
  const italicOn = activeStyle.fontStyle === "italic";
  const underlineOn = activeStyle.textDecoration === "underline";
  const strikeOn = activeStyle.textDecoration === "line-through";
  const upperOn = activeStyle.textTransform === "uppercase";
  const scriptMode = activeStyle.script ?? "normal";
  const highlightColor =
    activeStyle.highlight && activeStyle.highlight.startsWith("#")
      ? activeStyle.highlight.slice(0, 7)
      : "#facc15";

  const recipePartial = (partial: Partial<TextProps>): Partial<TextProps> => {
    if (!touchesAaRecipe(partial)) return partial;
    if (text.stylePresetId === AA_CUSTOM_PRESET_ID) return partial;
    return { ...partial, stylePresetId: AA_CUSTOM_PRESET_ID };
  };

  const applyRunPatch = (
    current: TextProps,
    runPatch: TextRunStyle,
  ): TextProps => {
    // Non-empty content selection → style that span; otherwise whole clip.
    if (hasContentRange) {
      const a = Math.min(contentSel.start, contentSel.end);
      const b = Math.max(contentSel.start, contentSel.end);
      const runs = applyStyleToRange(resolvedRuns(current), a, b, runPatch);
      return normalizeTextProps({ ...current, runs });
    }
    return mapRunStyles(current, (style) => ({
      ...(style ?? {}),
      ...runPatch,
    }));
  };

  const mergeTextPartial = (
    partial: Partial<TextProps> & TextRunStyle,
  ): TextProps => {
    const withRecipe = recipePartial(partial);
    if ("content" in withRecipe && typeof withRecipe.content === "string") {
      return replaceContentKeepingBaseStyle(
        { ...text, ...withRecipe },
        withRecipe.content,
      );
    }

    const runPatch = pickRunStylePartial(withRecipe);
    // Strip run-only keys that are not on TextProps before spreading.
    const {
      script: _script,
      highlight: _highlight,
      ...boxPartial
    } = withRecipe as Partial<TextProps> & TextRunStyle;
    void _script;
    void _highlight;

    let next = normalizeTextProps({ ...text, ...boxPartial });
    if (runPatch) next = applyRunPatch(next, runPatch);
    return next;
  };

  const patchText = (
    partial: Partial<TextProps> & TextRunStyle,
    label = "Text",
  ) => {
    gesture.commit({ text: mergeTextPartial(partial) }, label);
  };

  const liveText = (partial: Partial<TextProps> & TextRunStyle) => {
    gesture.live({ text: mergeTextPartial(partial) });
  };

  const applyWordArt = (id: string) => {
    const entry = wordArtById(id);
    if (!entry) return;
    gesture.commit(
      { text: applyRunPatch(text, entry.style) },
      entry.label,
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
                Applies design and sample text to this clip.
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
                      <TextTemplateThumb entry={entry} />
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
                onBlur={(e) => {
                  syncContentSel(e.currentTarget);
                  gesture.end();
                }}
                onSelect={(e) => syncContentSel(e.currentTarget)}
                onKeyUp={(e) => syncContentSel(e.currentTarget)}
                onMouseUp={(e) => syncContentSel(e.currentTarget)}
                onChange={(e) => {
                  syncContentSel(e.currentTarget);
                  liveText({ content: e.target.value });
                }}
              />
            </label>
            <p className="inspector-panel__hint">
              Select part of the text above to style only that span. With no
              selection, styles apply to the whole clip.
            </p>

            <div className="inspector-field">
              <span className="inspector-field__label">Font</span>
              <FontPicker
                value={
                  activeStyle.fontFamily ??
                  text.fontFamily ??
                  "system-ui, sans-serif"
                }
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
                  value={activeStyle.fontSize ?? text.fontSize}
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
                  value={activeStyle.fontSize ?? text.fontSize}
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
                <button
                  type="button"
                  className={
                    strikeOn
                      ? "inspector-chip inspector-chip--style inspector-chip--active"
                      : "inspector-chip inspector-chip--style"
                  }
                  disabled={locked}
                  aria-pressed={strikeOn}
                  title="Strikethrough"
                  onClick={() =>
                    patchText(
                      {
                        textDecoration: strikeOn ? "none" : "line-through",
                      },
                      "Strikethrough",
                    )
                  }
                >
                  S
                </button>
                <button
                  type="button"
                  className={
                    upperOn
                      ? "inspector-chip inspector-chip--style inspector-chip--active"
                      : "inspector-chip inspector-chip--style"
                  }
                  disabled={locked}
                  aria-pressed={upperOn}
                  title="Uppercase"
                  onClick={() =>
                    patchText(
                      {
                        textTransform: upperOn ? "none" : "uppercase",
                      },
                      "Uppercase",
                    )
                  }
                >
                  AA
                </button>
                <button
                  type="button"
                  className={
                    scriptMode === "super"
                      ? "inspector-chip inspector-chip--style inspector-chip--active"
                      : "inspector-chip inspector-chip--style"
                  }
                  disabled={locked}
                  aria-pressed={scriptMode === "super"}
                  title="Superscript"
                  onClick={() =>
                    patchText(
                      {
                        script:
                          scriptMode === "super" ? "normal" : "super",
                      },
                      "Superscript",
                    )
                  }
                >
                  X²
                </button>
                <button
                  type="button"
                  className={
                    scriptMode === "sub"
                      ? "inspector-chip inspector-chip--style inspector-chip--active"
                      : "inspector-chip inspector-chip--style"
                  }
                  disabled={locked}
                  aria-pressed={scriptMode === "sub"}
                  title="Subscript"
                  onClick={() =>
                    patchText(
                      {
                        script: scriptMode === "sub" ? "normal" : "sub",
                      },
                      "Subscript",
                    )
                  }
                >
                  X₂
                </button>
              </div>
            </div>

            <ColorField
              label="Color"
              value={activeStyle.color ?? text.color ?? "#ffffff"}
              fallback="#ffffff"
              locked={locked}
              onBegin={gesture.begin}
              onEnd={gesture.end}
              onLive={(hex) => liveText({ color: hex, gradient: null })}
            />

            <ColorField
              label="Highlight"
              value={highlightColor}
              fallback="#facc15"
              locked={locked}
              onBegin={gesture.begin}
              onEnd={gesture.end}
              onLive={(hex) => liveText({ highlight: hex })}
            />
            <div className="inspector-field">
              <span className="inspector-field__label" />
              <button
                type="button"
                className="inspector-chip"
                disabled={locked || !activeStyle.highlight}
                onClick={() =>
                  patchText({ highlight: null }, "Clear highlight")
                }
              >
                Clear highlight
              </button>
            </div>

            <div className="inspector-field inspector-field--stack">
              <span className="inspector-field__label">WordArt</span>
              <div
                className="text-anim__grid text-anim__grid--wordart"
                role="listbox"
                aria-label="WordArt styles"
              >
                {WORD_ART_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    disabled={locked}
                    title={p.label}
                    aria-label={p.label}
                    className="text-anim__tile"
                    onClick={() => applyWordArt(p.id)}
                  >
                    <span
                      className="text-aa__sample"
                      style={wordArtSampleStyle(p)}
                      aria-hidden
                    >
                      Aa
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <InspectorKeyframeRow
              clipId={clip.id}
              path="opacity"
              label="Opacity"
              disabled={opacityDisabled}
            >
              <input
                type="range"
                className="inspector-slider"
                min={0}
                max={100}
                step={1}
                disabled={opacityDisabled}
                value={Math.round(opacity * 100)}
                onPointerDown={gesture.begin}
                onPointerUp={gesture.end}
                onChange={(e) => {
                  gesture.ensureBegin();
                  setAnimatableValue(
                    clip.id,
                    "opacity",
                    Number(e.target.value) / 100,
                  );
                }}
              />
              <input
                type="number"
                className="inspector-number"
                disabled={opacityDisabled}
                min={0}
                max={100}
                step={1}
                value={Math.round(opacity * 100)}
                onFocus={gesture.begin}
                onBlur={gesture.end}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  if (!Number.isFinite(pct)) return;
                  gesture.ensureBegin();
                  setAnimatableValue(
                    clip.id,
                    "opacity",
                    Math.min(100, Math.max(0, pct)) / 100,
                  );
                }}
              />
              <span className="inspector-field__unit">%</span>
            </InspectorKeyframeRow>

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
