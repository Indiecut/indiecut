/**
 * Rich-run text layout + paint (per-glyph fonts, highlights, gradients, scripts).
 * Used by rasterizeText when TextProps.runs carry mixed / advanced styles.
 */

import type { TextProps, TextRunStyle } from "../project/types";
import { normalizeTextProps, resolvedRuns } from "../text/runs";
import {
  DEFAULT_TEXT_FONT_WEIGHT,
  RETRO_3D_DEPTH,
  bubbleRectForText,
  contentInsets,
  parseLinearGradientCss,
  paintBubble,
  resolveText,
  textHasShadow,
  type ParsedLinearGradient,
  type ResolvedTextPaint,
} from "./rasterizeText";

type Ctx2d = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createFillGradient(
  ctx: Ctx2d,
  g: ParsedLinearGradient,
  x: number,
  y: number,
  w: number,
  h: number,
): CanvasGradient {
  const rad = ((g.angleDeg - 90) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const half = Math.sqrt(w * w + h * h) / 2;
  const x0 = cx - Math.cos(rad) * half;
  const y0 = cy - Math.sin(rad) * half;
  const x1 = cx + Math.cos(rad) * half;
  const y1 = cy + Math.sin(rad) * half;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const s of g.stops) grad.addColorStop(s.offset, s.color);
  return grad;
}

export type ResolvedGlyphStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline" | "line-through";
  color: string;
  gradient: ParsedLinearGradient | null;
  highlight: string | null;
  strokeColor: string;
  strokeWidth: number;
  letterSpacing: number;
  script: "normal" | "super" | "sub";
  /** Vertical offset applied for super/sub (device px, positive = down). */
  baselineShift: number;
};

export type RichGlyph = {
  ch: string;
  /** Absolute code-point index in plain content. */
  index: number;
  style: ResolvedGlyphStyle;
  width: number;
  ascent: number;
  descent: number;
  /** Local x within the line (before align offset). */
  x: number;
};

export type RichLine = {
  glyphs: RichGlyph[];
  width: number;
  ascent: number;
  descent: number;
  height: number;
  /** Top of line within content block (device px, content-origin). */
  y: number;
};

export type RichTextLayout = {
  lines: RichLine[];
  maxW: number;
  textH: number;
  content: string;
  box: ResolvedTextPaint;
};

