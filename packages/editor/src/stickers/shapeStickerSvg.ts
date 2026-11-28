/**
 * Parametric / custom vector shape stickers (`stickerId === "shape"`).
 */

import {
  defaultShapeStyle,
  ensureMinPoints,
  pointsFingerprint,
  presetPoints,
  type VectorShapePreset,
} from "../geometry/vectorShape";
import type { StickerStyleParams, VectorShapePoint } from "../project/types";
import { SHAPE_STICKER_ID } from "../project/types";

export const SHAPE_STICKER_PRESETS: {
  id: Exclude<VectorShapePreset, "custom">;
  label: string;
}[] = [
  { id: "circle", label: "Circle" },
  { id: "rectangle", label: "Rect" },
  { id: "roundedRect", label: "Round" },
  { id: "triangle", label: "Triangle" },
  { id: "diamond", label: "Diamond" },
  { id: "hexagon", label: "Hex" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "arrow", label: "Arrow" },
];

export function isShapeStickerId(stickerId: string | undefined | null): boolean {
  return stickerId === SHAPE_STICKER_ID;
}

export function resolveShapeStickerPoints(
  style?: StickerStyleParams | null,
): VectorShapePoint[] {
  const preset = style?.shapePreset ?? "star";
  if (preset === "custom" && style?.points && style.points.length >= 3) {
    return ensureMinPoints(style.points);
  }
  if (preset !== "custom") {
    return presetPoints(preset);
  }
  return presetPoints("star");
}

export function resolveShapeStickerStyle(style?: StickerStyleParams | null) {
  const defaults = defaultShapeStyle();
  return {
    fill: style?.fill ?? defaults.fill,
    stroke: style?.stroke ?? defaults.stroke,
    strokeWidth: style?.strokeWidth ?? defaults.strokeWidth,
    opacity:
      typeof style?.opacity === "number" && Number.isFinite(style.opacity)
        ? Math.min(1, Math.max(0, style.opacity))
        : (defaults.opacity ?? 1),
  };
}

export function defaultShapeStickerStyle(
  preset: Exclude<VectorShapePreset, "custom"> = "star",
): StickerStyleParams {
  const colors = defaultShapeStyle();
  return {
    shapePreset: preset,
    points: presetPoints(preset),
    fill: colors.fill,
    stroke: colors.stroke,
    strokeWidth: colors.strokeWidth,
    opacity: colors.opacity,
  };
}

export function shapeStickerFingerprint(
  style?: StickerStyleParams | null,
): string {
  const colors = resolveShapeStickerStyle(style);
  const pts = resolveShapeStickerPoints(style);
  return [
    style?.shapePreset ?? "star",
    pointsFingerprint(pts),
    colors.fill,
    colors.stroke,
    String(colors.strokeWidth),
    String(colors.opacity),
  ].join("\0");
}

/** Emit an SVG string for a shape sticker (viewBox 0..size). */
export function generateShapeStickerSvg(
  style?: StickerStyleParams | null,
  size = 512,
): string {
  const pts = resolveShapeStickerPoints(style);
  const colors = resolveShapeStickerStyle(style);
  const cx = size / 2;
  const cy = size / 2;
  const scale = size * 0.82;
  const pathPts = pts
    .map((p, i) => {
      const x = cx + p.x * scale;
      const y = cy + p.y * scale;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const d = `${pathPts} Z`;
  const sw = Math.max(0, colors.strokeWidth);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <path d="${d}" fill="${escapeXml(colors.fill)}" stroke="${escapeXml(colors.stroke)}" stroke-width="${sw}" stroke-linejoin="round" opacity="${colors.opacity}"/>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
