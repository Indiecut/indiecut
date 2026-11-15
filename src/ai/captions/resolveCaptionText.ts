import type {
  CaptionCue,
  CaptionPosition,
  CaptionProps,
  Clip,
  TextAnimationParams,
  TextProps,
} from "../../project/types";
import { isCaptionCueStyled } from "./captionMotionPresets";
import { resolveCaptionDisplayAtLocalMs } from "./resolveCaptionDisplayText";
import {
  captionContentMs,
  captionDisplayMs,
} from "./captionTiming";
import { captionTransformY } from "./speechLineTextDefaults";

/** Find the cue active at clip-local time (end exclusive). */
export function activeCaptionCue(
  cues: CaptionCue[],
  localMs: number,
  speed?: number,
): CaptionCue | null {
  const contentMs = captionContentMs(localMs, speed);
  for (const cue of cues) {
    if (contentMs >= cue.startMs && contentMs < cue.endMs) return cue;
  }
  return null;
}

/** Build TextProps for the active cue (honors Display style options). */
export function resolveCaptionTextAtLocalMs(
  clip: Clip,
  localMs: number,
  frameWidth = 1920,
): TextProps | null {
  const caption = clip.caption;
  if (!caption || clip.kind !== "caption") return null;
  const cue = activeCaptionCue(caption.cues, localMs, caption.speed);
  if (!cue || resolveCaptionCueHidden(caption, cue)) return null;
  const displayed = resolveCaptionDisplayAtLocalMs(clip, localMs, frameWidth);
  if (displayed) return displayed.text;
  return captionTextForCue(caption, cue);
}

export function captionTextForCue(
  caption: CaptionProps,
  cue: CaptionCue | null,
): TextProps | null {
  if (!cue) return null;
  const text = cue.text.trim();
  if (!text) return null;
  return {
    ...caption.style,
    ...cue.style,
    content: cue.text,
  };
}

/** Resolved style for a cue (document defaults + optional cue override). */
export function resolveCaptionCueStyle(
  caption: CaptionProps,
  cue: CaptionCue | null | undefined,
): Omit<TextProps, "content"> {
  if (!cue?.style) return caption.style;
  return { ...caption.style, ...cue.style };
}

export function resolveCaptionCuePosition(
  caption: CaptionProps,
  cue: CaptionCue | null | undefined,
): CaptionPosition {
  return cue?.position ?? caption.position;
}

export function resolveCaptionCueOffsetY(
  caption: CaptionProps,
  cue: CaptionCue | null | undefined,
): number {
  return cue?.offsetY ?? caption.offsetY;
}

/**
 * Whether this cue should be drawn (Show caption). Default visible.
 * Per-cue `hidden: false` overrides a document-level hide from Apply to all.
 * Styled cues ignore document Options.hidden entirely.
 */
export function resolveCaptionCueHidden(
  caption: CaptionProps,
  cue: CaptionCue | null | undefined,
): boolean {
  if (cue && isCaptionCueStyled(cue)) {
    return cue.hidden === true;
  }
  if (typeof cue?.hidden === "boolean") return cue.hidden;
  return caption.hidden === true;
}

/**
 * Horizontal layout offset (center-origin).
 * Falls back to `fallbackTransformX` for older projects that only stored clip.transform.x.
 */
export function resolveCaptionCueOffsetX(
  caption: CaptionProps,
  cue: CaptionCue | null | undefined,
  fallbackTransformX = 0,
): number {
  if (typeof cue?.offsetX === "number" && Number.isFinite(cue.offsetX)) {
    return cue.offsetX;
  }
  if (typeof caption.offsetX === "number" && Number.isFinite(caption.offsetX)) {
    return caption.offsetX;
  }
  return fallbackTransformX;
}

/** Wrap width as a fraction of frame width (0.2–1). */
export function resolveCaptionCueWrapWidth(
  caption: CaptionProps,
  cue: CaptionCue | null | undefined,
): number {
  const raw = cue?.wrapWidth ?? caption.wrapWidth;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(1, Math.max(0.2, raw));
  }
  return 0.86;
}

/** Layout X for a cue (center-origin). */
export function resolveCaptionCueLayoutX(
  caption: CaptionProps,
  cue: CaptionCue | null | undefined,
  fallbackTransformX = 0,
): number {
  return resolveCaptionCueOffsetX(caption, cue, fallbackTransformX);
}

/** Layout Y for a cue (center-origin), including per-cue position overrides. */
export function resolveCaptionCueLayoutY(
  caption: CaptionProps,
  cue: CaptionCue | null | undefined,
  frameHeight: number,
): number {
  return captionTransformY(
    resolveCaptionCuePosition(caption, cue),
    resolveCaptionCueOffsetY(caption, cue),
    frameHeight,
  );
}

export function resolveCaptionCueAnimation(
  cue: CaptionCue | null | undefined,
): TextAnimationParams | undefined {
  return cue?.animation;
}

/**
 * Map caption clip-local time onto the active cue's timeline so In/Out/Loop
 * sample against the cue window (not the whole caption clip).
 */
export function resolveCaptionCueAnimClock(
  caption: CaptionProps,
  localMs: number,
): {
  cue: CaptionCue;
  animLocalMs: number;
  animDurationMs: number;
  animation?: TextAnimationParams;
} | null {
  const cue = activeCaptionCue(caption.cues, localMs, caption.speed);
  if (!cue) return null;
  const start = captionDisplayMs(cue.startMs, caption.speed);
  const end = captionDisplayMs(cue.endMs, caption.speed);
  const animDurationMs = Math.max(1, end - start);
  const animLocalMs = Math.min(animDurationMs, Math.max(0, localMs - start));
  return {
    cue,
    animLocalMs,
    animDurationMs,
    animation: cue.animation,
  };
}
