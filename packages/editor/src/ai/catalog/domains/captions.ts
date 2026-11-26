import { z } from "zod";
import { registerCapability } from "../register";

registerCapability({
  id: "captions.auto",
  domain: "captions",
  title: "Auto captions",
  summary:
    "Run auto-caption job on timeline speech (Whisper on-device, or ElevenLabs when configured)",
  verbs: ["skill"],
  targets: ["captions", "timeline"],
  risk: "skill",
  skill: "captions.auto",
  schema: z.object({
    skill: z.literal("captions.auto"),
    language: z.string().optional(),
    provider: z.enum(["whisper", "elevenlabs"]).optional(),
  }),
  constraints: [
    "Requires audible speech on the timeline",
    "provider=elevenlabs requires an ElevenLabs API key in Settings → AI → Voice",
  ],
});

registerCapability({
  id: "captions.cues",
  domain: "captions",
  title: "Caption cues",
  summary: "Patch cue text/timing on a caption clip",
  verbs: ["inspect", "patch"],
  targets: ["clip"],
  risk: "review",
  schema: z.object({
    clipId: z.string(),
    cues: z.array(
      z.object({
        id: z.string().optional(),
        startMs: z.number().optional(),
        endMs: z.number().optional(),
        text: z.string().optional(),
      }),
    ),
  }),
});
