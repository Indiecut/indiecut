/**
 * Measure and layout text animation units (line / word / character).
 * Uses the same font metrics as rasterizeText so preview aligns.
 */

import {
  resolveGranularity,
  splitTextUnits,
  type TextAnimUnitState,
} from "../engine/textAnimation";
import type {
  TextAnimationGranularity,
  TextAnimationParams,
  TextProps,
} from "../project/types";
import {
  normalizeTextProps,
  sliceRuns,
} from "../text/runs";
import {
  layoutRichText,
  shouldUseRichTextPath,
} from "./richTextLayout";
import {
  bubbleRectForText,
  contentInsets,
  lineAdvanceHeight,
  measureLineWidth,
  measureTextSize,
  paintBubble,
  paintRetro3D,
  paintTextLine,
  paintUnderline,
  resolveText,
  textFontCss,
} from "./rasterizeText";

const PAD = 4;

export type LaidOutTextUnit = {
  index: number;
  text: string;
  /** Top-left of unit within the text block (logical px). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional code-point range into plain content (rich runs). */
  startIndex?: number;
  endIndex?: number;
};

export type TextUnitLayout = {
  blockWidth: number;
  blockHeight: number;
  units: LaidOutTextUnit[];
  granularity: TextAnimationGranularity;
};

/**
 * Effective granularity for layout. Typewriter IN forces character units
 * so reveal can stagger per glyph.
 */
export function effectiveGranularity(
  anim?: TextAnimationParams | null,
): TextAnimationGranularity {
  const base = resolveGranularity(anim);
  if (anim?.in?.presetId === "typewriter") return "character";
  return base;
}

/** Extra logical pad around animated text (preview + export + selection). */
export const ANIMATED_TEXT_OVERFLOW_PAD = 80;

