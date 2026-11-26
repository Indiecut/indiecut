import { z } from "zod";
import { registerCapability } from "../register";

registerCapability({
  id: "track.flags",
  domain: "track",
  title: "Track flags",
  summary: "Lock, hide, mute, solo a track",
  verbs: ["inspect", "patch"],
  targets: ["track"],
  risk: "safe",
  schema: z.object({
    trackId: z.string(),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    muted: z.boolean().optional(),
    solo: z.boolean().optional(),
  }),
});

registerCapability({
  id: "track.structure",
  domain: "track",
  title: "Track structure",
  summary: "Add or reorder tracks",
  verbs: ["timeline"],
  targets: ["track"],
  risk: "review",
  schema: z.object({
    action: z.enum(["add", "reorder"]),
    trackType: z.string().optional(),
    trackId: z.string().optional(),
    index: z.number().int().optional(),
  }),
});
