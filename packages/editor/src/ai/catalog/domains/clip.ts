import { z } from "zod";
import { registerCapability } from "../register";
import { registerRecipe } from "../buildCatalog";
import { textPropsSchema } from "../textSchema";

const animatableNumber = z.union([
  z.number(),
  z.object({
    staticValue: z.number(),
    keyframes: z
      .array(
        z.object({
          timeOffsetMs: z.number(),
          value: z.number(),
          easing: z.string().optional(),
        }),
      )
      .optional(),
  }),
]);

registerRecipe(
  "clip-transform.md",
  `# clip.transform

document_patch paths: transform.x|y|scaleX|scaleY|rotation.
Static number or AnimatableProperty. Keyframe via keyframe.set with animPath transform.*.
Keyframe times are clip-local ms.`,
);

registerRecipe(
  "clip-text.md",
  `# clip.text (rich text)

## Uniform style
document_patch \`set\` path \`text.color\` | \`text.fontSize\` | \`text.fontFamily\` | \`text.strokeWidth\` | …
Or replace the whole blob: path \`text\`, value = partial TextProps.

## Mixed styles (runs)
path \`text.runs\` — array of \`{ text, style? }\`.
\`content\` is always the join of run text (kept in sync).
When both \`content\` and \`runs\` are sent, runs win for layout; content is rewritten from runs.

### Run style fields
fontFamily, fontSize, fontWeight, fontStyle (normal|italic),
textDecoration (none|underline|line-through), textTransform,
script (normal|super|sub), color, gradient (CSS linear-gradient string or null),
highlight (marker bg hex or null), strokeColor, strokeWidth, letterSpacing.

### Box-only fields (whole clip)
align, lineHeight, shadow*, retro3DColor, bubble (via text.bubble).

### Custom text shape (bubble)
path \`text.bubble\` with \`type: "custom"\`. Prefer AI-authored SVG \`pathD\`
(path \`d\` string) in ±0.5 center-origin space — curves allowed (C/Q/A), close
with Z. Example: \`M-0.45-0.2 C-0.45-0.45 0.45-0.45 0.45-0.2 L0.45 0.35 Z\`.
Fallback: \`points: [{x,y},...]\` polygon (min 3). Also set fill/stroke/
strokeWidth/opacity/padding*. Invent the full shape in one patch — static
chrome only (no upload, no keyframed morph). Preset types still work
(speech-round, pill, star-badge, …).

### Gradient example
\`linear-gradient(90deg, #f59e0b 0%, #ec4899 100%)\`

### Fonts (bundled stacks)
Inter, Montserrat, Playfair Display, Space Grotesk, Pacifico, Anton, Bangers,
Fredoka, Permanent Marker, Comic Neue, Rubik Mono One, Press Start 2P,
system-ui, Georgia, Menlo, Helvetica Neue.

Invent bold / neon / hollow / highlight looks by combining color, gradient,
stroke, highlight, and weight — no preset catalog required.
`,
);

registerCapability({
  id: "clip.text",
  domain: "clip",
  title: "Text properties",
  summary:
    "Rich text: content, runs (per-span style), font, color, gradient, stroke, shadow, highlight, align, bubble (incl. type custom + pathD SVG / points)",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: textPropsSchema,
  recipeRef: "clip-text.md",
  constraints: [
    "Use text.runs for mixed fonts/colors/highlights in one clip",
    "gradient is a CSS linear-gradient(...) string; null clears",
    "highlight is a marker background color; null clears",
    "Custom bubble: prefer pathD (SVG d in ±0.5 space); no user upload; static only",
  ],
  examples: [
    {
      op: "set",
      target: "clip",
      path: "text.color",
      value: "#F3E3C3",
    },
    {
      op: "set",
      target: "clip",
      path: "text.runs",
      value: [
        {
          text: "NEW ",
          style: {
            fontWeight: 900,
            color: "#0f172a",
            highlight: "#facc15",
          },
        },
        {
          text: "DROP",
          style: {
            fontWeight: 900,
            gradient: "linear-gradient(90deg, #f59e0b 0%, #ec4899 100%)",
          },
        },
      ],
    },
  ],
});

registerCapability({
  id: "clip.transform",
  domain: "clip",
  title: "2D transform",
  summary: "Position, scale, rotation; static or keyframed",
  verbs: ["inspect", "patch", "keyframe"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    x: animatableNumber.optional(),
    y: animatableNumber.optional(),
    scaleX: animatableNumber.optional(),
    scaleY: animatableNumber.optional(),
    rotation: animatableNumber.optional(),
  }),
  recipeRef: "clip-transform.md",
  examples: [
    {
      op: "set",
      target: "clip",
      path: "transform.x",
      value: 120,
    },
    {
      op: "keyframe.set",
      target: "clip",
      animPath: "transform.x",
      timeOffsetMs: 0,
      value: 0,
      easing: "easeInOut",
    },
  ],
});

registerCapability({
  id: "clip.opacity",
  domain: "clip",
  title: "Opacity",
  summary: "Clip opacity 0–1; static or keyframed",
  verbs: ["inspect", "patch", "keyframe"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    opacity: animatableNumber,
  }),
  examples: [
    { op: "set", target: "clip", path: "opacity", value: 0.8 },
  ],
});

registerCapability({
  id: "clip.animation",
  domain: "clip",
  title: "Text animation presets",
  summary: "In/out/loop text animation presets (fade, slide, typewriter, …)",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    in: z
      .object({
        presetId: z.string(),
        durationMs: z.number().optional(),
        direction: z.enum(["left", "right", "up", "down"]).optional(),
      })
      .nullable()
      .optional(),
    out: z
      .object({
        presetId: z.string(),
        durationMs: z.number().optional(),
        direction: z.enum(["left", "right", "up", "down"]).optional(),
      })
      .nullable()
      .optional(),
    loop: z
      .object({ presetId: z.string() })
      .nullable()
      .optional(),
    granularity: z
      .enum(["whole", "line", "word", "character"])
      .optional(),
  }),
  constraints: [
    "presetIds: fade, slide, typewriter, none, and other editor presets",
  ],
});

registerCapability({
  id: "clip.blendMode",
  domain: "clip",
  title: "Blend mode",
  summary: "Compositing blend mode",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    blendMode: z.string(),
  }),
});
