/**
 * Caption Options — Display style + word highlight (caption-app parity).
 * Word timings are even-split within each cue when no per-word stamps exist.
 */

import {
  measureLineWidth,
  measureTextSize,
  resolveText,
  textFontCss,
} from "../../compositor/rasterizeText";
import type {
  CaptionCue,
  CaptionDisplayOptions,
  CaptionDisplayStyle,
  CaptionProps,
  TextProps,
} from "../../project/types";

export type { CaptionDisplayOptions, CaptionDisplayStyle };

export const CAPTION_DISPLAY_STYLES: {
  id: CaptionDisplayStyle;
  label: string;
  hint: string;
}[] = [
  { id: "full", label: "Full caption", hint: "Wrap across lines" },
  { id: "line", label: "One line", hint: "One line at a time" },
  { id: "word", label: "One word", hint: "Only the active word" },
  { id: "reveal", label: "Word reveal", hint: "Words appear as spoken" },
];

export const DEFAULT_CAPTION_DISPLAY: CaptionDisplayOptions = {
  displayStyle: "full",
  wordHighlight: false,
  backgroundColor: "#000000",
  backgroundAlpha: 0,
  highlightColor: "#facc15",
  highlightBackgroundColor: "#facc15",
  highlightBackgroundAlpha: 0,
  highlightZoom: true,
  highlightEnergyZoom: true,
};

export type CaptionWordSpan = {
  text: string;
  /** Cue-local content ms. */
  startMs: number;
  endMs: number;
};

export function splitCaptionWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function wordWeight(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]+/gu, "");
  return Math.max(1, letters.length);
}

/** Even-split word timings across a cue window (content ms). */
export function evenSplitCaptionWords(
  text: string,
  startMs: number,
  endMs: number,
): CaptionWordSpan[] {
  const words = splitCaptionWords(text);
  if (words.length === 0) return [];
  if (words.length === 1) {
    return [{ text: words[0]!, startMs, endMs }];
  }
  const dur = Math.max(40, endMs - startMs);
  const weights = words.map(wordWeight);
  const sum = weights.reduce((a, b) => a + b, 0);
  let cursor = startMs;
  return words.map((w, i) => {
    const slice = (weights[i]! / sum) * dur;
    const wordStart = cursor;
    const wordEnd = i === words.length - 1 ? endMs : cursor + slice;
    cursor = wordEnd;
    return {
      text: w,
      startMs: wordStart,
      endMs: Math.max(wordStart + 40, wordEnd),
    };
  });
}

export function wordIndexAtContentMs(
  words: CaptionWordSpan[],
  contentMs: number,
): number {
  if (words.length === 0) return -1;
  for (let i = 0; i < words.length; i++) {
    if (contentMs < words[i]!.endMs) return i;
  }
  return words.length - 1;
}