export function layoutTextUnits(
  props: TextProps,
  anim?: TextAnimationParams | null,
): TextUnitLayout | null {
  const normalized = normalizeTextProps(props);
  const block = measureTextSize(normalized);
  if (!block) return null;

  const granularity = effectiveGranularity(anim);

  if (shouldUseRichTextPath(normalized) && granularity !== "whole") {
    const rich = layoutRichText(normalized, 1);
    if (!rich) return null;
    const units: LaidOutTextUnit[] = [];
    let index = 0;
    const inset = contentInsets(rich.box);

    if (granularity === "line") {
      for (const line of rich.lines) {
        const text = line.glyphs.map((g) => g.ch).join("");
        const startIndex = line.glyphs[0]?.index ?? 0;
        const endIndex =
          line.glyphs.length > 0
            ? line.glyphs[line.glyphs.length - 1]!.index + 1
            : startIndex;
        const ox =
          rich.box.align === "left"
            ? inset.x
            : rich.box.align === "right"
              ? block.width - inset.x - line.width
              : (block.width - line.width) / 2;
        units.push({
          index: index++,
          text,
          x: ox,
          y: inset.y + line.y,
          width: Math.max(line.width, 1) + rich.box.pad * 2,
          height: line.height + rich.box.pad,
          startIndex,
          endIndex,
        });
      }
    } else if (granularity === "word") {
      for (const line of rich.lines) {
        const ox =
          rich.box.align === "left"
            ? inset.x
            : rich.box.align === "right"
              ? block.width - inset.x - line.width
              : (block.width - line.width) / 2;
        let i = 0;
        while (i < line.glyphs.length) {
          const g0 = line.glyphs[i]!;
          if (/\s/.test(g0.ch)) {
            i += 1;
            continue;
          }
          let j = i;
          while (j < line.glyphs.length && !/\s/.test(line.glyphs[j]!.ch)) {
            j += 1;
          }
          const slice = line.glyphs.slice(i, j);
          const text = slice.map((g) => g.ch).join("");
          const x0 = slice[0]!.x;
          const x1 = slice[slice.length - 1]!.x + slice[slice.length - 1]!.width;
          units.push({
            index: index++,
            text,
            x: ox + x0,
            y: inset.y + line.y,
            width: Math.max(x1 - x0, 1) + rich.box.pad * 2,
            height: line.height + rich.box.pad * 2,
            startIndex: slice[0]!.index,
            endIndex: slice[slice.length - 1]!.index + 1,
          });
          i = j;
        }
      }
    } else {
      for (const line of rich.lines) {
        const ox =
          rich.box.align === "left"
            ? inset.x
            : rich.box.align === "right"
              ? block.width - inset.x - line.width
              : (block.width - line.width) / 2;
        for (const g of line.glyphs) {
          units.push({
            index: index++,
            text: g.ch,
            x: ox + g.x,
            y: inset.y + line.y,
            width: Math.max(g.width, 1) + rich.box.pad * 2,
            height: line.height + rich.box.pad * 2,
            startIndex: g.index,
            endIndex: g.index + 1,
          });
        }
      }
    }

    return {
      blockWidth: block.width,
      blockHeight: block.height,
      granularity,
      units,
    };
  }

  const t = resolveText(normalized, 1);
  // Same as measureTextSize: document canvas on main so FontFaces apply.
  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : null;
  if (!canvas) return null;
  const ctx = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) return null;

  ctx.font = textFontCss(t);
  const lines = t.content.split("\n");
  let ascent = t.fontSize * 0.8;
  let descent = t.fontSize * 0.25;
  for (const line of lines) {
    const metrics0 = ctx.measureText(line || "M");
    if (metrics0.actualBoundingBoxAscent > 0) {
      ascent = Math.max(ascent, metrics0.actualBoundingBoxAscent);
    }
    if (metrics0.actualBoundingBoxDescent > 0) {
      descent = Math.max(descent, metrics0.actualBoundingBoxDescent);
    }
  }
  const lineHeight = lineAdvanceHeight(t, ascent, descent);
  const strokePad = t.strokeWidth * 2;
  const inset = contentInsets(t);
  const originY = inset.y;

  if (granularity === "whole") {
    return {
      blockWidth: block.width,
      blockHeight: block.height,
      granularity,
      units: [
        {
          index: 0,
          text: t.content,
          x: 0,
          y: 0,
          width: block.width,
          height: block.height,
        },
      ],
    };
  }

  const units: LaidOutTextUnit[] = [];
  let index = 0;

  if (granularity === "line") {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      const w = Math.max(measureLineWidth(ctx, line, t.letterSpacing), 1);
      const x = lineX(t.align, block.width, w, inset.x);
      units.push({
        index: index++,
        text: line,
        x,
        y: originY + li * lineHeight,
        width: w + t.pad * 2 + strokePad,
        height: lineHeight + t.pad,
      });
    }
  } else if (granularity === "word") {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      const parts = line.split(/(\s+)/);
      let cursor = 0;
      const lineW = measureLineWidth(ctx, line, t.letterSpacing);
      const lineOriginX = lineX(t.align, block.width, lineW, inset.x);
      for (const part of parts) {
        if (part.length === 0) continue;
        if (part === "\n") continue;
        const mw = measureLineWidth(ctx, part, t.letterSpacing);
        if (/^\s+$/.test(part)) {
          cursor += mw;
          continue;
        }
        units.push({
          index: index++,
          text: part,
          x: lineOriginX + cursor,
          y: originY + li * lineHeight,
          // Match rasterizeTextUnit logical box so word pads don't spill.
          width: Math.max(mw, 1) + strokePad + t.pad * 2,
          height: lineHeight + t.pad * 2,
        });
        cursor += mw;
      }
    }
  } else {
    // character — include letterSpacing between glyphs
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      const lineW = measureLineWidth(ctx, line, t.letterSpacing);
      const lineOriginX = lineX(t.align, block.width, lineW, inset.x);
      let cursor = 0;
      const chars = Array.from(line);
      for (let ci = 0; ci < chars.length; ci++) {
        const ch = chars[ci]!;
        const mw = ctx.measureText(ch).width;
        units.push({
          index: index++,
          text: ch,
          x: lineOriginX + cursor,
          y: originY + li * lineHeight,
          width: Math.max(mw, 1) + strokePad + t.pad * 2,
          height: lineHeight + t.pad * 2,
        });
        cursor += mw + (ci < chars.length - 1 ? t.letterSpacing : 0);
      }
    }
  }

  if (units.length === 0) {
    const fallback = splitTextUnits(t.content, granularity);
    return {
      blockWidth: block.width,
      blockHeight: block.height,
      granularity,
      units: fallback.map((text, i) => ({
        index: i,
        text,
        x: 0,
        y: 0,
        width: block.width,
        height: block.height,
      })),
    };
  }

  return {
    blockWidth: block.width,
    blockHeight: block.height,
    granularity,
    units,
  };
}

function lineX(
  align: "left" | "center" | "right",
  blockW: number,
  lineW: number,
  insetX: number,
): number {
  if (align === "left") return insetX;
  if (align === "right") return blockW - insetX - lineW;
  return (blockW - lineW) / 2;
}

