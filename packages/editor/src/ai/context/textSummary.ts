/** Compact text props for AI context / inspect (no templates). */

import type { TextProps, TextRun } from "../../project/types";
import { hasMixedRunStyles } from "../../text/runs";

export type AiTextRunSummary = {
  text: string;
  style?: Record<string, unknown>;
};

export type AiTextSummary = {
  content: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  align?: string;
  fontWeight?: number | string;
  fontStyle?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: string;
  textDecoration?: string;
  gradient?: string | null;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  retro3DColor?: string | null;
  /** True when spans differ (or use highlight/script). */
  mixedRuns?: boolean;
  runs?: AiTextRunSummary[];
};

function compactStyle(
  style: TextRun["style"] | undefined,
): Record<string, unknown> | undefined {
  if (!style) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Cap run payload so long titles stay prompt-friendly. */
const MAX_RUNS_IN_SUMMARY = 24;

export function summarizeTextProps(text: TextProps): AiTextSummary {
  const mixed = hasMixedRunStyles(text);
  const runsRaw = text.runs;
  let runs: AiTextRunSummary[] | undefined;
  if (runsRaw && runsRaw.length > 0 && (mixed || runsRaw.length > 1)) {
    const slice = runsRaw.slice(0, MAX_RUNS_IN_SUMMARY);
    runs = slice.map((r) => ({
      text: r.text,
      style: compactStyle(r.style),
    }));
    if (runsRaw.length > MAX_RUNS_IN_SUMMARY) {
      runs.push({
        text: `…(+${runsRaw.length - MAX_RUNS_IN_SUMMARY} more runs)`,
      });
    }
  }

  return {
    content: text.content,
    fontSize: text.fontSize,
    fontFamily: text.fontFamily,
    color: text.color,
    align: text.align,
    fontWeight: text.fontWeight,
    fontStyle: text.fontStyle,
    letterSpacing: text.letterSpacing,
    lineHeight: text.lineHeight,
    textTransform: text.textTransform,
    textDecoration: text.textDecoration,
    gradient: text.gradient,
    strokeColor: text.strokeColor,
    strokeWidth: text.strokeWidth,
    shadowColor: text.shadowColor,
    shadowBlur: text.shadowBlur,
    shadowOffsetX: text.shadowOffsetX,
    shadowOffsetY: text.shadowOffsetY,
    retro3DColor: text.retro3DColor,
    mixedRuns: mixed || undefined,
    runs,
  };
}
