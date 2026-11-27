/** Shared Zod shapes for rich text (clip.text + insertText). */

import { z } from "zod";

/** Per-run style overrides (merged onto clip box defaults when painting). */
export const textRunStyleSchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.union([z.string(), z.number()]).optional(),
    fontStyle: z.enum(["normal", "italic"]).optional(),
    textDecoration: z
      .enum(["none", "underline", "line-through"])
      .optional(),
    textTransform: z
      .enum(["none", "uppercase", "lowercase", "capitalize"])
      .optional(),
    script: z.enum(["normal", "super", "sub"]).optional(),
    color: z.string().optional(),
    /** CSS linear-gradient(...); null clears. */
    gradient: z.string().nullable().optional(),
    /** Marker highlight behind glyphs; null clears. */
    highlight: z.string().nullable().optional(),
    strokeColor: z.string().optional(),
    strokeWidth: z.number().optional(),
    letterSpacing: z.number().optional(),
  })
  .strict();

export const textRunSchema = z
  .object({
    text: z.string(),
    style: textRunStyleSchema.optional(),
  })
  .strict();

const vectorPointSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();

/** Text bubble / shape chrome behind glyphs. */
export const textBubbleSchema = z
  .object({
    type: z.enum([
      "none",
      "speech-round",
      "speech-comic",
      "thought-cloud",
      "comic-burst",
      "pill",
      "neon-frame",
      "torn-paper",
      "typing-box",
      "promo-badge",
      "ribbon",
      "arrow-tag",
      "hexagon",
      "ticket",
      "rounded-rect",
      "star-badge",
      "custom",
    ]),
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    paddingX: z.number().optional(),
    paddingY: z.number().optional(),
    accentColor: z.string().optional(),
    opacity: z.number().optional(),
    /** Closed polygon in ±0.5 space when type is custom (fallback). */
    points: z.array(vectorPointSchema).min(3).optional(),
    /**
     * AI-authored SVG path `d` in ±0.5 center-origin space (preferred for custom).
     * Static chrome only — no user upload, no keyframed morph.
     */
    pathD: z.string().min(2).max(8000).optional(),
  })
  .strict();

/** Box-level + rich-run text props the agent may patch or insert. */
export const textPropsSchema = z
  .object({
    content: z.string().optional(),
    /**
     * Styled spans. Join of run.text must match content when both are set.
     * Prefer runs for mixed typography; content alone = uniform single run.
     */
    runs: z.array(textRunSchema).optional(),
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.union([z.string(), z.number()]).optional(),
    fontStyle: z.enum(["normal", "italic"]).optional(),
    textDecoration: z
      .enum(["none", "underline", "line-through"])
      .optional(),
    textTransform: z
      .enum(["none", "uppercase", "lowercase", "capitalize"])
      .optional(),
    color: z.string().optional(),
    gradient: z.string().nullable().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
    strokeColor: z.string().optional(),
    strokeWidth: z.number().optional(),
    shadowColor: z.string().optional(),
    shadowBlur: z.number().optional(),
    shadowOffsetX: z.number().optional(),
    shadowOffsetY: z.number().optional(),
    retro3DColor: z.string().nullable().optional(),
    bubble: textBubbleSchema.optional(),
  })
  .strict();
