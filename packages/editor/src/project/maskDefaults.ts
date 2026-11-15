import { staticAnimatable } from "../engine/animatable";
import type { ClipMask, MaskTextProps, MaskType } from "./types";

let maskIdSeq = 0;

export function newMaskId(): string {
  maskIdSeq += 1;
  return `mask_${Date.now().toString(36)}_${maskIdSeq}`;
}

export function defaultMaskText(): MaskTextProps {
  return {
    content: "Text",
    fontFamily: "system-ui, sans-serif",
    fontSize: 120,
    letterSpacing: 0,
    lineHeight: 1.2,
    align: "center",
  };
}

/** Default size box ≈ 50% of min(layout W, H). */
export function defaultMaskSize(
  layoutW = 1920,
  layoutH = 1080,
): { w: number; h: number } {
  const s = Math.min(layoutW, layoutH) * 0.5;
  return { w: s, h: s };
}

export function defaultStripGap(layoutH = 1080): number {
  return layoutH * 0.3;
}

export function maskDisplayName(mask: ClipMask, index: number): string {
  if (mask.name) return mask.name;
  const n = index + 1;
  if (mask.type === "text") return `Mask${n} Text`;
  return `Mask${n}`;
}

export function createDefaultMask(
  type: MaskType = "circle",
  opts?: { layoutW?: number; layoutH?: number; index?: number },
): ClipMask {
  const layoutW = opts?.layoutW ?? 1920;
  const layoutH = opts?.layoutH ?? 1080;
  const index = opts?.index ?? 0;
  const size = defaultMaskSize(layoutW, layoutH);
  const base: ClipMask = {
    id: newMaskId(),
    type,
    invert: false,
    feather: staticAnimatable(0),
    position: {
      x: staticAnimatable(0),
      y: staticAnimatable(0),
    },
    rotationDeg: staticAnimatable(0),
  };

  switch (type) {
    case "split":
      return {
        ...base,
        name: maskDisplayName({ ...base, type }, index),
      };
    case "filmstrip":
      return {
        ...base,
        name: maskDisplayName({ ...base, type }, index),
        stripGap: staticAnimatable(defaultStripGap(layoutH)),
      };
    case "circle":
    case "rectangle":
    case "stars":
    case "heart":
      return {
        ...base,
        name: maskDisplayName({ ...base, type }, index),
        size: {
          w: staticAnimatable(size.w),
          h: staticAnimatable(size.h),
        },
        expand: staticAnimatable(0),
        cornerRadius:
          type === "rectangle" || type === "stars"
            ? staticAnimatable(0)
            : undefined,
      };
    case "text": {
      const text = defaultMaskText();
      // Glyph scale comes from Size; keep fontSize aligned with height.
      text.fontSize = size.h;
      return {
        ...base,
        name: maskDisplayName({ ...base, type: "text" }, index),
        size: {
          w: staticAnimatable(size.w),
          h: staticAnimatable(size.h),
        },
        expand: staticAnimatable(0),
        text,
      };
    }
    default:
      return {
        ...base,
        name: maskDisplayName({ ...base, type: "circle" }, index),
        type: "circle",
        size: {
          w: staticAnimatable(size.w),
          h: staticAnimatable(size.h),
        },
        expand: staticAnimatable(0),
      };
  }
}

/** Keep shared params when switching type; reset type-specific geometry. */
export function replaceMaskType(
  prev: ClipMask,
  type: MaskType,
  opts?: { layoutW?: number; layoutH?: number; index?: number },
): ClipMask {
  const fresh = createDefaultMask(type, opts);
  return {
    ...fresh,
    id: prev.id,
    invert: prev.invert,
    feather: prev.feather,
    position: {
      x: prev.position.x,
      y: prev.position.y,
    },
    rotationDeg: prev.rotationDeg,
    booleanBlend: prev.booleanBlend,
    expand:
      type === "split" || type === "filmstrip"
        ? undefined
        : (prev.expand ?? staticAnimatable(0)),
    name:
      type === "text"
        ? `Mask${(opts?.index ?? 0) + 1} Text`
        : `Mask${(opts?.index ?? 0) + 1}`,
  };
}
