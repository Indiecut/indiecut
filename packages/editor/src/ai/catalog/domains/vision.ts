import { z } from "zod";
import { registerCapability } from "../register";

registerCapability({
  id: "vision.stage",
  domain: "vision",
  title: "Stage capture",
  summary: "Capture the preview composite (cheap or HQ)",
  verbs: ["capture", "inspect"],
  targets: ["vision"],
  risk: "safe",
  schema: z.object({
    mode: z.enum(["composite", "media"]).default("composite"),
    maxWidth: z.number().optional(),
    quality: z.number().min(0.1).max(1).optional(),
    clipId: z.string().optional(),
  }),
});

registerCapability({
  id: "vision.media",
  domain: "vision",
  title: "Source media plate",
  summary: "Capture a source frame from a media-backed clip",
  verbs: ["capture", "inspect"],
  targets: ["vision", "clip"],
  risk: "safe",
  schema: z.object({
    mode: z.literal("media"),
    clipId: z.string().optional(),
    maxWidth: z.number().optional(),
    quality: z.number().optional(),
  }),
});
