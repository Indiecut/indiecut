import type { BlendMode } from "../project/types";

/** Blend mode list order (Video Basic Blend). */
export const VIDEO_BLEND_MODES: BlendMode[] = [
  "normal",
  "brighten",
  "screen",
  "darken",
  "overlay",
  "hardLight",
  "softLight",
  "colorBurn",
  "linearBurn",
  "colorDodge",
  "multiply",
];

export const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  normal: "Default",
  brighten: "Brighten",
  screen: "Screen",
  darken: "Darken",
  overlay: "Overlay",
  hardLight: "Hard light",
  softLight: "Soft light",
  colorBurn: "Color burn",
  linearBurn: "Linear burn",
  colorDodge: "Color dodge",
  multiply: "Multiply",
};

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Per-channel blend (A = source/top, B = base/dest), values in 0..1.
 * EDITOR_MATH.md §2 for Brighten/Darken/Hard light/Linear burn.
 */
export function blendChannel(mode: BlendMode, a: number, b: number): number {
  const A = clamp01(a);
  const B = clamp01(b);
  switch (mode) {
    case "multiply":
      return A * B;
    case "screen":
      return 1 - (1 - A) * (1 - B);
    case "overlay":
      return B < 0.5 ? 2 * A * B : 1 - 2 * (1 - A) * (1 - B);
    case "softLight": {
      // Photoshop-compatible soft light
      if (A <= 0.5) {
        return B - (1 - 2 * A) * B * (1 - B);
      }
      const d =
        B <= 0.25
          ? ((16 * B - 12) * B + 4) * B
          : Math.sqrt(B);
      return B + (2 * A - 1) * (d - B);
    }
    case "hardLight":
      return A < 0.5 ? 2 * A * B : 1 - 2 * (1 - A) * (1 - B);
    case "colorBurn":
      if (A <= 0) return 0;
      return clamp01(1 - (1 - B) / A);
    case "colorDodge":
      if (A >= 1) return 1;
      return clamp01(B / (1 - A));
    case "linearBurn":
      return clamp01(A + B - 1);
    case "darken":
      return Math.min(A, B);
    case "brighten":
      return Math.max(A, B);
    case "normal":
    default:
      return A;
  }
}

/** Modes that lack a matching canvas globalCompositeOperation. */
export function needsPixelBlend(mode?: BlendMode | null): boolean {
  return resolveBlendMode(mode) === "linearBurn";
}

/**
 * Map IndieCut BlendMode → canvas 2D globalCompositeOperation.
 * Linear burn has no GCO — callers must use blendChannel / ImageData.
 */
export function blendModeToCompositeOperation(
  mode?: BlendMode | null,
): GlobalCompositeOperation {
  switch (mode) {
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "softLight":
      return "soft-light";
    case "hardLight":
      return "hard-light";
    case "colorBurn":
      return "color-burn";
    case "colorDodge":
      return "color-dodge";
    case "darken":
      return "darken";
    case "brighten":
      return "lighten";
    case "linearBurn":
      // No native GCO — caller should not use this path.
      return "source-over";
    case "normal":
    default:
      return "source-over";
  }
}

export function resolveBlendMode(mode?: BlendMode | null): BlendMode {
  return mode ?? "normal";
}

export function resolveOpacity(opacity?: number | null): number {
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) return 1;
  return clamp01(opacity);
}
