/**
 * Rich-text run helpers — keep `content` ↔ `runs` in sync and apply range styles.
 */

import type { TextProps, TextRun, TextRunStyle } from "../project/types";

export function plainContent(runs: TextRun[]): string {
  return runs.map((r) => r.text).join("");
}

export function runsFromPlain(
  content: string,
  baseStyle?: TextRunStyle,
): TextRun[] {
  return [{ text: content, style: baseStyle ? { ...baseStyle } : undefined }];
}

/** Box-level typography fields that seed a single-run fallback. */
export function boxStyleAsRunStyle(props: TextProps): TextRunStyle {
  const style: TextRunStyle = {};
  if (props.fontFamily != null) style.fontFamily = props.fontFamily;
  if (props.fontSize != null) style.fontSize = props.fontSize;
  if (props.fontWeight != null) style.fontWeight = props.fontWeight;
  if (props.fontStyle != null) style.fontStyle = props.fontStyle;
  if (props.textDecoration != null) style.textDecoration = props.textDecoration;
  if (props.textTransform != null) style.textTransform = props.textTransform;
  if (props.color != null) style.color = props.color;
  if (props.gradient !== undefined) style.gradient = props.gradient;
  if (props.strokeColor != null) style.strokeColor = props.strokeColor;
  if (props.strokeWidth != null) style.strokeWidth = props.strokeWidth;
  if (props.letterSpacing != null) style.letterSpacing = props.letterSpacing;
  return style;
}

/**
 * Ensure `runs` exist and `content` matches them.
 * Empty / missing runs → one run from `content` (optionally seeded with box style).
 */
export function normalizeTextProps(props: TextProps): TextProps {
  const rawRuns = props.runs;
  if (!rawRuns || rawRuns.length === 0) {
    const content = props.content ?? "";
    const runs = runsFromPlain(content);
    return { ...props, content, runs };
  }
  const runs = coalesceRuns(
    rawRuns.map((r) => ({
      text: typeof r.text === "string" ? r.text : "",
      style: r.style ? { ...r.style } : undefined,
    })),
  );
  return { ...props, content: plainContent(runs), runs };
}

/** Merge adjacent runs that share identical style JSON. */
export function coalesceRuns(runs: TextRun[]): TextRun[] {
  if (runs.length === 0) return runs;
  const out: TextRun[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev && styleKey(prev.style) === styleKey(run.style)) {
      prev.text += run.text;
    } else {
      out.push({
        text: run.text,
        style: run.style ? { ...run.style } : undefined,
      });
    }
  }
  return out.length > 0 ? out : [{ text: "" }];
}

function styleKey(style?: TextRunStyle): string {
  if (!style) return "";
  return JSON.stringify(style);
}

export function resolvedRuns(props: TextProps): TextRun[] {
  return normalizeTextProps(props).runs ?? runsFromPlain(props.content ?? "");
}

/**
 * True when styling differs across runs (or any run carries highlight/script
 * beyond what a flat TextProps paint can express alone).
 */
export function hasMixedRunStyles(props: TextProps): boolean {
  const runs = props.runs;
  if (!runs || runs.length === 0) return false;
  if (runs.length === 1) {
    const s = runs[0]?.style;
    if (!s) return false;
    return Boolean(
      s.highlight ||
        (s.script && s.script !== "normal") ||
        s.textDecoration === "line-through",
    );
  }
  const keys = new Set(runs.map((r) => styleKey(r.style)));
  return keys.size > 1 || runs.some((r) => Boolean(r.style?.highlight));
}

/** Flat index of every character across runs (Unicode code points). */
export function expandRunChars(
  runs: TextRun[],
): Array<{ ch: string; style?: TextRunStyle; runIndex: number }> {
  const out: Array<{ ch: string; style?: TextRunStyle; runIndex: number }> = [];
  runs.forEach((run, runIndex) => {
    for (const ch of run.text) {
      out.push({ ch, style: run.style, runIndex });
    }
  });
  return out;
}

/**
 * Apply a style patch to the character range [start, end) (code-point indices).
 * Returns new coalesced runs.
 */
