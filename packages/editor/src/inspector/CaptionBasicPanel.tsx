import { useId, useMemo, useRef, useState, useEffect, type CSSProperties } from "react";
import {
  findFontByStack,
  getRecentFontStacks,
  rememberFontStack,
  TEXT_FONTS,
  type TextFontEntry,
} from "../fonts/registry";
import type {
  CaptionCue,
  CaptionPosition,
  CaptionProps,
  Clip,
  TextProps,
  Track,
} from "../project/types";
import { markCaptionStyleCustom } from "../ai/captions/captionStylePresets";
import {
  CAPTION_MOTION_PRESETS,
  findCaptionMotionPreset,
  isCaptionCueStyled,
} from "../ai/captions/captionMotionPresets";
import {
  DEFAULT_CAPTION_DISPLAY,
  DEFAULT_CAPTION_WRAP_WIDTH,
  MAX_CAPTION_WRAP_WIDTH,
  MIN_CAPTION_WRAP_WIDTH,
  normalizeCaptionWrapWidth,
  resolveCaptionDisplay,
  type CaptionDisplayOptions,
} from "../ai/captions/captionDisplay";
import {
  captionDisplayMs,
  captionDurationForSpeed,
  DEFAULT_CAPTION_SPEED,
  MAX_CAPTION_SPEED,
  MIN_CAPTION_SPEED,
  normalizeCaptionSpeed,
} from "../ai/captions/captionTiming";
import {
  activeCaptionCue,
  captionTextForCue,
  resolveCaptionCueAnimation,
  resolveCaptionCueHidden,
  resolveCaptionCueLayoutY,
  resolveCaptionCueOffsetX,
  resolveCaptionCueOffsetY,
  resolveCaptionCuePosition,
  resolveCaptionCueStyle,
  resolveCaptionCueWrapWidth,
} from "../ai/captions/resolveCaptionText";
import { captionTransformY } from "../ai/captions/speechLineTextDefaults";
import { defaultAnimatableTransform, staticAnimatable } from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import { addTextClipAt } from "../media/addTextToTimeline";
import { useEditorStore } from "../store/editorStore";
import { ColorField, toPickerHex } from "./ColorField";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clip: Clip;
  track: Track;
};

type CaptionPanelTab = "options" | "styles";

