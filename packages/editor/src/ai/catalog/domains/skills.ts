import { z } from "zod";
import { registerCapability } from "../register";

registerCapability({
  id: "skill.image.generate",
  domain: "skill.image",
  title: "Generate image",
  summary: "Gemini image generation → import + place on timeline",
  verbs: ["skill"],
  targets: ["media", "timeline"],
  risk: "skill",
  skill: "image.generate",
  schema: z.object({
    skill: z.literal("image.generate"),
    prompt: z.string(),
    startMs: z.number().optional(),
    durationMs: z.number().optional(),
    aspectHint: z.string().optional(),
  }),
});

registerCapability({
  id: "skill.image.editFrame",
  domain: "skill.image",
  title: "Edit frame",
  summary: "Gemini edit of composite or source plate → place result",
  verbs: ["skill"],
  targets: ["media", "timeline"],
  risk: "skill",
  skill: "image.editFrame",
  schema: z.object({
    skill: z.literal("image.editFrame"),
    prompt: z.string(),
    source: z.enum(["composite", "media"]).optional(),
    clipId: z.string().optional(),
    startMs: z.number().optional(),
  }),
});

registerCapability({
  id: "skill.voice.generate",
  domain: "skill.voice",
  title: "Generate voiceover",
  summary: "ElevenLabs TTS → import audio clip on timeline",
  verbs: ["skill"],
  targets: ["media", "timeline"],
  risk: "skill",
  skill: "voice.generate",
  schema: z.object({
    skill: z.literal("voice.generate"),
    text: z.string(),
    voiceId: z.string().optional(),
    startMs: z.number().optional(),
    trackId: z.string().optional(),
  }),
});
