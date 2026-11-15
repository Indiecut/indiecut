/**
 * Caption Styles tab presets — look + native TextAnimationParams.
 * Inspired by caption-app creative styles, rendered via IndieCut's text anim system.
 */
import { hasActiveTextAnimation } from "../../engine/textAnimation";
import type {
  CaptionCue,
  CaptionPosition,
  TextAnimDirection,
  TextAnimationGranularity,
  TextAnimationParams,
  TextProps,
} from "../../project/types";

export type CaptionMotionPreset = {
  id: string;
  name: string;
  hint: string;
  sample: string;
  style: Omit<TextProps, "content">;
  position?: CaptionPosition;
  offsetY?: number;
  animation?: TextAnimationParams;
};

const baseClean = {
  gradient: null as null,
  retro3DColor: null as null,
};

function animIn(
  presetId: string,
  opts?: {
    durationMs?: number;
    direction?: TextAnimDirection;
    granularity?: TextAnimationGranularity;
    loop?: string;
    out?: string;
  },
): TextAnimationParams {
  const next: TextAnimationParams = {
    in: {
      presetId,
      durationMs: opts?.durationMs ?? 450,
      ...(opts?.direction ? { direction: opts.direction } : {}),
    },
    granularity: opts?.granularity ?? "word",
  };
  if (opts?.out) {
    next.out = { presetId: opts.out, durationMs: 350 };
  }
  if (opts?.loop) {
    next.loop = { presetId: opts.loop };
  }
  return next;
}

