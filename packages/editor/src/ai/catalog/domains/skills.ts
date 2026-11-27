import { z } from "zod";
import { registerCapability } from "../register";

registerCapability({
  id: "skill.image.generate",
  domain: "skill.image",
  title: "Generate image",
  summary:
    "Gemini image generation → import + place on timeline. Set asSticker for cutout stickers (green-screen + remove-bg).",
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
    /** Cutout sticker: solid chroma-green plate + removeBg on + overlay lane. */
    asSticker: z.boolean().optional(),
  }),
  constraints: [
    "Use asSticker:true when the user wants a sticker, cutout, die-cut, transparent background, no-background graphic, OR a complex overlay infographic (calendar, pie/bar/line chart, diagram, flowchart, roadmap, stats card) — not a full scene still.",
    "Do NOT invent HTML/SVG/widget calendars or charts — generate them as asSticker images.",
    "Transparent / alpha PNG requests are cutouts: set asSticker:true (host uses green-screen + chroma remove-bg; do not ask Gemini for real transparency).",
    "asSticker appends a fixed green-screen instruction and enables chroma remove-bg — do not also patch removeBg separately.",
    "Bundled kinetic/shape stickers stay timeline.insertSticker; AI-drawn stickers and infographics use this skill with asSticker.",
  ],
  examples: [
    {
      skill: "image.generate",
      prompt: "A cheerful cartoon taco wearing sunglasses",
      asSticker: true,
    },
    {
      skill: "image.generate",
      prompt: "A red rocket icon with transparent background",
      asSticker: true,
    },
    {
      skill: "image.generate",
      prompt: "A clean March 2026 calendar grid with labeled days",
      asSticker: true,
    },
    {
      skill: "image.generate",
      prompt: "A colorful pie chart showing market share segments with labels",
      asSticker: true,
    },
  ],
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
