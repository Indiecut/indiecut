import { z } from "zod";
import { registerCapability } from "../register";

registerCapability({
  id: "session.selection",
  domain: "session",
  title: "Clip selection",
  summary: "Set which clip ids are selected in the editor UI",
  verbs: ["inspect", "patch"],
  targets: ["session"],
  risk: "safe",
  schema: z.object({
    clipIds: z.array(z.string()),
  }),
  constraints: [
    "Ephemeral UI state — not persisted in project.json",
    "Use document_patch target=session path=selection",
  ],
  examples: [
    {
      op: "set",
      target: "session",
      path: "selection",
      value: ["clip_abc"],
    },
  ],
});
