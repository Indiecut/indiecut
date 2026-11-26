import {
  coerceAnimatableNumber,
  staticAnimatable,
} from "../engine/animatable";
import type {
  ClipMask,
  MaskBoolean,
  MaskTextProps,
  MaskType,
} from "./types";

const MASK_TYPES = new Set<MaskType>([
  "split",
  "filmstrip",
  "circle",
  "rectangle",
  "stars",
  "heart",
  "text",
]);

const MASK_BOOLEANS = new Set<MaskBoolean>(["add", "subtract", "intersect"]);

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce AI / disk-ish mask payloads into a valid ClipMask.
 * Accepts bare numbers for animatable leaves (common LLM mistake).
 */
export function normalizeClipMaskInput(
  raw: unknown,
  opts?: { layoutW?: number; layoutH?: number; index?: number },
): ClipMask | null {
  if (!isPlainObject(raw)) return null;
  const typeRaw = typeof raw.type === "string" ? raw.type : "circle";
  const type = MASK_TYPES.has(typeRaw as MaskType)
    ? (typeRaw as MaskType)
    : "circle";
  const base = createDefaultMask(type, opts);
  const id =
    typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : base.id;

  const pos = isPlainObject(raw.position) ? raw.position : null;
  const size = isPlainObject(raw.size) ? raw.size : null;

  const clamp01_100 = (n: number) => Math.min(100, Math.max(0, n));
  const clampExpand = (n: number) => Math.min(100, Math.max(-100, n));

  const featherRaw =
    raw.feather === undefined || raw.feather === null
      ? base.feather
      : typeof raw.feather === "number"
        ? clamp01_100(raw.feather)
        : raw.feather;

  const mask: ClipMask = {
    id,
    name: typeof raw.name === "string" ? raw.name : base.name,
    type,
    invert: typeof raw.invert === "boolean" ? raw.invert : base.invert,
    feather: coerceAnimatableNumber(featherRaw, 0),
    position: {
      x: coerceAnimatableNumber(pos?.x ?? base.position.x, 0),
      y: coerceAnimatableNumber(pos?.y ?? base.position.y, 0),
    },
    rotationDeg: coerceAnimatableNumber(
      raw.rotationDeg !== undefined ? raw.rotationDeg : base.rotationDeg,
      0,
    ),
    booleanBlend:
      typeof raw.booleanBlend === "string" &&
      MASK_BOOLEANS.has(raw.booleanBlend as MaskBoolean)
        ? (raw.booleanBlend as MaskBoolean)
        : base.booleanBlend,
  };

  if (type !== "split" && type !== "filmstrip") {
    const expandSrc =
      raw.expand === undefined || raw.expand === null
        ? (base.expand ?? 0)
        : typeof raw.expand === "number"
          ? clampExpand(raw.expand)
          : raw.expand;
    mask.expand = coerceAnimatableNumber(expandSrc, 0);
    mask.size = {
      w: coerceAnimatableNumber(
        size?.w ?? base.size?.w ?? 400,
        base.size?.w.staticValue ?? 400,
      ),
      h: coerceAnimatableNumber(
        size?.h ?? base.size?.h ?? 400,
        base.size?.h.staticValue ?? 400,
      ),
    };
  }

  if (type === "rectangle" || type === "stars") {
    const cr =
      raw.cornerRadius === undefined || raw.cornerRadius === null
        ? (base.cornerRadius ?? 0)
        : typeof raw.cornerRadius === "number"
          ? clamp01_100(raw.cornerRadius)
          : raw.cornerRadius;
    mask.cornerRadius = coerceAnimatableNumber(cr, 0);
  }

  if (type === "filmstrip") {
    mask.stripGap = coerceAnimatableNumber(
      raw.stripGap !== undefined ? raw.stripGap : base.stripGap,
      base.stripGap?.staticValue ?? 324,
    );
  }

  if (type === "text") {
    const textRaw = isPlainObject(raw.text) ? raw.text : null;
    const defaults = base.text ?? defaultMaskText();
    mask.text = {
      content:
        typeof textRaw?.content === "string" ? textRaw.content : defaults.content,
      fontFamily:
        typeof textRaw?.fontFamily === "string"
          ? textRaw.fontFamily
          : defaults.fontFamily,
      fontWeight:
        typeof textRaw?.fontWeight === "number" ||
        typeof textRaw?.fontWeight === "string"
          ? textRaw.fontWeight
          : defaults.fontWeight,
      italic:
        typeof textRaw?.italic === "boolean"
          ? textRaw.italic
          : defaults.italic,
      fontSize:
        typeof textRaw?.fontSize === "number" &&
        Number.isFinite(textRaw.fontSize)
          ? Math.max(1, textRaw.fontSize)
          : defaults.fontSize,
      letterSpacing:
        typeof textRaw?.letterSpacing === "number" &&
        Number.isFinite(textRaw.letterSpacing)
          ? textRaw.letterSpacing
          : defaults.letterSpacing,
      lineHeight:
        typeof textRaw?.lineHeight === "number" &&
        Number.isFinite(textRaw.lineHeight)
          ? textRaw.lineHeight
          : defaults.lineHeight,
      align:
        textRaw?.align === "left" ||
        textRaw?.align === "center" ||
        textRaw?.align === "right"
          ? textRaw.align
          : defaults.align,
    };
  }

  return mask;
}

/** Normalize an AI / external masks array; returns undefined when nothing valid. */
export function normalizeClipMasksInput(
  raw: unknown,
  opts?: { layoutW?: number; layoutH?: number },
): ClipMask[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ClipMask[] = [];
  for (let i = 0; i < raw.length; i++) {
    const m = normalizeClipMaskInput(raw[i], {
      layoutW: opts?.layoutW,
      layoutH: opts?.layoutH,
      index: i,
    });
    if (m) out.push(m);
  }
  return out.length > 0 ? out : undefined;
}
