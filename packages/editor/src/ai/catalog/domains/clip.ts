import { z } from "zod";
import { registerCapability } from "../register";
import { registerRecipe } from "../buildCatalog";

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

registerCapability({
  id: "clip.text",
  domain: "clip",
  title: "Text properties",
  summary: "Text content, font, color, stroke, shadow, align",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    content: z.string().optional(),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional(),
    color: z.string().optional(),
    fontWeight: z.union([z.string(), z.number()]).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    fontStyle: z.string().optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
    textTransform: z.string().optional(),
    strokeColor: z.string().optional(),
    strokeWidth: z.number().optional(),
    shadowColor: z.string().optional(),
    shadowBlur: z.number().optional(),
    shadowOffsetX: z.number().optional(),
    shadowOffsetY: z.number().optional(),
  }),
  examples: [
    {
      op: "set",
      target: "clip",
      path: "text.color",
      value: "#F3E3C3",
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
