import { DEFAULT_REMOVE_BG_KEY_COLOR } from "../../project/removeBgDefaults";

/** Matches createDefaultRemoveBg key so chroma keys cleanly. */
export const STICKER_GREEN_HEX = `#${DEFAULT_REMOVE_BG_KEY_COLOR.map((c) =>
  c.toString(16).padStart(2, "0"),
).join("")}`;

const GREEN_BG = `Solid flat background exactly ${STICKER_GREEN_HEX} (RGB ${DEFAULT_REMOVE_BG_KEY_COLOR.join(",")}) — no gradients, shadows, reflections, or props on the background.`;

const STICKER_GREEN_SCREEN_SUFFIX = [
  `Sticker cutout plate: subject only, centered, fully in frame.`,
  GREEN_BG,
  `No text overlays. Crisp silhouette suitable for chroma key.`,
].join(" ");

/** Infographics need on-graphic labels; still a cutout plate. */
const INFOGRAPHIC_GREEN_SCREEN_SUFFIX = [
  `Infographic cutout plate: one self-contained graphic centered, fully in frame.`,
  GREEN_BG,
  `Readable labels, numbers, and legends ON the graphic are OK. No photo scene behind it. Crisp edges suitable for chroma key.`,
].join(" ");

const CUTOUT_LANGUAGE =
  /\b(sticker|cut[\s-]?out|die[\s-]?cut|transparent(\s+(background|bg))?|no\s+background|without\s+(a\s+)?background|alpha(\s+channel)?|with\s+transparency|png\s+transparency)\b/i;

/**
 * Complex overlay graphics that should be AI stickers (not HTML/SVG widgets
 * and not full-bleed scene stills).
 */
const INFOGRAPHIC_LANGUAGE =
  /\b(infographic|calendar|agenda|schedule\s*board|pie\s*(chart|graph)|donut\s*(chart|graph)|bar\s*(chart|graph)|line\s*(chart|graph)|area\s*(chart|graph)|flow\s*chart|org(?:anization)?\s*chart|venn(\s*diagram)?|mind\s*map|diagram|heatmap|gauge(\s*chart)?|stats?\s*(card|panel|widget)|kpi\s*(card|widget)|dashboard\s*(card|widget|tile)|roadmap|funnel\s*(chart)?|timeline\s*(graphic|infographic|chart)|gantt(\s*chart)?|(?:a|an|the)\s+(?:chart|graph))\b/i;

/** True when the prompt is a chart / calendar / diagram-style overlay. */
export function promptImpliesInfographic(prompt: string): boolean {
  return INFOGRAPHIC_LANGUAGE.test(prompt);
}

/**
 * True when the prompt asks for a cutout / transparent plate / infographic —
 * host should treat generate as asSticker even if the model omitted the flag.
 */
export function promptImpliesStickerCutout(prompt: string): boolean {
  return CUTOUT_LANGUAGE.test(prompt) || promptImpliesInfographic(prompt);
}

/** Drop alpha/transparent wording so Gemini is not asked for real transparency. */
function stripTransparentBackgroundLanguage(prompt: string): string {
  return prompt
    .replace(
      /\b(with|on|and)\s+(a\s+)?(fully\s+)?transparent(\s+(background|bg))?\b/gi,
      " ",
    )
    .replace(/\btransparent(\s+(background|bg))?\b/gi, " ")
    .replace(/\bwithout\s+(a\s+)?background\b/gi, " ")
    .replace(/\bno\s+background\b/gi, " ")
    .replace(/\balpha(\s+channel)?\b/gi, " ")
    .replace(/\bwith\s+transparency\b/gi, " ")
    .replace(/\bpng\s+transparency\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!])/g, "$1")
    .replace(/^[.,;:\s]+|[.,;:\s]+$/g, "")
    .trim();
}

/** Append fixed chroma-green plate instructions when missing from the user prompt. */
export function withStickerGreenScreen(prompt: string): string {
  const trimmed = stripTransparentBackgroundLanguage(prompt.trim());
  const suffix = promptImpliesInfographic(trimmed)
    ? INFOGRAPHIC_GREEN_SCREEN_SUFFIX
    : STICKER_GREEN_SCREEN_SUFFIX;
  if (!trimmed) {
    return suffix;
  }
  if (/green\s*screen|chroma|#[0-9a-f]{6}/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}. ${suffix}`;
}