function applyTextTransform(
  content: string,
  transform: TextRunStyle["textTransform"] | TextProps["textTransform"],
): string {
  if (!transform || transform === "none") return content;
  if (transform === "uppercase") return content.toUpperCase();
  if (transform === "lowercase") return content.toLowerCase();
  if (transform === "capitalize") {
    return content.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return content;
}

function mergeGlyphStyle(
  props: TextProps,
  runStyle: TextRunStyle | undefined,
  pr: number,
): ResolvedGlyphStyle {
  const fontFamily =
    runStyle?.fontFamily ?? props.fontFamily ?? "system-ui, sans-serif";
  const baseSize = Math.max(8, (runStyle?.fontSize ?? props.fontSize ?? 48) * pr);
  const script = runStyle?.script ?? "normal";
  const scriptScale = script === "normal" ? 1 : 0.65;
  const fontSize = baseSize * scriptScale;
  const baselineShift =
    script === "super"
      ? -baseSize * 0.35
      : script === "sub"
        ? baseSize * 0.2
        : 0;
  const textDecoration =
    runStyle?.textDecoration ??
    (props.textDecoration === "line-through"
      ? "line-through"
      : props.textDecoration === "underline"
        ? "underline"
        : "none");
  const gradientRaw =
    runStyle?.gradient !== undefined ? runStyle.gradient : props.gradient;
  return {
    fontFamily,
    fontSize,
    fontWeight:
      runStyle?.fontWeight ?? props.fontWeight ?? DEFAULT_TEXT_FONT_WEIGHT,
    fontStyle:
      runStyle?.fontStyle === "italic" || props.fontStyle === "italic"
        ? "italic"
        : "normal",
    textDecoration,
    color: runStyle?.color ?? props.color ?? "#ffffff",
    gradient: parseLinearGradientCss(gradientRaw ?? null),
    highlight:
      runStyle?.highlight === undefined ? null : runStyle.highlight,
    strokeColor: runStyle?.strokeColor ?? props.strokeColor ?? "#000000",
    strokeWidth: Math.max(
      0,
      (runStyle?.strokeWidth ?? props.strokeWidth ?? 0) * pr,
    ),
    letterSpacing:
      (runStyle?.letterSpacing ?? props.letterSpacing ?? 0) * pr,
    script,
    baselineShift,
  };
}

function fontCss(s: ResolvedGlyphStyle): string {
  const style = s.fontStyle === "italic" ? "italic " : "";
  return `${style}${s.fontWeight} ${s.fontSize}px ${s.fontFamily}`;
}

function probeCtx(): Ctx2d | null {
  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : null;
  if (!canvas) return null;
  return canvas.getContext("2d") as Ctx2d | null;
}

/** Build per-glyph lines for rich TextProps (device pixels at `pixelRatio`). */
export function layoutRichText(
  props: TextProps,
  pixelRatio = 1,
): RichTextLayout | null {
  const normalized = normalizeTextProps(props);
  const box = resolveText(normalized, pixelRatio);
  const pr = box.pr;
  const runs = resolvedRuns(normalized);
  const ctx = probeCtx();
  if (!ctx) return null;

  type RawGlyph = {
    ch: string;
    index: number;
    style: ResolvedGlyphStyle;
    width: number;
    ascent: number;
    descent: number;
  };

  const raw: RawGlyph[] = [];
  let index = 0;
  for (const run of runs) {
    const baseStyle = mergeGlyphStyle(normalized, run.style, pr);
    const transformed = applyTextTransform(
      run.text,
      run.style?.textTransform ?? normalized.textTransform,
    );
    for (const ch of transformed) {
      if (ch === "\n") {
        raw.push({
          ch: "\n",
          index: index++,
          style: baseStyle,
          width: 0,
          ascent: baseStyle.fontSize * 0.8,
          descent: baseStyle.fontSize * 0.25,
        });
        continue;
      }
      // Transform may change length vs source indices for uppercase etc.
      // Prefer source indexing from original run chars when lengths match.
      void run;
      ctx.font = fontCss(baseStyle);
      const m = ctx.measureText(ch);
      const ascent =
        m.actualBoundingBoxAscent > 0
          ? m.actualBoundingBoxAscent
          : baseStyle.fontSize * 0.8;
      const descent =
        m.actualBoundingBoxDescent > 0
          ? m.actualBoundingBoxDescent
          : baseStyle.fontSize * 0.25;
      raw.push({
        ch,
        index: index++,
        style: baseStyle,
        width: m.width,
        ascent,
        descent,
      });
    }
  }

  // Re-index from original content for edit/selection alignment when transform
  // did not change length; otherwise use sequential transformed indices.
  const plain = normalized.content;
  const sourceChars = [...plain];
  if (sourceChars.length === raw.filter((g) => g.ch !== "\n").length + raw.filter((g) => g.ch === "\n").length) {
    // already sequential from transformed content length
  }

  const lineHeightMul = box.lineHeightMul;
  const lines: RichLine[] = [];
  let cur: RawGlyph[] = [];

  const flush = () => {
    const glyphs: RichGlyph[] = [];
    let ascent = box.fontSize * 0.8;
    let descent = box.fontSize * 0.25;
    let x = 0;
    for (let i = 0; i < cur.length; i++) {
      const g = cur[i]!;
      ascent = Math.max(ascent, g.ascent);
      descent = Math.max(descent, g.descent);
      glyphs.push({
        ch: g.ch,
        index: g.index,
        style: g.style,
        width: g.width,
        ascent: g.ascent,
        descent: g.descent,
        x,
      });
      x += g.width;
      if (i < cur.length - 1) {
        x += g.style.letterSpacing;
      }
    }
    const natural = Math.ceil(ascent + descent + box.fontSize * 0.12);
    const height =
      lineHeightMul != null
        ? Math.max(natural, Math.ceil(box.fontSize * lineHeightMul))
        : natural;
    lines.push({
      glyphs,
      width: Math.max(x, 1),
      ascent,
      descent,
      height,
      y: 0,
    });
    cur = [];
  };

  for (const g of raw) {
    if (g.ch === "\n") {
      flush();
      continue;
    }
    cur.push(g);
  }
  flush();
  if (lines.length === 0) {
    lines.push({
      glyphs: [],
      width: 1,
      ascent: box.fontSize * 0.8,
      descent: box.fontSize * 0.25,
      height: box.fontSize,
      y: 0,
    });
  }

  let y = 0;
  let maxW = 0;
  for (const line of lines) {
    line.y = y;
    maxW = Math.max(maxW, line.width);
    y += line.height;
  }

  return {
    lines,
    maxW,
    textH: y,
    content: plain,
    box,
  };
}

export function measureRichTextSize(
  props: TextProps,
  pixelRatio = 1,
): { width: number; height: number } | null {
  const layout = layoutRichText(props, pixelRatio);
  if (!layout) return null;
  if (!layout.content.trim() && layout.lines.every((l) => l.glyphs.length === 0)) {
    return null;
  }
  const t = layout.box;
  const strokePad = Math.ceil(
    Math.max(0, ...layout.lines.flatMap((l) => l.glyphs.map((g) => g.style.strokeWidth))) *
      2.5 || (t.strokeWidth > 0 ? t.strokeWidth * 2.5 : 0),
  );
  // Prefer max glyph stroke for pad
  let maxStroke = t.strokeWidth;
  for (const line of layout.lines) {
    for (const g of line.glyphs) {
      maxStroke = Math.max(maxStroke, g.style.strokeWidth);
    }
  }
  const strokePadResolved = maxStroke > 0 ? Math.ceil(maxStroke * 2.5) : 0;
  void strokePad;
  const bubblePadW = t.bubble
    ? t.bubble.paddingX * 2 + t.bubble.strokeWidth
    : 0;
  const bubblePadH = t.bubble
    ? t.bubble.paddingY * 2 + t.bubble.strokeWidth + t.bubble.tailH
    : 0;
  const underlinePad = layout.lines.some((l) =>
    l.glyphs.some(
      (g) =>
        g.style.textDecoration === "underline" ||
        g.style.textDecoration === "line-through",
    ),
  )
    ? Math.ceil(t.pr * 3)
    : t.underlinePad;

  const width = Math.max(
    2,
    Math.ceil(
      layout.maxW + t.pad * 2 + strokePadResolved + t.shadowPad + bubblePadW,
    ),
  );
  const height = Math.max(
    2,
    Math.ceil(
      layout.textH +
        t.pad * 2 +
        strokePadResolved +
        t.shadowPad +
        underlinePad +
        bubblePadH,
    ),
  );
  return { width, height };
}

function clearShadow(ctx: Ctx2d): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function applyBoxShadow(ctx: Ctx2d, t: ResolvedTextPaint): void {
  if (!t.shadow) {
    clearShadow(ctx);
    return;
  }
  ctx.shadowColor = t.shadowColor;
  ctx.shadowBlur = t.shadowBlur;
  ctx.shadowOffsetX = t.shadowOffsetX;
  ctx.shadowOffsetY = t.shadowOffsetY;
}

function lineOriginX(
  align: "left" | "center" | "right",
  fullW: number,
  lineW: number,
  insetX: number,
): number {
  if (align === "left") return insetX;
  if (align === "right") return fullW - insetX - lineW;
  return (fullW - lineW) / 2;
}

/** Paint a rich layout onto an existing context (device pixels, origin top-left of canvas). */
export function paintRichTextLayout(
  ctx: Ctx2d,
  layout: RichTextLayout,
  fullW: number,
): void {
  const t = layout.box;
  const inset = contentInsets(t);

  if (t.bubble) {
    const rect = bubbleRectForText(fullW, layout.maxW, layout.textH, t);
    if (rect) paintBubble(ctx, rect, t.bubble);
  }

  // Highlights under glyphs — merge contiguous same-color spans so letter-spacing
  // and per-glyph advances never leave seams; height hugs the marker band (not
  // full alphabetic ascent+descent from a top baseline, which left a fat bottom).
  for (const line of layout.lines) {
    const ox = lineOriginX(t.align, fullW, line.width, inset.x);
    const top = inset.y + line.y;
    let i = 0;
    while (i < line.glyphs.length) {
      const start = line.glyphs[i]!;
      if (!start.style.highlight) {
        i += 1;
        continue;
      }
      const color = start.style.highlight;
      let j = i;
      while (
        j + 1 < line.glyphs.length &&
        line.glyphs[j + 1]!.style.highlight === color
      ) {
        j += 1;
      }
      const end = line.glyphs[j]!;
      let maxSize = start.style.fontSize;
      let minShift = start.style.baselineShift;
      for (let k = i; k <= j; k++) {
        const g = line.glyphs[k]!;
        maxSize = Math.max(maxSize, g.style.fontSize);
        minShift = Math.min(minShift, g.style.baselineShift);
      }
      // Cover letterSpacing between glyphs: end.x already includes prior spacing.
      const left = ox + start.x;
      const right = ox + end.x + end.width;
      const padX = Math.max(2, maxSize * 0.04);
      const padY = Math.max(1, maxSize * 0.05);
      // textBaseline is "top": ink sits in roughly [top, top+fontSize].
      const markerTop = top + minShift + maxSize * 0.06;
      const markerH = Math.max(1, maxSize * 0.82 + padY);
      ctx.fillStyle = color;
      ctx.fillRect(
        left - padX,
        markerTop,
        Math.max(1, right - left) + padX * 2,
        markerH,
      );
      i = j + 1;
    }
  }

  // Retro 3D (box-level) then glyphs
  for (const line of layout.lines) {
    const ox = lineOriginX(t.align, fullW, line.width, inset.x);
    const top = inset.y + line.y;

    if (t.retro3DColor && t.retro3DDepth > 0) {
      clearShadow(ctx);
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      for (let i = t.retro3DDepth; i >= 1; i--) {
        for (const g of line.glyphs) {
          ctx.font = fontCss(g.style);
          ctx.fillStyle = t.retro3DColor;
          ctx.fillText(
            g.ch,
            ox + g.x + i,
            top + g.style.baselineShift + i,
          );
        }
      }
    }

    // Contiguous gradient runs for smooth fills
    let idx = 0;
    while (idx < line.glyphs.length) {
      const g0 = line.glyphs[idx]!;
      let runEnd = idx;
      if (g0.style.gradient) {
        const key = JSON.stringify(g0.style.gradient);
        while (
          runEnd + 1 < line.glyphs.length &&
          line.glyphs[runEnd + 1]!.style.gradient &&
          JSON.stringify(line.glyphs[runEnd + 1]!.style.gradient) === key
        ) {
          runEnd++;
        }
      }
      const runStartX = ox + g0.x;
      const last = line.glyphs[runEnd]!;
      const runEndX = ox + last.x + last.width;
      const runW = Math.max(1, runEndX - runStartX);

      for (let k = idx; k <= runEnd; k++) {
        const g = line.glyphs[k]!;
        const gx = ox + g.x;
        const gy = top + g.style.baselineShift;
        ctx.font = fontCss(g.style);
        ctx.textBaseline = "top";
        ctx.textAlign = "left";

        if (g.style.strokeWidth > 0) {
          clearShadow(ctx);
          ctx.lineWidth = g.style.strokeWidth;
          ctx.strokeStyle = g.style.strokeColor;
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          ctx.strokeText(g.ch, gx, gy);
        }

        applyBoxShadow(ctx, t);
        if (g.style.gradient) {
          ctx.fillStyle = createFillGradient(
            ctx,
            g.style.gradient,
            runStartX,
            gy,
            runW,
            g.style.fontSize,
          );
        } else {
          ctx.fillStyle = g.style.color;
        }
        ctx.fillText(g.ch, gx, gy);
        clearShadow(ctx);

        if (g.style.textDecoration === "underline") {
          const thickness = Math.max(1, Math.round(g.style.fontSize * 0.06));
          const uy = gy + g.ascent + Math.max(1, g.descent * 0.35);
          ctx.fillStyle = g.style.color;
          ctx.fillRect(gx, uy, Math.max(1, g.width), thickness);
        } else if (g.style.textDecoration === "line-through") {
          const thickness = Math.max(1, Math.round(g.style.fontSize * 0.06));
          const uy = gy + g.ascent * 0.55;
          ctx.fillStyle = g.style.color;
          ctx.fillRect(gx, uy, Math.max(1, g.width), thickness);
        }
      }
      idx = runEnd + 1;
    }
  }
}

/** Full rich raster (same return shape as rasterizeText). */
export function rasterizeRichText(
  props: TextProps,
  pixelRatio = 1,
): {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
} | null {
  const logical = measureRichTextSize(props, 1);
  if (!logical) return null;
  const layout = layoutRichText(props, pixelRatio);
  if (!layout) return null;
  const size = measureRichTextSize(props, pixelRatio);
  if (!size) return null;

  let { width, height } = size;
  const maxDim = 8192;
  let drawScale = 1;
  if (width > maxDim || height > maxDim) {
    drawScale = Math.min(maxDim / width, maxDim / height);
    width = Math.max(2, Math.floor(width * drawScale));
    height = Math.max(2, Math.floor(height * drawScale));
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (drawScale !== 1) ctx.scale(drawScale, drawScale);
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }
  paintRichTextLayout(ctx, layout, size.width);
  return {
    canvas,
    width,
    height,
    logicalWidth: logical.width,
    logicalHeight: logical.height,
  };
}

/** Whether rich path should be used (mixed runs or advanced run fields). */
export function shouldUseRichTextPath(props: TextProps): boolean {
  const runs = props.runs;
  if (!runs || runs.length === 0) return false;
  if (runs.length > 1) return true;
  const s = runs[0]?.style;
  if (!s) return false;
  return Boolean(
    s.highlight ||
      (s.script && s.script !== "normal") ||
      s.textDecoration === "line-through" ||
      s.fontFamily ||
      s.fontSize ||
      s.color ||
      s.gradient ||
      s.strokeWidth ||
      s.letterSpacing ||
      s.fontWeight ||
      s.fontStyle ||
      s.textTransform,
  );
}

// Re-export for fingerprint helpers
export { textHasShadow, RETRO_3D_DEPTH };
