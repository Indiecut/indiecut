/**
 * Resolve the on-screen caption TextProps for the active cue + Display options.
 */

import type { Clip, TextProps } from "../../project/types";
import { isCaptionCueStyled } from "./captionMotionPresets";
import {
  captionNeedsWordNodes,
  estimateCaptionWrapWidth,
  resolveCaptionDisplay,
  resolveCaptionDisplayWords,
  withCaptionBackground,
  wrapCaptionTextToWidth,
  type CaptionDisplayOptions,
  type CaptionWordSpan,
} from "./captionDisplay";
import { captionContentMs } from "./captionTiming";
import {
  activeCaptionCue,
  captionTextForCue,
  resolveCaptionCueHidden,
  resolveCaptionCueStyle,
  resolveCaptionCueWrapWidth,
} from "./resolveCaptionText";

export type ResolvedCaptionDisplay = {
  text: TextProps;
  display: CaptionDisplayOptions;
  /** Max wrap width in layout px (passed to karaoke compositor). */
  maxWrapWidth: number;
  /** Present when preview should paint per-word karaoke nodes. */
  karaoke: null | {
    words: CaptionWordSpan[];
    visible: CaptionWordSpan[];
    activeIndex: number;
    activeWordIndex: number;
    contentMs: number;
    maxWrapWidth: number;
  };
};

export function resolveCaptionDisplayAtLocalMs(
  clip: Clip,
  localMs: number,
  frameWidth = 1920,
): ResolvedCaptionDisplay | null {
  const caption = clip.caption;
  if (!caption || clip.kind !== "caption") return null;
  const cue = activeCaptionCue(caption.cues, localMs, caption.speed);
  if (!cue) return null;
  if (resolveCaptionCueHidden(caption, cue)) return null;

  const display = resolveCaptionDisplay(caption);
  const style = resolveCaptionCueStyle(caption, cue);
  const wrapFrac = resolveCaptionCueWrapWidth(caption, cue);
  const maxLineWidth = estimateCaptionWrapWidth(style, frameWidth, wrapFrac);

  // Styles-tab cues keep their own animation; still honor wrap width.
  if (isCaptionCueStyled(cue)) {
    const base = captionTextForCue(caption, cue);
    if (!base) return null;
    const text: TextProps = {
      ...base,
      content: wrapCaptionTextToWidth(base.content, style, maxLineWidth),
    };
    return { text, display, maxWrapWidth: maxLineWidth, karaoke: null };
  }

  const contentMs = captionContentMs(localMs, caption.speed);
  const resolved = resolveCaptionDisplayWords({
    cue,
    contentMs,
    display,
    style,
    maxLineWidth,
  });

  const joined =
    resolved.visible.length === 0
      ? ""
      : resolved.visible.map((w) => w.text).join(" ");
  if (!joined.trim()) return null;

  const content = wrapCaptionTextToWidth(joined, style, maxLineWidth);

  let text: TextProps = {
    ...style,
    content,
  };

  const needsNodes =
    captionNeedsWordNodes(display) && resolved.visible.length > 0;

  // Karaoke paints its own caption box; static path uses bubble chrome.
  if (!needsNodes) {
    text = withCaptionBackground(text, display);
  }

  return {
    text,
    display,
    maxWrapWidth: maxLineWidth,
    karaoke: needsNodes
      ? {
          words: resolved.words,
          visible: resolved.visible,
          activeIndex: resolved.activeIndex,
          activeWordIndex: resolved.activeWordIndex,
          contentMs,
          maxWrapWidth: maxLineWidth,
        }
      : null,
  };
}

