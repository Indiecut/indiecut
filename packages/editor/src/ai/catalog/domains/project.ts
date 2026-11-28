import { z } from "zod";
import { registerCapability } from "../register";
import { registerRecipe } from "../buildCatalog";

registerRecipe(
  "project-display.md",
  `# project.spec

Patch project display via document_patch target project:
title, fps, width, height, resolutionMode (adapted|720p|1080p|2k), aspectRatio, colorSpace.
Playhead: path playheadMs. Large resolution changes may need Confirm.`,
);

registerCapability({
  id: "project.spec",
  domain: "project",
  title: "Project display settings",
  summary: "Title, fps, size, resolutionMode, aspectRatio, colorSpace",
  verbs: ["inspect", "patch"],
  targets: ["project"],
  risk: "review",
  schema: z.object({
    title: z.string().optional(),
    fps: z.number().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    resolutionMode: z.enum(["adapted", "720p", "1080p", "2k"]).optional(),
    aspectRatio: z.string().optional(),
    colorSpace: z.string().optional(),
  }),
  recipeRef: "project-display.md",
  constraints: [
    "Use document_patch with target=project",
    "resolutionMode/size changes may reflow the canvas — risk review",
  ],
  examples: [
    {
      op: "set",
      target: "project",
      path: "resolutionMode",
      value: "1080p",
    },
  ],
});

registerCapability({
  id: "project.playhead",
  domain: "project",
  title: "Playhead",
  summary: "Set sequence playhead position (absolute ms)",
  verbs: ["inspect", "patch"],
  targets: ["project"],
  risk: "safe",
  schema: z.object({
    playheadMs: z.number().min(0),
  }),
  examples: [
    { op: "set", target: "project", path: "playheadMs", value: 12000 },
  ],
});
