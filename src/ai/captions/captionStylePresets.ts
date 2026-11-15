import type { CaptionPosition, CaptionProps, TextProps } from "../../project/types";

export type CaptionStylePreset = {
  id: string;
  name: string;
  /** Style fields applied onto caption.style (content stays on cues). */
  style: Omit<TextProps, "content">;
  position?: CaptionPosition;
  offsetY?: number;
};

export const CAPTION_CUSTOM_PRESET_ID = "custom";

const cleanExtras = {
  gradient: null as null,
  retro3DColor: null as null,
  shadowColor: undefined as string | undefined,
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

/** Subtitle look presets for the caption inspector. */
export const CAPTION_STYLE_PRESETS: CaptionStylePreset[] = [
  {
    id: "classic",
    name: "Classic",
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
      ...cleanExtras,
      stylePresetId: "classic",
    },
  },
  {
    id: "netflix",
    name: "Soft White",
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
      gradient: null,
      retro3DColor: null,
      stylePresetId: "netflix",
    },
  },
  {
    id: "yellow-sub",
    name: "Yellow Sub",
    position: "bottom",
    offsetY: 0,
    style: {
      fontFamily: "Montserrat, system-ui, sans-serif",
      fontSize: 38,
      fontWeight: 800,
      color: "#facc15",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 4,
      lineHeight: 1.15,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      gradient: null,
      retro3DColor: null,
      stylePresetId: "yellow-sub",
    },
  },
  {
    id: "tiktok",
    name: "Bold Pop",
    position: "center",
    offsetY: 40,
    style: {
      fontFamily: "Anton, system-ui, sans-serif",
      fontSize: 52,
      fontWeight: 400,
      color: "#ffffff",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 5,
      lineHeight: 1.05,
      textTransform: "uppercase",
      fontStyle: "normal",
      ...cleanExtras,
      stylePresetId: "tiktok",
    },
  },
  {
    id: "glow",
    name: "Glow",
    position: "bottom",
    offsetY: 0,
    style: {
      fontFamily: "Space Grotesk, system-ui, sans-serif",
      fontSize: 36,
      fontWeight: 700,
      color: "#ffffff",
      align: "center",
      strokeWidth: 0,
      strokeColor: "#000000",
      lineHeight: 1.2,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "#ffffff",
      shadowBlur: 18,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      gradient: null,
      retro3DColor: null,
      stylePresetId: "glow",
    },
  },
  {
    id: "cyan-ice",
    name: "Cyan Ice",
    position: "bottom",
    offsetY: 0,
    style: {
      fontFamily: "Montserrat, system-ui, sans-serif",
      fontSize: 36,
      fontWeight: 800,
      color: "#67e8f9",
      align: "center",
      strokeColor: "#0e7490",
      strokeWidth: 3,
      lineHeight: 1.15,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "rgba(6,182,212,0.55)",
      shadowBlur: 10,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      gradient: null,
      retro3DColor: null,
      stylePresetId: "cyan-ice",
    },
  },
  {
    id: "karaoke",
    name: "Karaoke",
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
      gradient: null,
      retro3DColor: null,
      stylePresetId: "karaoke",
    },
  },
  {
    id: "minimal",
    name: "Minimal",
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
      gradient: null,
      retro3DColor: null,
      stylePresetId: "minimal",
    },
  },
  {
    id: "comic",
    name: "Comic",
    position: "bottom",
    offsetY: 0,
    style: {
      fontFamily: "Bangers, system-ui, sans-serif",
      fontSize: 44,
      fontWeight: 400,
      color: "#ffffff",
      align: "center",
      strokeColor: "#000000",
      strokeWidth: 4,
      lineHeight: 1.1,
      textTransform: "none",
      fontStyle: "normal",
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      gradient: null,
      retro3DColor: null,
      stylePresetId: "comic",
    },
  },
  {
    id: "cinematic",
    name: "Cinematic",
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
      gradient: null,
      retro3DColor: null,
      stylePresetId: "cinematic",
    },
  },
];

export function findCaptionStylePreset(
  id: string,
): CaptionStylePreset | undefined {
  return CAPTION_STYLE_PRESETS.find((p) => p.id === id);
}

export function applyCaptionStylePreset(
  current: CaptionProps,
  presetId: string,
): CaptionProps {
  const preset =
    findCaptionStylePreset(presetId) ?? findCaptionStylePreset("classic")!;
  const { fontSize: _presetSize, ...look } = preset.style;
  return {
    ...current,
    style: {
      ...current.style,
      ...look,
      // Keep current size — presets only change look, not layout.
      fontSize: current.style.fontSize,
      stylePresetId: preset.id,
    },
    // Keep placement; position/offsetY are edited in Options / on-canvas.
    position: current.position,
    offsetY: current.offsetY,
  };
}

export function resolveActiveCaptionPresetId(
  caption: CaptionProps,
): string | null {
  const id = caption.style.stylePresetId;
  if (!id || id === CAPTION_CUSTOM_PRESET_ID) return null;
  if (findCaptionStylePreset(id)) return id;
  return null;
}

export function markCaptionStyleCustom(style: CaptionProps["style"]): CaptionProps["style"] {
  if (style.stylePresetId === CAPTION_CUSTOM_PRESET_ID) return style;
  return { ...style, stylePresetId: CAPTION_CUSTOM_PRESET_ID };
}