/** Styles gallery for the caption inspector (per-cue only). */
export const CAPTION_MOTION_PRESETS: CaptionMotionPreset[] = [
  {
    id: "none",
    name: "None",
    hint: "Reset to normal",
    sample: "normal",
    style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 36,
      fontWeight: 700,
      color: "#ffffff",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 3,
      lineHeight: 1.2,
      textTransform: "none",
      fontStyle: "normal",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      ...baseClean,
      stylePresetId: "none",
    },
    animation: undefined,
  },
  {
    id: "classic",
    name: "Classic",
    hint: "Fade in",
    sample: "Classic captions",
    position: "bottom",
    offsetY: 0,
    style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 36,
      fontWeight: 700,
      color: "#ffffff",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 3,
      lineHeight: 1.2,
      textTransform: "none",
      fontStyle: "normal",
      ...baseClean,
      stylePresetId: "classic",
    },
    animation: animIn("fade_in", { durationMs: 400, granularity: "whole" }),
  },
  {
    id: "soft-white",
    name: "Soft White",
    hint: "Gentle fade",
    sample: "Soft white",
    position: "bottom",
    offsetY: 8,
    style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 34,
      fontWeight: 600,
      color: "#ffffff",
      align: "center",
      strokeWidth: 0,
      strokeColor: "#000000",
      lineHeight: 1.25,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "rgba(0,0,0,0.75)",
      shadowBlur: 8,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      ...baseClean,
      stylePresetId: "soft-white",
    },
    animation: animIn("fade_in", { durationMs: 500, granularity: "whole" }),
  },
  {
    id: "hormozi",
    name: "Hormozi",
    hint: "Word pop",
    sample: "Make More Money",
    position: "bottom",
    offsetY: 12,
    style: {
      fontFamily: "Montserrat, system-ui, sans-serif",
      fontSize: 44,
      fontWeight: 900,
      color: "#fde047",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 5,
      lineHeight: 1.05,
      textTransform: "uppercase",
      fontStyle: "normal",
      shadowColor: "rgba(0,0,0,0.7)",
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      ...baseClean,
      stylePresetId: "hormozi",
    },
    animation: animIn("pop_up", {
      durationMs: 500,
      granularity: "word",
      out: "shrink",
    }),
  },
  {
    id: "mrbeast",
    name: "MrBeast Pop",
    hint: "Chunky bounce",
    sample: "INSANE GIVEAWAY",
    position: "center",
    offsetY: 0,
    style: {
      fontFamily: "Anton, system-ui, sans-serif",
      fontSize: 52,
      fontWeight: 400,
      color: "#ffffff",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 6,
      lineHeight: 1.0,
      textTransform: "uppercase",
      fontStyle: "normal",
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      ...baseClean,
      stylePresetId: "mrbeast",
    },
    animation: animIn("bounce_in", {
      durationMs: 600,
      granularity: "word",
      out: "drop_out",
    }),
  },
  {
    id: "yellow-tape",
    name: "Yellow Tape",
    hint: "Slide up",
    sample: "Watch This Part",
    position: "bottom",
    offsetY: 0,
    style: {
      fontFamily: "Montserrat, system-ui, sans-serif",
      fontSize: 40,
      fontWeight: 800,
      color: "#facc15",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 4,
      lineHeight: 1.1,
      textTransform: "uppercase",
      fontStyle: "normal",
      ...baseClean,
      stylePresetId: "yellow-tape",
    },
    animation: animIn("slide", {
      durationMs: 450,
      direction: "up",
      granularity: "word",
      out: "slide_away",
    }),
  },
  {
    id: "neon",
    name: "Neon Sign",
    hint: "Glow + flicker",
    sample: "Neon Nights",
    position: "center",
    offsetY: -20,
    style: {
      fontFamily: "Space Grotesk, system-ui, sans-serif",
      fontSize: 42,
      fontWeight: 700,
      color: "#67e8f9",
      align: "center",
      strokeColor: "#0e7490",
      strokeWidth: 2,
      lineHeight: 1.15,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "rgba(34,211,238,0.85)",
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      ...baseClean,
      stylePresetId: "neon",
    },
    animation: animIn("zoom_in", {
      durationMs: 450,
      granularity: "word",
      loop: "flicker",
    }),
  },
  {
    id: "typewriter",
    name: "Typewriter",
    hint: "Char reveal",
    sample: "booting caption mode",
    position: "bottom",
    offsetY: 8,
    style: {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 32,
      fontWeight: 600,
      color: "#4ade80",
      align: "left",
      strokeWidth: 0,
      strokeColor: "#000000",
      lineHeight: 1.3,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "rgba(74,222,128,0.4)",
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      ...baseClean,
      stylePresetId: "typewriter",
    },
    animation: animIn("typewriter", {
      durationMs: 800,
      granularity: "character",
      out: "fade_out",
    }),
  },
  {
    id: "cinematic",
    name: "Cinematic",
    hint: "Soft fade",
    sample: "Quiet moment",
    position: "bottom",
    offsetY: 16,
    style: {
      fontFamily: "Playfair Display, Georgia, serif",
      fontSize: 32,
      fontWeight: 700,
      color: "#fafafa",
      align: "center",
      strokeWidth: 0,
      strokeColor: "#000000",
      lineHeight: 1.35,
      textTransform: "none",
      fontStyle: "italic",
      shadowColor: "rgba(0,0,0,0.85)",
      shadowBlur: 12,
      shadowOffsetX: 0,
      shadowOffsetY: 3,
      ...baseClean,
      stylePresetId: "cinematic",
    },
    animation: animIn("fade_in", {
      durationMs: 700,
      granularity: "whole",
      out: "fade_out",
    }),
  },
  {
    id: "glitch",
    name: "Glitch Impact",
    hint: "Jiggle hit",
    sample: "GLITCH MODE",
    position: "center",
    offsetY: 0,
    style: {
      fontFamily: "Montserrat, system-ui, sans-serif",
      fontSize: 48,
      fontWeight: 900,
      color: "#ffffff",
      align: "center",
      strokeColor: "#ef4444",
      strokeWidth: 3,
      lineHeight: 1.05,
      textTransform: "uppercase",
      fontStyle: "normal",
      shadowColor: "#22d3ee",
      shadowBlur: 0,
      shadowOffsetX: 3,
      shadowOffsetY: 0,
      ...baseClean,
      stylePresetId: "glitch",
    },
    animation: animIn("zoom_in", {
      durationMs: 350,
      granularity: "word",
      loop: "jiggle",
      out: "glitch_out",
    }),
  },
  {
    id: "karaoke",
    name: "Karaoke",
    hint: "Word bounce",
    sample: "Sing along now",
    position: "bottom",
    offsetY: 12,
    style: {
      fontFamily: "Fredoka, system-ui, sans-serif",
      fontSize: 40,
      fontWeight: 700,
      color: "#ffffff",
      align: "center",
      strokeColor: "#111827",
      strokeWidth: 4,
      lineHeight: 1.15,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "rgba(0,0,0,0.45)",
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      ...baseClean,
      stylePresetId: "karaoke",
    },
    animation: animIn("bounce_in", {
      durationMs: 550,
      granularity: "word",
      loop: "pulse",
    }),
  },
  {
    id: "comic",
    name: "Comic Pop",
    hint: "Pop art",
    sample: "POW BAM WOW",
    position: "center",
    offsetY: 20,
    style: {
      fontFamily: "Bangers, system-ui, sans-serif",
      fontSize: 48,
      fontWeight: 400,
      color: "#ffffff",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 4,
      lineHeight: 1.1,
      textTransform: "uppercase",
      fontStyle: "normal",
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 4,
      shadowOffsetY: 4,
      ...baseClean,
      stylePresetId: "comic",
    },
    animation: animIn("pop_up", {
      durationMs: 450,
      granularity: "word",
      out: "shrink",
    }),
  },
  {
    id: "wave",
    name: "Wavy",
    hint: "Wave loop",
    sample: "Color Wave",
    position: "bottom",
    offsetY: 0,
    style: {
      fontFamily: "Montserrat, system-ui, sans-serif",
      fontSize: 40,
      fontWeight: 800,
      color: "#f472b6",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 3,
      lineHeight: 1.1,
      textTransform: "none",
      fontStyle: "normal",
      ...baseClean,
      stylePresetId: "wave",
    },
    animation: animIn("slide", {
      durationMs: 500,
      direction: "up",
      granularity: "word",
      loop: "wave",
    }),
  },
  {
    id: "minimal",
    name: "Minimal",
    hint: "Clean fade",
    sample: "Keep it simple",
    position: "bottom",
    offsetY: -8,
    style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 28,
      fontWeight: 500,
      color: "#f3f4f6",
      align: "center",
      strokeWidth: 0,
      strokeColor: "#000000",
      lineHeight: 1.3,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "rgba(0,0,0,0.5)",
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 1,
      ...baseClean,
      stylePresetId: "minimal",
    },
    animation: animIn("fade_in", { durationMs: 450, granularity: "whole" }),
  },
];

export function findCaptionMotionPreset(
  id: string | null | undefined,
): CaptionMotionPreset | undefined {
  if (!id) return undefined;
  return CAPTION_MOTION_PRESETS.find((p) => p.id === id);
}

/**
 * True when the cue has a Styles-tab look/animation.
 * Apply to all skips these so Options only land on normal cues.
 */
export function isCaptionCueStyled(cue: CaptionCue): boolean {
  if (hasActiveTextAnimation(cue.animation)) return true;
  const id = cue.style?.stylePresetId;
  if (!id || id === "none" || id === "custom") return false;
  return Boolean(findCaptionMotionPreset(id));
}
