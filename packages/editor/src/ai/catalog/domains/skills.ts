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

registerCapability({
  id: "skill.sfx.generate",
  domain: "skill.sfx",
  title: "Generate sound effect",
  summary:
    "ElevenLabs text-to-SFX → import audio clip (API key only; no Voice ID)",
  verbs: ["skill"],
  targets: ["media", "timeline"],
  risk: "skill",
  skill: "sfx.generate",
  schema: z.object({
    skill: z.literal("sfx.generate"),
    text: z.string(),
    prompt: z.string().optional(),
    durationSeconds: z.number().optional(),
    durationMs: z.number().optional(),
    loop: z.boolean().optional(),
    promptInfluence: z.number().optional(),
    startMs: z.number().optional(),
    trackId: z.string().optional(),
  }),
  constraints: [
    "Describe the sound in natural language (action, setting, atmosphere).",
    "Optional durationSeconds 0.5–30; omit to let the model choose length.",
    "Does not use Voice ID — only the ElevenLabs API key.",
  ],
  examples: [
    {
      skill: "sfx.generate",
      text: "Soft rain against a window in a quiet apartment",
      durationSeconds: 4,
    },
  ],
});