export function resolveCaptionDisplay(
  caption: CaptionProps,
): CaptionDisplayOptions {
  const d = caption.display;
  if (!d) return { ...DEFAULT_CAPTION_DISPLAY };
  return {
    // Display-style modes (line / word / reveal) are retired — always full.
    displayStyle: DEFAULT_CAPTION_DISPLAY.displayStyle,
    wordHighlight: Boolean(d.wordHighlight),
    backgroundColor:
      typeof d.backgroundColor === "string" && d.backgroundColor
        ? d.backgroundColor
        : DEFAULT_CAPTION_DISPLAY.backgroundColor,
    backgroundAlpha: clamp01(
      typeof d.backgroundAlpha === "number"
        ? d.backgroundAlpha
        : DEFAULT_CAPTION_DISPLAY.backgroundAlpha,
    ),
    highlightColor:
      typeof d.highlightColor === "string" && d.highlightColor
        ? d.highlightColor
        : DEFAULT_CAPTION_DISPLAY.highlightColor,
    highlightBackgroundColor:
      typeof d.highlightBackgroundColor === "string" &&
      d.highlightBackgroundColor
        ? d.highlightBackgroundColor
        : DEFAULT_CAPTION_DISPLAY.highlightBackgroundColor,
    highlightBackgroundAlpha: clamp01(
      typeof d.highlightBackgroundAlpha === "number"
        ? d.highlightBackgroundAlpha
        : DEFAULT_CAPTION_DISPLAY.highlightBackgroundAlpha,
    ),
    highlightZoom:
      typeof d.highlightZoom === "boolean"
        ? d.highlightZoom
        : DEFAULT_CAPTION_DISPLAY.highlightZoom,
    highlightEnergyZoom:
      typeof d.highlightEnergyZoom === "boolean"
        ? d.highlightEnergyZoom
        : DEFAULT_CAPTION_DISPLAY.highlightEnergyZoom,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Partition words into wrap lines using the same font metrics as rasterize. */
export function wrapCaptionWordsToLines(
  words: string[],
  style: Omit<TextProps, "content">,
  maxWidth: number,
): string[][] {
  if (words.length === 0) return [];
  const probe =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1)
      : typeof document !== "undefined"
        ? document.createElement("canvas")
        : null;
  if (!probe) return [words];
  const ctx = probe.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) return [words];
  const t = resolveText({ ...style, content: words.join(" ") }, 1);
  ctx.font = textFontCss(t);
  const lines: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    const trial = current.length === 0 ? word : `${current.join(" ")} ${word}`;
    const w = measureLineWidth(ctx, trial, t.letterSpacing);
    if (current.length > 0 && w > maxWidth) {
      lines.push(current);
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

/**
 * Resolve which words are visible for the display style at cue-local content ms.
 * Returns word texts (joined by caller) and the active index within that list
 * (or within the full cue word list for highlight).
 */
export function resolveCaptionDisplayWords(args: {
  cue: CaptionCue;
  contentMs: number;
  display: CaptionDisplayOptions;
  style: Omit<TextProps, "content">;
  /** Max wrap width in layout px for line paging. */
  maxLineWidth: number;
}): {
  words: CaptionWordSpan[];
  visible: CaptionWordSpan[];
  activeIndex: number;
  /** Index into `words` (full cue), -1 if none. */
  activeWordIndex: number;
} {
  const words = evenSplitCaptionWords(
    args.cue.text,
    args.cue.startMs,
    args.cue.endMs,
  );
  const activeWordIndex = wordIndexAtContentMs(words, args.contentMs);
  const displayStyle = args.display.displayStyle;

  if (words.length === 0) {
    return { words, visible: [], activeIndex: -1, activeWordIndex: -1 };
  }

  if (displayStyle === "word") {
    const active = words[Math.max(0, activeWordIndex)]!;
    return {
      words,
      visible: [active],
      activeIndex: 0,
      activeWordIndex: Math.max(0, activeWordIndex),
    };
  }

  if (displayStyle === "reveal") {
    const end = Math.max(0, activeWordIndex) + 1;
    const visible = words.slice(0, end);
    return {
      words,
      visible,
      activeIndex: visible.length - 1,
      activeWordIndex: Math.max(0, activeWordIndex),
    };
  }

  if (displayStyle === "line") {
    const lines = wrapCaptionWordsToLines(
      words.map((w) => w.text),
      args.style,
      Math.max(40, args.maxLineWidth),
    );
    let cursor = 0;
    let page: CaptionWordSpan[] = words;
    let localActive = activeWordIndex;
    for (const line of lines) {
      const slice = words.slice(cursor, cursor + line.length);
      if (
        activeWordIndex >= cursor &&
        activeWordIndex < cursor + line.length
      ) {
        page = slice;
        localActive = activeWordIndex - cursor;
        break;
      }
      cursor += line.length;
    }
    return {
      words,
      visible: page,
      activeIndex: localActive,
      activeWordIndex: Math.max(0, activeWordIndex),
    };
  }

  // full
  return {
    words,
    visible: words,
    activeIndex: Math.max(0, activeWordIndex),
    activeWordIndex: Math.max(0, activeWordIndex),
  };
}

/** Whether preview needs per-word karaoke compositing (colors / zoom / bg). */
export function captionNeedsWordNodes(display: CaptionDisplayOptions): boolean {
  return display.wordHighlight;
}

/** Apply caption box background onto TextProps via bubble chrome. */
export function withCaptionBackground(
  text: TextProps,
  display: CaptionDisplayOptions,
): TextProps {
  if (display.backgroundAlpha <= 0.001) {
    if (text.bubble?.type === "pill" && text.bubble.fill === display.backgroundColor) {
      const { bubble: _b, ...rest } = text;
      return rest;
    }
    return text;
  }
  const alpha = Math.round(clamp01(display.backgroundAlpha) * 255)
    .toString(16)
    .padStart(2, "0");
  const fill = `${display.backgroundColor}${alpha}`;
  return {
    ...text,
    bubble: {
      type: "pill",
      fill,
      stroke: fill,
      strokeWidth: 0,
      paddingX: 14,
      paddingY: 8,
    },
  };
}

/** Timed zoom factor for highlight background (caption-app energy zoom). */
export function timedWordZoomFactor(
  contentMs: number,
  word: CaptionWordSpan | null | undefined,
): number {
  if (!word) return 1;
  const dur = Math.max(1, word.endMs - word.startMs);
  const t = Math.min(1, Math.max(0, (contentMs - word.startMs) / dur));
  // One in-out pulse over the word.
  return 1 + 0.14 * Math.sin(Math.PI * t);
}

/** Default / min / max wrap width as a fraction of frame width. */
export const DEFAULT_CAPTION_WRAP_WIDTH = 0.86;
export const MIN_CAPTION_WRAP_WIDTH = 0.2;
export const MAX_CAPTION_WRAP_WIDTH = 1;

export function normalizeCaptionWrapWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CAPTION_WRAP_WIDTH;
  }
  return Math.min(
    MAX_CAPTION_WRAP_WIDTH,
    Math.max(MIN_CAPTION_WRAP_WIDTH, value),
  );
}

export function estimateCaptionWrapWidth(
  style: Omit<TextProps, "content">,
  frameWidth: number,
  wrapWidthFrac?: number,
): number {
  const frac = normalizeCaptionWrapWidth(
    wrapWidthFrac ?? DEFAULT_CAPTION_WRAP_WIDTH,
  );
  const cap = Math.max(40, frameWidth * frac);
  if (wrapWidthFrac != null) return cap;
  const measured = measureTextSize({
    ...style,
    content: "M".repeat(24),
  });
  const fromFont = (style.fontSize ?? 36) * 18;
  return Math.min(cap, Math.max(fromFont, measured?.width ?? fromFont));
}

/** Insert newlines so the caption fits within maxWidth layout px. */
export function wrapCaptionTextToWidth(
  text: string,
  style: Omit<TextProps, "content">,
  maxWidth: number,
): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return text;
  const words = splitCaptionWords(trimmed);
  const lines = wrapCaptionWordsToLines(
    words,
    style,
    Math.max(40, maxWidth),
  );
  return lines.map((line) => line.join(" ")).join("\n");
}
