import type {
  KineticBacking,
  KineticPaletteKey,
  KineticRenderOptions,
} from "./kinetic";
import type { StickerStyleParams } from "../project/types";

export const DEFAULT_STICKER_PALETTE: KineticPaletteKey = "vibrant";
export const DEFAULT_STICKER_BACKING: KineticBacking = "diecut";
export const DEFAULT_STICKER_STROKE = 1;

export function defaultStickerStyle(): StickerStyleParams {
  return {
    paletteKey: DEFAULT_STICKER_PALETTE,
    backingMode: DEFAULT_STICKER_BACKING,
    strokeScale: DEFAULT_STICKER_STROKE,
  };
}

export function stickerStyleFingerprint(
  style?: StickerStyleParams | null,
): string {
  if (!style) return "default";
  return [
    style.paletteKey ?? DEFAULT_STICKER_PALETTE,
    style.backingMode ?? DEFAULT_STICKER_BACKING,
    String(style.strokeScale ?? DEFAULT_STICKER_STROKE),
  ].join("\0");
}

export function stickerAssetId(
  stickerId: string,
  style?: StickerStyleParams | null,
  rasterSize?: number,
): string {
  const sizePart =
    typeof rasterSize === "number" && rasterSize > 0
      ? `@${Math.round(rasterSize)}`
      : "";
  return `sticker:${stickerId}:${stickerStyleFingerprint(style)}${sizePart}`;
}

export function toKineticRenderOptions(
  style?: StickerStyleParams | null,
): KineticRenderOptions {
  if (!style) return {};
  return {
    paletteKey: style.paletteKey,
    backingMode: style.backingMode,
    strokeScale: style.strokeScale,
  };
}