/** Rasterize a single unit string with the same style as full text. */
export function rasterizeTextUnit(
  props: TextProps,
  unitText: string,
  pixelRatio: number,
  range?: { startIndex: number; endIndex: number },
): {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
} | null {
  const normalized = normalizeTextProps(props);
  let unitProps: TextProps = {
    ...normalized,
    content: unitText === "\n" ? " " : unitText || " ",
    align: "left",
  };
  if (
    range &&
    shouldUseRichTextPath(normalized) &&
    normalized.runs &&
    range.endIndex > range.startIndex
  ) {
    const runs = sliceRuns(normalized.runs, range.startIndex, range.endIndex);
    unitProps = normalizeTextProps({
      ...normalized,
      runs,
      content: unitText === "\n" ? " " : unitText || " ",
      align: "left",
    });
  }
  const t = resolveText(unitProps, pixelRatio);
  const pr = t.pr;
  const fontSize = t.fontSize;
  const strokeWidth = t.strokeWidth;
  const pad = t.pad;
  const shadowPad = t.shadowPad;

  const probe =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1)
      : document.createElement("canvas");
  const pctx = probe.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!pctx) return null;
  pctx.font = textFontCss(t);
  const mW = measureLineWidth(pctx, unitProps.content, t.letterSpacing);
  const m = pctx.measureText(unitProps.content);
  const ascent =
    m.actualBoundingBoxAscent > 0
      ? m.actualBoundingBoxAscent
      : fontSize * 0.8;
  const descent =
    m.actualBoundingBoxDescent > 0
      ? m.actualBoundingBoxDescent
      : fontSize * 0.25;
  const strokePad = strokeWidth * 2;
  const logicalWidth = Math.max(
    2,
    Math.ceil(
      mW / pr +
        PAD * 2 +
        (props.strokeWidth ?? 0) * 2 +
        shadowPad / pr +
        t.underlinePad / pr,
    ),
  );
  const logicalHeight = Math.max(
    2,
    Math.ceil(
      (ascent + descent) / pr +
        PAD * 2 +
        (props.strokeWidth ?? 0) * 2 +
        shadowPad / pr +
        t.underlinePad / pr,
    ),
  );

  let width = Math.max(
    2,
    Math.ceil(mW + pad * 2 + strokePad + shadowPad + t.underlinePad),
  );
  let height = Math.max(
    2,
    Math.ceil(ascent + descent + pad * 2 + strokePad + shadowPad + t.underlinePad),
  );

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

  ctx.font = textFontCss(t);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }

  const x = pad + strokePad / 2;
  const y = pad + strokePad / 2;

  const unitPaint = { ...t, align: "left" as const };
  paintRetro3D(ctx, unitProps.content, x, y, unitPaint, "left");
  if (t.shadow) {
    ctx.shadowColor = t.shadowColor;
    ctx.shadowBlur = t.shadowBlur;
    ctx.shadowOffsetX = t.shadowOffsetX;
    ctx.shadowOffsetY = t.shadowOffsetY;
  }
  paintTextLine(ctx, unitProps.content, x, y, unitPaint, "left");
  paintUnderline(ctx, unitProps.content, x, y, ascent, descent, unitPaint);

  return {
    canvas,
    width,
    height,
    logicalWidth,
    logicalHeight,
  };
}

const IDENTITY_UNIT_STATE: TextAnimUnitState = {
  opacity: 1,
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  blurPx: 0,
  visibleFraction: 1,
};

/**
 * Motion for shape chrome under animated glyphs.
 * Whole-block rasters already bake the bubble into the unit bitmap — callers
 * skip painting chrome in that case. For word/character, chrome tracks the
 * average unit motion so slide/pop don't leave an empty shell at rest.
 */
function chromeMotionForBubble(
  layout: TextUnitLayout,
  states: TextAnimUnitState[],
): TextAnimUnitState {
  if (layout.granularity === "whole" || layout.units.length <= 1) {
    return states[0] ?? IDENTITY_UNIT_STATE;
  }
  let n = 0;
  let x = 0;
  let y = 0;
  let opacity = 0;
  let scaleX = 0;
  let scaleY = 0;
  let rotation = 0;
  let blurPx = 0;
  for (let i = 0; i < layout.units.length; i++) {
    const unit = layout.units[i]!;
    if (unit.text === "\n" || unit.text.length === 0) continue;
    const s = states[i] ?? IDENTITY_UNIT_STATE;
    n += 1;
    x += s.x;
    y += s.y;
    opacity += s.opacity;
    scaleX += s.scaleX;
    scaleY += s.scaleY;
    rotation += s.rotation;
    blurPx += s.blurPx;
  }
  if (n === 0) return IDENTITY_UNIT_STATE;
  return {
    opacity: opacity / n,
    x: x / n,
    y: y / n,
    scaleX: scaleX / n,
    scaleY: scaleY / n,
    rotation: rotation / n,
    blurPx: blurPx / n,
    visibleFraction: 1,
  };
}

/**
 * Composite animated units into one OffscreenCanvas (logical block size + pad).
 * Motion offsets are in logical layout pixels.
 */