function resolveCaption(clip: Clip): CaptionProps {
  const c = clip.caption;
  return {
    cues: c?.cues ?? [],
    style: {
      ...c?.style,
      fontFamily: c?.style.fontFamily ?? "system-ui, sans-serif",
      fontSize: c?.style.fontSize ?? 36,
      fontWeight: c?.style.fontWeight ?? "bold",
      color: c?.style.color ?? "#ffffff",
      align: c?.style.align ?? "center",
      strokeColor: c?.style.strokeColor ?? "#000000",
      strokeWidth: c?.style.strokeWidth ?? 0,
      lineHeight: c?.style.lineHeight ?? 1.2,
    },
    position: c?.position ?? "bottom",
    offsetX: c?.offsetX,
    offsetY: c?.offsetY ?? 0,
    wrapWidth: c?.wrapWidth,
    speed: normalizeCaptionSpeed(c?.speed),
    display: c?.display,
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
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = findFontByStack(value) ?? TEXT_FONTS[0]!;
  const recentStacks = getRecentFontStacks();
  const recentEntries = recentStacks
    .map((stack) => findFontByStack(stack))
    .filter((e): e is TextFontEntry => e != null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const renderRow = (entry: TextFontEntry) => {
    const active = entry.stack === current.stack;
    return (
      <button
        key={entry.id}
        type="button"
        role="option"
        aria-selected={active}
        className={
          active
            ? "inspector-font-picker__option inspector-font-picker__option--active"
            : "inspector-font-picker__option"
        }
        style={{ fontFamily: entry.stack }}
        onClick={() => {
          rememberFontStack(entry.stack);
          onPick(entry.stack);
          setOpen(false);
        }}
      >
        <span className="inspector-font-picker__option-name">{entry.label}</span>
        <span className="inspector-font-picker__option-sample" aria-hidden>
          Aa
        </span>
      </button>
    );
  };

  return (
    <div
      className={
        open
          ? "inspector-font-picker inspector-font-picker--open"
          : "inspector-font-picker"
      }
      ref={rootRef}
    >
      <button
        type="button"
        className="inspector-font-picker__trigger"
        disabled={locked}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="inspector-font-picker__trigger-label"
          style={{ fontFamily: current.stack }}
        >
          {current.label}
        </span>
        <span className="inspector-font-picker__chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div id={listId} role="listbox" className="inspector-font-picker__menu">
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

/** Strip Options overrides only — keep per-cue animation (Styles). */
function stripCueOptionOverrides(cue: CaptionCue): CaptionCue {
  const {
    style: _style,
    hidden: _hidden,
    position: _position,
    offsetX: _offsetX,
    offsetY: _offsetY,
    wrapWidth: _wrapWidth,
    ...rest
  } = cue;
  return rest;
}

function motionSampleCss(presetId: string): CSSProperties {
  const preset = findCaptionMotionPreset(presetId);
  const s = preset?.style;
  if (!s) {
    return { color: "#fff", fontWeight: 600, fontSize: 14 };
  }
  const strokeW = s.strokeWidth ?? 0;
  return {
    color: s.color ?? "#ffffff",
    fontFamily: s.fontFamily,
    fontWeight: (s.fontWeight as CSSProperties["fontWeight"]) ?? 700,
    fontStyle: s.fontStyle ?? "normal",
    fontSize: 14,
    textTransform: s.textTransform ?? "none",
    WebkitTextStroke:
      strokeW > 0
        ? `${Math.min(2, strokeW * 0.4)}px ${s.strokeColor ?? "#000"}`
        : undefined,
    textShadow:
      (s.shadowBlur ?? 0) > 0 ||
      (s.shadowOffsetX ?? 0) !== 0 ||
      (s.shadowOffsetY ?? 0) !== 0
        ? `${s.shadowOffsetX ?? 0}px ${s.shadowOffsetY ?? 0}px ${Math.min(10, s.shadowBlur ?? 0)}px ${s.shadowColor ?? "transparent"}`
        : undefined,
  };
}

function cuePreviewLabel(cue: CaptionCue | null): string {
  if (!cue) return "No caption at playhead";
  const text = cue.text.trim().replace(/\s+/g, " ");
  if (!text) return "Empty cue";
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export function CaptionBasicPanel({ clip, track }: Props) {
  const locked = track.locked;
  const gesture = useClipGestureEdit(clip.id, "Caption");
  const frameH = useEditorStore((s) => s.project.height);
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const selectedCaptionCueIds = useEditorStore((s) => s.selectedCaptionCueIds);
  const selectCaptionCue = useEditorStore((s) => s.selectCaptionCue);
  const [tab, setTab] = useState<CaptionPanelTab>("options");
  const caption = resolveCaption(clip);

  const localMs = clipLocalMs(playheadMs, clip);
  const playheadCue = useMemo(() => {
    if (localMs == null) return null;
    return activeCaptionCue(caption.cues, localMs, caption.speed);
  }, [caption.cues, caption.speed, localMs]);

  useEffect(() => {
    if (!playheadCue) return;
    if (
      selectedCaptionCueIds.length === 1 &&
      selectedCaptionCueIds[0] === playheadCue.id
    ) {
      return;
    }
    selectCaptionCue(clip.id, playheadCue.id, track.id, "replace");
  }, [
    playheadCue,
    playheadCue?.id,
    selectedCaptionCueIds,
    selectCaptionCue,
    clip.id,
    track.id,
  ]);

  const targetCue =
    playheadCue ??
    caption.cues.find((c) => c.id === selectedCaptionCueIds[0]) ??
    null;
  const targetCueIds = useMemo(
    () => (targetCue ? new Set([targetCue.id]) : new Set<string>()),
    [targetCue],
  );
  const canEditCue = targetCue != null;
  const style = resolveCaptionCueStyle(caption, targetCue);
  const displayPosition = resolveCaptionCuePosition(caption, targetCue);
  const displayShown = !resolveCaptionCueHidden(caption, targetCue);
  const transformXFallback = (() => {
    const t = clip.transform?.x;
    if (!t || t.keyframes.length > 0) return 0;
    return t.staticValue ?? 0;
  })();
  const displayOffsetX = resolveCaptionCueOffsetX(
    caption,
    targetCue,
    transformXFallback,
  );
  const displayOffsetY = resolveCaptionCueOffsetY(caption, targetCue);
  const displayWrapWidth = resolveCaptionCueWrapWidth(caption, targetCue);
  const captionSpeed = normalizeCaptionSpeed(caption.speed);
  const activeMotionId =
    style.stylePresetId &&
    findCaptionMotionPreset(style.stylePresetId) &&
    style.stylePresetId !== "custom"
      ? style.stylePresetId
      : targetCue?.animation
        ? style.stylePresetId ?? null
        : null;

  const withTransformXY = (
    next: CaptionProps,
  ): { caption: CaptionProps; transform: Clip["transform"] } => {
    const x = next.offsetX ?? 0;
    const y = captionTransformY(next.position, next.offsetY, frameH);
    const base = clip.transform ?? {
      x: staticAnimatable(x),
      y: staticAnimatable(y),
      scaleX: staticAnimatable(1),
      scaleY: staticAnimatable(1),
      rotation: staticAnimatable(0),
      uniformScale: true,
    };
    return {
      caption: next,
      transform: {
        ...base,
        x: staticAnimatable(x),
        y: staticAnimatable(y),
      },
    };
  };

  const applyCaptionSpeed = (speed: number) => {
    const nextSpeed = normalizeCaptionSpeed(speed);
    const next: CaptionProps = {
      ...caption,
      speed: nextSpeed === DEFAULT_CAPTION_SPEED ? undefined : nextSpeed,
    };
    const durationMs = captionDurationForSpeed(next.cues, nextSpeed);
    gesture.live({
      ...withTransformXY(next),
      durationMs,
      outMs: durationMs,
    });
  };

  const mapTargetCues = (
    cues: CaptionCue[],
    cueIds: Set<string>,
    patch: (cue: CaptionCue) => CaptionCue,
  ): CaptionCue[] => cues.map((c) => (cueIds.has(c.id) ? patch(c) : c));

  const mapTargetCueStyle = (
    cues: CaptionCue[],
    cueIds: Set<string>,
    partial: Partial<TextProps>,
  ): CaptionCue[] =>
    mapTargetCues(cues, cueIds, (c) => ({
      ...c,
      style: markCaptionStyleCustom({
        ...resolveCaptionCueStyle(caption, c),
        ...partial,
      }),
    }));

  const liveStyle = (partial: Partial<TextProps>) => {
    if (!canEditCue) return;
    const next: CaptionProps = {
      ...caption,
      cues: mapTargetCueStyle(caption.cues, targetCueIds, partial),
    };
    gesture.live({ caption: next });
  };

  const patchStyle = (partial: Partial<TextProps>, label = "Caption style") => {
    if (!canEditCue) return;
    const next: CaptionProps = {
      ...caption,
      cues: mapTargetCueStyle(caption.cues, targetCueIds, partial),
    };
    gesture.commit({ caption: next }, label);
  };

  const patchCueLayout = (
    partial: {
      position?: CaptionPosition;
      offsetX?: number;
      offsetY?: number;
      wrapWidth?: number;
    },
    label: string,
  ) => {
    if (!canEditCue) return;
    const next: CaptionProps = {
      ...caption,
      cues: mapTargetCues(caption.cues, targetCueIds, (c) => ({
        ...c,
        position: partial.position ?? resolveCaptionCuePosition(caption, c),
        offsetX:
          partial.offsetX ??
          resolveCaptionCueOffsetX(caption, c, transformXFallback),
        offsetY: partial.offsetY ?? resolveCaptionCueOffsetY(caption, c),
        wrapWidth:
          partial.wrapWidth ?? resolveCaptionCueWrapWidth(caption, c),
      })),
    };
    gesture.commit({ caption: next }, label);
  };

  const liveCueOffsetX = (offsetX: number) => {
    if (!canEditCue) return;
    const next: CaptionProps = {
      ...caption,
      cues: mapTargetCues(caption.cues, targetCueIds, (c) => ({
        ...c,
        offsetX,
        position: resolveCaptionCuePosition(caption, c),
        offsetY: resolveCaptionCueOffsetY(caption, c),
        wrapWidth: resolveCaptionCueWrapWidth(caption, c),
      })),
    };
    gesture.live({ caption: next });
  };

  const liveCueOffsetY = (offsetY: number) => {
    if (!canEditCue) return;
    const next: CaptionProps = {
      ...caption,
      cues: mapTargetCues(caption.cues, targetCueIds, (c) => ({
        ...c,
        offsetY,
        offsetX: resolveCaptionCueOffsetX(caption, c, transformXFallback),
        position: resolveCaptionCuePosition(caption, c),
        wrapWidth: resolveCaptionCueWrapWidth(caption, c),
      })),
    };
    gesture.live({ caption: next });
  };

  const liveCueWrapWidth = (wrapWidth: number) => {
    if (!canEditCue) return;
    const nextWidth = normalizeCaptionWrapWidth(wrapWidth);
    const next: CaptionProps = {
      ...caption,
      cues: mapTargetCues(caption.cues, targetCueIds, (c) => ({
        ...c,
        wrapWidth: nextWidth,
        position: resolveCaptionCuePosition(caption, c),
        offsetX: resolveCaptionCueOffsetX(caption, c, transformXFallback),
        offsetY: resolveCaptionCueOffsetY(caption, c),
      })),
    };
    gesture.live({ caption: next });
  };

  const display = resolveCaptionDisplay(caption);

  const patchDisplay = (
    partial: Partial<CaptionDisplayOptions>,
    label = "Caption display",
  ) => {
    if (locked) return;
    const next: CaptionProps = {
      ...caption,
      display: { ...display, ...partial },
    };
    gesture.commit({ caption: next }, label);
  };

  const liveDisplay = (partial: Partial<CaptionDisplayOptions>) => {
    if (locked) return;
    const next: CaptionProps = {
      ...caption,
      display: { ...display, ...partial },
    };
    gesture.live({ caption: next });
  };

  /** Styles tab — look + animation on the playhead cue only.
   * Keeps the cue's fontSize, position, and offsetY so picking a style
   * doesn't jump size or placement. */
  const applyMotionPreset = (presetId: string) => {
    if (!canEditCue) return;
    const preset = findCaptionMotionPreset(presetId);
    if (!preset) return;
    if (presetId === "none") {
      // Full reset to normal subtitle: drop look, animation, size & placement
      // overrides so the cue inherits document Options again.
      const next: CaptionProps = {
        ...caption,
        cues: mapTargetCues(caption.cues, targetCueIds, (c) => {
          const {
            style: _s,
            animation: _a,
            hidden: _h,
            position: _p,
            offsetX: _x,
            offsetY: _o,
            wrapWidth: _w,
            ...rest
          } = c;
          return rest;
        }),
      };
      gesture.commit({ caption: next }, "Clear caption style");
      return;
    }
    const next: CaptionProps = {
      ...caption,
      cues: mapTargetCues(caption.cues, targetCueIds, (c) => {
        const current = resolveCaptionCueStyle(caption, c);
        const { fontSize: _presetSize, ...look } = preset.style;
        return {
          ...c,
          style: {
            ...look,
            fontSize: current.fontSize,
          },
          animation: preset.animation
            ? structuredClone(preset.animation)
            : undefined,
        };
      }),
    };
    gesture.commit({ caption: next }, "Caption style");
  };

  /** Promote the playhead cue into a text clip at the cue’s timeline start. */
  const addCueAsText = () => {
    if (!canEditCue || !targetCue || locked) return;
    const text = captionTextForCue(caption, targetCue);
    if (!text) return;
    const speed = caption.speed;
    const startMs = Math.round(
      clip.startMs + captionDisplayMs(targetCue.startMs, speed),
    );
    const endMs = Math.round(
      clip.startMs + captionDisplayMs(targetCue.endMs, speed),
    );
    const durationMs = Math.max(1, endMs - startMs);
    const animation = resolveCaptionCueAnimation(targetCue);
    addTextClipAt({
      text,
      startMs,
      durationMs,
      animation: animation ? structuredClone(animation) : undefined,
      transform: defaultAnimatableTransform({
        x: displayOffsetX,
        y: resolveCaptionCueLayoutY(caption, targetCue, frameH),
      }),
      commitLabel: "Add caption as text",
    });
  };

  /** Options → document defaults + normal cues only. Styled cues stay as-is. */
  const applyOptionsToAll = () => {
    if (!canEditCue) return;
    const { hidden: _prevHidden, ...captionRest } = caption;
    const next: CaptionProps = {
      ...captionRest,
      style: markCaptionStyleCustom({
        ...caption.style,
        ...resolveCaptionCueStyle(caption, targetCue),
      }),
      position: displayPosition,
      // Document default for cues without an override; cleared when showing all.
      ...(displayShown ? {} : { hidden: true }),
      offsetX: displayOffsetX === 0 ? undefined : displayOffsetX,
      offsetY: displayOffsetY,
      wrapWidth:
        displayWrapWidth === DEFAULT_CAPTION_WRAP_WIDTH
          ? undefined
          : displayWrapWidth,
      cues: caption.cues.map((c) => {
        if (isCaptionCueStyled(c)) return c;
        const stripped = stripCueOptionOverrides(c);
        // Write visibility onto every normal cue so it does not flap via inherit.
        return displayShown
          ? stripped
          : { ...stripped, hidden: true };
      }),
    };
    gesture.commit(withTransformXY(next), "Apply caption options to all");
  };

  const weightNum =
    typeof style.fontWeight === "number"
      ? style.fontWeight
      : Number.parseInt(String(style.fontWeight), 10) || 700;
  const boldOn = weightNum >= 700;

  const patchCueHidden = (shown: boolean) => {
    if (!canEditCue) return;
    const next: CaptionProps = {
      ...caption,
      cues: mapTargetCues(caption.cues, targetCueIds, (c) => ({
        ...c,
        // Always set an explicit boolean so Show can override Apply-to-all hide.
        hidden: !shown,
      })),
    };
    gesture.commit({ caption: next }, shown ? "Show caption" : "Hide caption");
  };

  const styleDisabled = locked || !canEditCue;

  return (
    <div className="inspector-video inspector-caption">
      <div className="inspector-video__subtabs" role="tablist">
        {(
          [
            { id: "options" as const, label: "Options" },
            { id: "styles" as const, label: "Styles" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={
              tab === item.id
                ? "inspector-video__subtab inspector-video__subtab--active"
                : "inspector-video__subtab"
            }
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="inspector-caption__scroll">
        {tab === "options" ? (
          <>
            <section className="inspector-section">
              <div className="inspector-section__head">
                <h3 className="inspector-section__title">Display</h3>
              </div>
              <label className="inspector-field inspector-field--check">
                <input
                  type="checkbox"
                  className="inspector-switch"
                  checked={displayShown}
                  disabled={styleDisabled}
                  onChange={(e) => patchCueHidden(e.target.checked)}
                />
                <span>Show caption</span>
              </label>

              <div className="inspector-field">
                <span className="inspector-field__label">Position</span>
                <div className="inspector-field__controls">
                  {(["top", "center", "bottom"] as CaptionPosition[]).map(
                    (pos) => (
                      <button
                        key={pos}
                        type="button"
                        disabled={styleDisabled}
                        className={
                          displayPosition === pos
                            ? "inspector-video__subtab inspector-video__subtab--active"
                            : "inspector-video__subtab"
                        }
                        onClick={() =>
                          patchCueLayout(
                            { position: pos },
                            "Caption cue position",
                          )
                        }
                      >
                        {pos[0]!.toUpperCase() + pos.slice(1)}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <label className="inspector-field">
                <span className="inspector-field__label">Offset X</span>
                <div className="inspector-field__controls">
                  <input
                    type="range"
                    className="inspector-slider"
                    min={-600}
                    max={600}
                    step={1}
                    disabled={styleDisabled}
                    value={displayOffsetX}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) => liveCueOffsetX(Number(e.target.value))}
                  />
                  <span className="inspector-field__unit">
                    {displayOffsetX}px
                  </span>
                </div>
              </label>

              <label className="inspector-field">
                <span className="inspector-field__label">Offset Y</span>
                <div className="inspector-field__controls">
                  <input
                    type="range"
                    className="inspector-slider"
                    min={-200}
                    max={200}
                    step={1}
                    disabled={styleDisabled}
                    value={displayOffsetY}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) => liveCueOffsetY(Number(e.target.value))}
                  />
                  <span className="inspector-field__unit">
                    {displayOffsetY}px
                  </span>
                </div>
              </label>

              <label className="inspector-field">
                <span className="inspector-field__label">Width</span>
                <div className="inspector-field__controls">
                  <input
                    type="range"
                    className="inspector-slider"
                    min={MIN_CAPTION_WRAP_WIDTH}
                    max={MAX_CAPTION_WRAP_WIDTH}
                    step={0.01}
                    disabled={styleDisabled}
                    value={displayWrapWidth}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) =>
                      liveCueWrapWidth(Number(e.target.value))
                    }
                  />
                  <span className="inspector-field__unit">
                    {Math.round(displayWrapWidth * 100)}%
                  </span>
                </div>
              </label>
              <p className="inspector-panel__hint">
                Screen width for this cue — text wraps to the next line to fit.
              </p>

              <label className="inspector-field">
                <span className="inspector-field__label">Speed</span>
                <div className="inspector-field__controls">
                  <input
                    type="range"
                    className="inspector-slider"
                    min={MIN_CAPTION_SPEED}
                    max={MAX_CAPTION_SPEED}
                    step={0.01}
                    disabled={locked || caption.cues.length === 0}
                    value={captionSpeed}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) =>
                      applyCaptionSpeed(Number(e.target.value))
                    }
                  />
                  <span className="inspector-field__unit">
                    {`${Number.parseFloat(captionSpeed.toFixed(2))}×`}
                  </span>
                </div>
              </label>
              <p className="inspector-panel__hint">
                Speed always applies to the whole caption clip.
              </p>
            </section>

            <section className="inspector-section">
              <div className="inspector-section__head">
                <h3 className="inspector-section__title">Style</h3>
              </div>

              <div className="inspector-field inspector-field--stack">
                <span className="inspector-field__label">Font</span>
                <FontPicker
                  value={style.fontFamily ?? "system-ui, sans-serif"}
                  locked={styleDisabled}
                  onPick={(stack) =>
                    patchStyle({ fontFamily: stack }, "Caption font")
                  }
                />
              </div>

              <label className="inspector-field">
                <span className="inspector-field__label">Size</span>
                <div className="inspector-field__controls">
                  <input
                    type="range"
                    className="inspector-slider"
                    min={12}
                    max={120}
                    step={1}
                    disabled={styleDisabled}
                    value={style.fontSize ?? 36}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) =>
                      liveStyle({ fontSize: Number(e.target.value) })
                    }
                  />
                  <span className="inspector-field__unit">
                    {style.fontSize ?? 36}
                  </span>
                </div>
              </label>

              <div className="inspector-field">
                <span className="inspector-field__label">Weight</span>
                <div className="inspector-field__controls">
                  <button
                    type="button"
                    disabled={styleDisabled}
                    className={
                      boldOn
                        ? "inspector-video__subtab inspector-video__subtab--active"
                        : "inspector-video__subtab"
                    }
                    onClick={() =>
                      patchStyle(
                        { fontWeight: boldOn ? 400 : 700 },
                        "Caption weight",
                      )
                    }
                  >
                    Bold
                  </button>
                </div>
              </div>

              <div className="inspector-field">
                <span className="inspector-field__label">Align</span>
                <div className="inspector-field__controls">
                  {(["left", "center", "right"] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      disabled={styleDisabled}
                      className={
                        style.align === align
                          ? "inspector-video__subtab inspector-video__subtab--active"
                          : "inspector-video__subtab"
                      }
                      onClick={() => patchStyle({ align }, "Caption align")}
                    >
                      {align[0]!.toUpperCase() + align.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <ColorField
                label="Color"
                value={toPickerHex(style.color, "#ffffff")}
                fallback="#ffffff"
                locked={styleDisabled}
                onBegin={gesture.begin}
                onEnd={gesture.end}
                onLive={(hex) => liveStyle({ color: hex })}
              />

              <ColorField
                label="Stroke"
                value={toPickerHex(style.strokeColor, "#000000")}
                fallback="#000000"
                locked={styleDisabled}
                onBegin={gesture.begin}
                onEnd={gesture.end}
                onLive={(hex) => liveStyle({ strokeColor: hex })}
              />

              <label className="inspector-field">
                <span className="inspector-field__label">Stroke width</span>
                <div className="inspector-field__controls">
                  <input
                    type="range"
                    className="inspector-slider"
                    min={0}
                    max={12}
                    step={0.5}
                    disabled={styleDisabled}
                    value={style.strokeWidth ?? 0}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) =>
                      liveStyle({ strokeWidth: Number(e.target.value) })
                    }
                  />
                  <span className="inspector-field__unit">
                    {style.strokeWidth ?? 0}
                  </span>
                </div>
              </label>

              <ColorField
                label="Background"
                value={toPickerHex(display.backgroundColor, "#000000")}
                fallback="#000000"
                locked={locked || track.hidden}
                onBegin={gesture.begin}
                onEnd={gesture.end}
                onLive={(hex) => liveDisplay({ backgroundColor: hex })}
              />

              <label className="inspector-field">
                <span className="inspector-field__label">Background opacity</span>
                <div className="inspector-field__controls">
                  <input
                    type="range"
                    className="inspector-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={locked || track.hidden}
                    value={display.backgroundAlpha}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) =>
                      liveDisplay({ backgroundAlpha: Number(e.target.value) })
                    }
                  />
                  <span className="inspector-field__unit">
                    {Math.round(display.backgroundAlpha * 100)}%
                  </span>
                </div>
              </label>
            </section>

            <section className="inspector-section">
              <div className="inspector-section__head">
                <h3 className="inspector-section__title">Word highlight</h3>
              </div>
              <p className="inspector-panel__hint">
                Highlight the spoken word; options below apply when enabled.
              </p>

              <label className="inspector-field inspector-field--check">
                <input
                  type="checkbox"
                  className="inspector-switch"
                  checked={display.wordHighlight}
                  disabled={locked || track.hidden}
                  onChange={(e) =>
                    patchDisplay(
                      { wordHighlight: e.target.checked },
                      "Caption word highlight",
                    )
                  }
                />
                <span>Highlight current word</span>
              </label>

              <ColorField
                label="Highlight text"
                value={toPickerHex(display.highlightColor, "#facc15")}
                fallback="#facc15"
                locked={locked || track.hidden || !display.wordHighlight}
                onBegin={gesture.begin}
                onEnd={gesture.end}
                onLive={(hex) => liveDisplay({ highlightColor: hex })}
              />

              <ColorField
                label="Highlight background"
                value={toPickerHex(
                  display.highlightBackgroundColor,
                  "#facc15",
                )}
                fallback="#facc15"
                locked={locked || track.hidden || !display.wordHighlight}
                onBegin={gesture.begin}
                onEnd={gesture.end}
                onLive={(hex) =>
                  liveDisplay({ highlightBackgroundColor: hex })
                }
              />

              <label className="inspector-field">
                <span className="inspector-field__label">
                  Highlight bg opacity
                </span>
                <div className="inspector-field__controls">
                  <input
                    type="range"
                    className="inspector-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={locked || track.hidden || !display.wordHighlight}
                    value={display.highlightBackgroundAlpha}
                    onPointerDown={gesture.begin}
                    onPointerUp={gesture.end}
                    onChange={(e) =>
                      liveDisplay({
                        highlightBackgroundAlpha: Number(e.target.value),
                      })
                    }
                  />
                  <span className="inspector-field__unit">
                    {Math.round(display.highlightBackgroundAlpha * 100)}%
                  </span>
                </div>
              </label>

              <label className="inspector-field inspector-field--check">
                <input
                  type="checkbox"
                  className="inspector-switch"
                  checked={display.highlightZoom}
                  disabled={locked || track.hidden || !display.wordHighlight}
                  onChange={(e) =>
                    patchDisplay(
                      { highlightZoom: e.target.checked },
                      "Caption highlight zoom",
                    )
                  }
                />
                <span>Zoom highlight</span>
              </label>

              <label className="inspector-field inspector-field--check">
                <input
                  type="checkbox"
                  className="inspector-switch"
                  checked={display.highlightEnergyZoom}
                  disabled={
                    locked ||
                    track.hidden ||
                    !display.wordHighlight ||
                    display.highlightBackgroundAlpha <= 0.001
                  }
                  onChange={(e) =>
                    patchDisplay(
                      { highlightEnergyZoom: e.target.checked },
                      "Caption timed zoom bg",
                    )
                  }
                />
                <span>Timed zoom bg</span>
              </label>

              <button
                type="button"
                className="inspector-video__subtab"
                disabled={locked}
                onClick={() =>
                  patchDisplay(
                    { ...DEFAULT_CAPTION_DISPLAY },
                    "Reset caption display",
                  )
                }
              >
                Reset display options
              </button>
            </section>
          </>
        ) : (
          <section className="inspector-section">
            <div className="inspector-section__head">
              <h3 className="inspector-section__title">Styles</h3>
            </div>
            <p className="inspector-panel__hint">
              Look + entrance animation for the playhead cue only (not Apply to
              all). Keeps your current size and position.
            </p>
            {!canEditCue ? (
              <p className="inspector-panel__hint">
                Move the playhead onto a caption to pick a style.
              </p>
            ) : (
              <p className="inspector-caption__cue-preview" title={targetCue?.text}>
                “{cuePreviewLabel(targetCue)}”
              </p>
            )}
            <div
              className="inspector-caption-styles"
              role="listbox"
              aria-label="Caption motion styles"
            >
              {CAPTION_MOTION_PRESETS.map((preset) => {
                const active = activeMotionId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={styleDisabled}
                    className={
                      active
                        ? "inspector-caption-styles__tile inspector-caption-styles__tile--active"
                        : "inspector-caption-styles__tile"
                    }
                    onClick={() => applyMotionPreset(preset.id)}
                  >
                    <div className="inspector-caption-styles__head">
                      <span className="inspector-caption-styles__label">
                        {preset.name}
                      </span>
                      <span className="inspector-caption-styles__hint">
                        {preset.hint}
                      </span>
                    </div>
                    <span
                      className="inspector-caption-styles__sample"
                      style={motionSampleCss(preset.id)}
                      aria-hidden
                    >
                      {preset.sample}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="inspector-caption__sticky">
        <div className="inspector-caption__sticky-meta">
          <span className="inspector-caption__sticky-label">
            {canEditCue
              ? tab === "styles"
                ? "Style · this cue only"
                : "Options · Apply to all copies these"
              : "No cue at playhead"}
          </span>
          <span
            className="inspector-caption__sticky-cue"
            title={targetCue?.text}
          >
            {cuePreviewLabel(targetCue)}
          </span>
        </div>
        {tab === "options" ? (
          <div className="inspector-caption__sticky-actions">
            <button
              type="button"
              className="inspector-caption__apply-all"
              disabled={styleDisabled || !targetCue?.text.trim()}
              onClick={addCueAsText}
              title="Add a text clip at this subtitle’s start time, using its text and style"
            >
              Add as text
            </button>
            <button
              type="button"
              className="inspector-caption__apply-all"
              disabled={styleDisabled || caption.cues.length === 0}
              onClick={applyOptionsToAll}
              title="Apply Options to normal cues only. Styled cues keep their style until you clear it."
            >
              Apply to all
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
