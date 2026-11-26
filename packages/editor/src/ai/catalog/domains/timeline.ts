import { z } from "zod";
import { registerCapability } from "../register";
import { textPropsSchema } from "../textSchema";

const clipIdSchema = z.string().min(1);

registerCapability({
  id: "timeline.move",
  domain: "timeline",
  title: "Move clip",
  summary: "Move a clip to a new startMs and optional track",
  verbs: ["timeline"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    action: z.literal("move"),
    clipId: clipIdSchema.optional(),
    startMs: z.number(),
    trackId: z.string().optional(),
  }),
});

registerCapability({
  id: "timeline.trim",
  domain: "timeline",
  title: "Trim clip",
  summary: "Trim clip edges / duration (large trims may need Confirm)",
  verbs: ["timeline"],
  targets: ["clip"],
  risk: "review",
  schema: z.object({
    action: z.literal("trim"),
    clipId: clipIdSchema.optional(),
    startMs: z.number().optional(),
    durationMs: z.number().optional(),
    inMs: z.number().optional(),
    outMs: z.number().optional(),
  }),
});

registerCapability({
  id: "timeline.split",
  domain: "timeline",
  title: "Split clip",
  summary: "Split a clip at absolute atMs (defaults to playhead)",
  verbs: ["timeline"],
  targets: ["clip"],
  risk: "safe",
  schema: z.object({
    action: z.literal("split"),
    clipId: clipIdSchema.optional(),
    atMs: z.number().optional(),
  }),
});

registerCapability({
  id: "timeline.delete",
  domain: "timeline",
  title: "Delete clips",
  summary: "Ripple-delete one or more clips (multi-delete needs Confirm)",
  verbs: ["timeline"],
  targets: ["clip"],
  risk: "review",
  schema: z.object({
    action: z.literal("delete"),
    clipId: clipIdSchema.optional(),
    clipIds: z.array(clipIdSchema).optional(),
  }),
});

registerCapability({
  id: "timeline.insertText",
  domain: "timeline",
  title: "Insert text clip",
  summary:
    "Insert a text clip; pass content and/or runs for rich per-span styling",
  verbs: ["timeline"],
  targets: ["timeline"],
  risk: "safe",
  schema: textPropsSchema.extend({
    action: z.literal("insertText"),
    startMs: z.number().optional(),
    durationMs: z.number().optional(),
    trackId: z.string().optional(),
    preset: z.enum(["title", "body"]).optional(),
  }),
  constraints: [
    "Provide content and/or runs (runs join becomes content)",
    "Prefer runs when spans need different color/weight/gradient/highlight",
    "After insert, further style via document_patch on clip.text / text.runs",
  ],
});

registerCapability({
  id: "timeline.insertSticker",
  domain: "timeline",
  title: "Insert sticker",
  summary: "Insert a sticker from the catalog onto the timeline",
  verbs: ["timeline"],
  targets: ["timeline"],
  risk: "safe",
  schema: z.object({
    action: z.literal("insertSticker"),
    stickerId: z.string(),
    startMs: z.number().optional(),
    durationMs: z.number().optional(),
    trackId: z.string().optional(),
  }),
});

registerCapability({
  id: "timeline.insertMedia",
  domain: "timeline",
  title: "Place media",
  summary: "Place an existing library media asset on the timeline",
  verbs: ["timeline"],
  targets: ["timeline", "media"],
  risk: "safe",
  schema: z.object({
    action: z.literal("insertMedia"),
    mediaId: z.string(),
    startMs: z.number().optional(),
    durationMs: z.number().optional(),
    trackId: z.string().optional(),
  }),
  status: "experimental",
  constraints: ["Media must already exist in the project media library"],
});