export function compositeAnimatedText(args: {
  props: TextProps;
  layout: TextUnitLayout;
  states: TextAnimUnitState[];
  pixelRatio: number;
  /** Extra pad (logical) so slide/blur is not clipped. */
  overflowPad?: number;
  unitBitmaps: Map<
    number,
    {
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      logicalWidth: number;
      logicalHeight: number;
    }
  >;
}): {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
  /** Origin shift so layoutSize still maps to original block center. */
  originOffsetX: number;
  originOffsetY: number;
} | null {
  const { props, layout, states, pixelRatio, unitBitmaps } = args;
  const overflow = Math.max(0, args.overflowPad ?? ANIMATED_TEXT_OVERFLOW_PAD);
  const logicalW = Math.ceil(layout.blockWidth + overflow * 2);
  const logicalH = Math.ceil(layout.blockHeight + overflow * 2);
  const pr = Math.max(0.25, pixelRatio);
  const width = Math.max(2, Math.ceil(logicalW * pr));
  const height = Math.max(2, Math.ceil(logicalH * pr));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }

  // Whole-block animation uses rasterizeText(), which already includes bubble
  // chrome. Painting it again here left an empty shape at rest while text slid.
  // Word/character units are glyph-only — paint chrome once, with motion.
  const paint = resolveText(props, pr);
  const paintChromeSeparately =
    Boolean(paint.bubble) && layout.granularity !== "whole";
  if (paintChromeSeparately && paint.bubble) {
    const probe =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : document.createElement("canvas");
    const pctx = probe.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (pctx) {
      pctx.font = textFontCss(paint);
      const lines = paint.content.split("\n");
      let maxW = 0;
      for (const line of lines) {
        maxW = Math.max(maxW, measureLineWidth(pctx, line, paint.letterSpacing));
      }
      const metrics0 = pctx.measureText(lines[0] || "M");
      const ascent =
        metrics0.actualBoundingBoxAscent > 0
          ? metrics0.actualBoundingBoxAscent
          : paint.fontSize * 0.8;
      const descent =
        metrics0.actualBoundingBoxDescent > 0
          ? metrics0.actualBoundingBoxDescent
          : paint.fontSize * 0.25;
      const lineHeight = lineAdvanceHeight(paint, ascent, descent);
      const textH = lines.length * lineHeight;
      const fullW = layout.blockWidth * pr;
      const rect = bubbleRectForText(fullW, maxW, textH, paint);
      if (rect) {
        const chrome = chromeMotionForBubble(layout, states);
        if (chrome.opacity >= 0.01 && chrome.visibleFraction >= 0.01) {
          const cx =
            rect.x + overflow * pr + rect.w / 2 + chrome.x * pr;
          const cy =
            rect.y + overflow * pr + rect.h / 2 + chrome.y * pr;
          ctx.save();
          ctx.globalAlpha = Math.min(1, Math.max(0, chrome.opacity));
          if (chrome.blurPx > 0.5) {
            ctx.filter = `blur(${chrome.blurPx * pr}px)`;
          }
          ctx.translate(cx, cy);
          ctx.rotate((chrome.rotation * Math.PI) / 180);
          ctx.scale(chrome.scaleX, chrome.scaleY);
          paintBubble(
            ctx,
            { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h },
            paint.bubble,
          );
          ctx.restore();
        }
      }
    }
  }

  for (let i = 0; i < layout.units.length; i++) {
    const unit = layout.units[i]!;
    const state = states[i] ?? {
      opacity: 1,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      blurPx: 0,
      visibleFraction: 1,
    };
    if (state.opacity < 0.01 || state.visibleFraction < 0.01) continue;
    if (unit.text === "\n" || unit.text.length === 0) continue;

    let bmp = unitBitmaps.get(i);
    if (!bmp) {
      const raster = rasterizeTextUnit(
        props,
        unit.text,
        pr,
        unit.startIndex != null && unit.endIndex != null
          ? { startIndex: unit.startIndex, endIndex: unit.endIndex }
          : undefined,
      );
      if (!raster) continue;
      bmp = raster;
      unitBitmaps.set(i, bmp);
    }

    const destW = bmp.logicalWidth * pr;
    const destH = bmp.logicalHeight * pr;
    const cx = (overflow + unit.x + unit.width / 2 + state.x) * pr;
    const cy = (overflow + unit.y + unit.height / 2 + state.y) * pr;

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, state.opacity));
    if (state.blurPx > 0.5) {
      ctx.filter = `blur(${state.blurPx * pr}px)`;
    }
    ctx.translate(cx, cy);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.scaleX, state.scaleY);
    ctx.drawImage(bmp.canvas, -destW / 2, -destH / 2, destW, destH);
    ctx.restore();
  }

  return {
    canvas,
    width,
    height,
    logicalWidth: logicalW,
    logicalHeight: logicalH,
    originOffsetX: overflow,
    originOffsetY: overflow,
  };
}
