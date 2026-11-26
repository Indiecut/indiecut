import type { VisionMode } from "./types";

/**
 * Host heuristics for Vision Auto (initial.md §4.2).
 * Returns whether to attach a cheap composite on this user turn.
 */
export function shouldAttachCheapComposite(args: {
  mode: VisionMode;
  userText: string;
  hasSelection: boolean;
}): boolean {
  if (args.mode === "off") return false;
  if (args.mode === "always") return true;

  const text = args.userText.trim().toLowerCase();
  if (!text) return false;

  // Clear structural / property asks — skip vision when selection is present.
  const structural =
    /\b(move|trim|split|delete|cut|razor|insert|duplicate|nudge)\b/.test(text) ||
    /\b(make|set|change|update|bump|increase|decrease|bigger|smaller|larger|font|color|colour|opacity|scale|rotate|title|text)\b/.test(
      text,
    );

  if (structural && args.hasSelection) return false;

  // Visual / ambiguous
  const visual =
    /\b(look|looks|frame|shot|preview|match|background|colour|color match|fix (this|it) up|what('?s| is) wrong|does this look|see (this|the))\b/.test(
      text,
    ) ||
    /\b(this|the shot|what('?s| is) on (screen|preview))\b/.test(text);

  if (visual) return true;

  // Empty selection + deixis → attach so the model can see "this"
  if (
    !args.hasSelection &&
    /\b(this|that|here|the (frame|shot|preview|image))\b/.test(text)
  ) {
    return true;
  }

  return false;
}