export function applyStyleToRange(
  runs: TextRun[],
  start: number,
  end: number,
  partial: TextRunStyle,
): TextRun[] {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.max(0, Math.max(start, end));
  if (a === b) return coalesceRuns(runs.map((r) => ({ ...r, style: r.style ? { ...r.style } : undefined })));

  const chars = expandRunChars(runs);
  if (chars.length === 0) return runs;

  const lo = Math.min(a, chars.length);
  const hi = Math.min(b, chars.length);
  for (let i = lo; i < hi; i++) {
    const cur = chars[i]!;
    chars[i] = {
      ...cur,
      style: { ...(cur.style ?? {}), ...partial },
    };
  }

  const next: TextRun[] = [];
  for (const c of chars) {
    const prev = next[next.length - 1];
    if (prev && styleKey(prev.style) === styleKey(c.style)) {
      prev.text += c.ch;
    } else {
      next.push({
        text: c.ch,
        style: c.style ? { ...c.style } : undefined,
      });
    }
  }
  return coalesceRuns(next);
}

/** Replace plain content, preserving a single base style from the first run / box. */
export function replaceContentKeepingBaseStyle(
  props: TextProps,
  content: string,
): TextProps {
  const prev = resolvedRuns(props);
  const base = prev[0]?.style ? { ...prev[0].style } : undefined;
  const runs = runsFromPlain(content, base);
  return normalizeTextProps({ ...props, content, runs });
}

/** Patch every run's style (e.g. Aa / effect preset applied to whole clip). */
export function mapRunStyles(
  props: TextProps,
  map: (style: TextRunStyle | undefined) => TextRunStyle | undefined,
): TextProps {
  const runs = resolvedRuns(props).map((r) => ({
    text: r.text,
    style: map(r.style ? { ...r.style } : undefined),
  }));
  return normalizeTextProps({ ...props, runs });
}

/** Insert plain text at a code-point index using pending / neighbor style. */
export function insertTextAt(
  runs: TextRun[],
  index: number,
  text: string,
  style?: TextRunStyle,
): TextRun[] {
  if (!text) return runs;
  const chars = expandRunChars(runs);
  const at = Math.max(0, Math.min(index, chars.length));
  const neighbor =
    style ??
    (at > 0 ? chars[at - 1]?.style : undefined) ??
    chars[at]?.style;
  const insert = [...text].map((ch) => ({
    ch,
    style: neighbor ? { ...neighbor } : undefined,
    runIndex: -1,
  }));
  const merged = [...chars.slice(0, at), ...insert, ...chars.slice(at)];
  const next: TextRun[] = [];
  for (const c of merged) {
    const prev = next[next.length - 1];
    if (prev && styleKey(prev.style) === styleKey(c.style)) {
      prev.text += c.ch;
    } else {
      next.push({
        text: c.ch,
        style: c.style ? { ...c.style } : undefined,
      });
    }
  }
  return coalesceRuns(next);
}

/** Delete code-point range [start, end). */
export function deleteRange(
  runs: TextRun[],
  start: number,
  end: number,
): TextRun[] {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.max(0, Math.max(start, end));
  const chars = expandRunChars(runs);
  const kept = [...chars.slice(0, a), ...chars.slice(b)];
  if (kept.length === 0) return [{ text: "" }];
  const next: TextRun[] = [];
  for (const c of kept) {
    const prev = next[next.length - 1];
    if (prev && styleKey(prev.style) === styleKey(c.style)) {
      prev.text += c.ch;
    } else {
      next.push({
        text: c.ch,
        style: c.style ? { ...c.style } : undefined,
      });
    }
  }
  return coalesceRuns(next);
}

export function cloneRuns(runs: TextRun[]): TextRun[] {
  return runs.map((r) => ({
    text: r.text,
    style: r.style ? { ...r.style } : undefined,
  }));
}

/** Slice runs to code-point range [start, end). */
export function sliceRuns(
  runs: TextRun[],
  start: number,
  end: number,
): TextRun[] {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.max(0, Math.max(start, end));
  const chars = expandRunChars(runs).slice(a, b);
  if (chars.length === 0) return [{ text: "" }];
  const next: TextRun[] = [];
  for (const c of chars) {
    const prev = next[next.length - 1];
    if (prev && styleKey(prev.style) === styleKey(c.style)) {
      prev.text += c.ch;
    } else {
      next.push({
        text: c.ch,
        style: c.style ? { ...c.style } : undefined,
      });
    }
  }
  return coalesceRuns(next);
}

/** Find first code-point index of `needle` in plain content (or -1). */
export function indexOfPlain(runs: TextRun[], needle: string): number {
  if (!needle) return 0;
  return plainContent(runs).indexOf(needle);
}
