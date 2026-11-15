/**
 * Composite caption words for Display style / word highlight (caption-app parity).
 */

import type { CaptionDisplayOptions } from "../ai/captions/captionDisplay";
import {
  timedWordZoomFactor,
  type CaptionWordSpan,
} from "../ai/captions/captionDisplay";
import type { TextProps } from "../project/types";
import {
  lineAdvanceHeight,
  measureLineWidth,
  measureTextSize,
  resolveText,
  textFontCss,
} from "./rasterizeText";
import { rasterizeTextUnit } from "./textUnits";

/** Subtle pop — enough to read as active without crushing neighbors. */
const ACTIVE_SCALE = 1.08;
/** Soft rounded-square corner (not a pill). */
const CHIP_RADIUS_RATIO = 0.22;
const CHIP_PAD_X_RATIO = 0.1;
const CHIP_PAD_Y_RATIO = 0.14;

export type CaptionKaraokeArgs = {
  baseStyle: Omit<TextProps, "content">;
  visible: CaptionWordSpan[];
  activeIndex: number;
  contentMs: number;
  display: CaptionDisplayOptions;
  pixelRatio: number;
  /** Max line width in layout px — words wrap to fit. */
  maxWrapWidth?: number;
};

export type CaptionKaraokeResult = {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  logicalWidth: number;
  logicalHeight: number;
};

/**
 * Layout visible words as a centered wrapped block and paint idle / active looks.
 * Zoom grows into reserved gaps; canvas expands so the highlight chip is never clipped.
 */
export function compositeCaptionKaraoke(
  args: CaptionKaraokeArgs,
): CaptionKaraokeResult | null {
  const { visible, activeIndex, display, contentMs } = args;
  if (visible.length === 0) return null;

  const content = visible.map((w) => w.text).join(" ");
  const baseProps: TextProps = { ...args.baseStyle, content };
  const natural = measureTextSize(baseProps);
  if (!natural) return null;

  const pr = Math.max(0.25, args.pixelRatio);
  const t = resolveText(baseProps, 1);
  const probe = new OffscreenCanvas(1, 1);
  const pctx = probe.getContext("2d");
  if (!pctx) return null;
  pctx.font = textFontCss(t);
  const metrics0 = pctx.measureText(visible[0]?.text || "M");
  const ascent =
    metrics0.actualBoundingBoxAscent > 0
      ? metrics0.actualBoundingBoxAscent
      : t.fontSize * 0.8;
  const descent =
    metrics0.actualBoundingBoxDescent > 0
      ? metrics0.actualBoundingBoxDescent
      : t.fontSize * 0.25;
  const lineHeight = lineAdvanceHeight(t, ascent, descent);
  const spaceW = pctx.measureText(" ").width;

  const zoomOn =
    display.wordHighlight &&
    display.highlightZoom &&
    activeIndex >= 0 &&
    activeIndex < visible.length;

  // Wrap to the user/screen width when provided; otherwise natural text width.
  const maxW = Math.max(
    8,
    args.maxWrapWidth != null && args.maxWrapWidth > 0
      ? args.maxWrapWidth
      : natural.width - t.pad * 2,
  );
  const block = {
    width: Math.min(natural.width, Math.ceil(maxW + t.pad * 2)),
    height: natural.height,
  };
  type Laid = {
    text: string;
    wordIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
    line: number;
  };
  const laid: Laid[] = [];
  let line: Array<{ text: string; wordIndex: number; width: number }> = [];
  let lineW = 0;
  let lineY = t.pad;
  let lineIndex = 0;
  const flushLine = () => {
    if (line.length === 0) return;
    const total =
      line.reduce((s, w) => s + w.width, 0) +
      Math.max(0, line.length - 1) * spaceW;
    let x =
      t.align === "left"
        ? t.pad
        : t.align === "right"
          ? block.width - t.pad - total
          : (block.width - total) / 2;
    for (const w of line) {
      laid.push({
        text: w.text,
        wordIndex: w.wordIndex,
        x,
        y: lineY,
        width: w.width,
        height: lineHeight,
        line: lineIndex,
      });
      x += w.width + spaceW;
    }
    line = [];
    lineW = 0;
    lineY += lineHeight;
    lineIndex += 1;
  };

  for (let i = 0; i < visible.length; i++) {
    const text = visible[i]!.text;
    const width = Math.max(1, measureLineWidth(pctx, text, t.letterSpacing));
    const nextW = line.length === 0 ? width : lineW + spaceW + width;
    if (line.length > 0 && nextW > maxW) flushLine();
    line.push({ text, wordIndex: i, width });
    lineW = line.length === 1 ? width : lineW + spaceW + width;
  }
  flushLine();

  // Reserve horizontal room for the zoomed word so it does not crush neighbors.
  let layoutWidth = block.width;
  if (zoomOn) {
    const activeLaid = laid.find((u) => u.wordIndex === activeIndex);
    if (activeLaid) {
      const grow = ((ACTIVE_SCALE - 1) / 2) * activeLaid.width;
      const lineWords = laid.filter((u) => u.line === activeLaid.line);
      for (const u of lineWords) {
        if (u.wordIndex < activeIndex) u.x -= grow;
        else if (u.wordIndex > activeIndex) u.x += grow;
      }
      const minX = Math.min(...lineWords.map((u) => u.x));
      const maxX = Math.max(...lineWords.map((u) => u.x + u.width));
      const expanded = maxX - minX;
      const targetX =
        t.align === "left"
          ? t.pad
          : t.align === "right"
            ? Math.max(t.pad, layoutWidth - t.pad - expanded)
            : (layoutWidth - expanded) / 2;
      const shift = targetX - minX;
      if (Math.abs(shift) > 0.01) {
        for (const u of lineWords) u.x += shift;
      }
      const right = Math.max(...lineWords.map((u) => u.x + u.width)) + t.pad;
      layoutWidth = Math.max(layoutWidth, Math.ceil(right));
    }
  }

  const contentH = Math.max(
    lineHeight,
    lineY - t.pad + t.pad + (t.strokeWidth * 2.5 || 0),
  );
  const contentW = layoutWidth;
  const contentBoxH = Math.max(block.height, contentH);

  type Painted = {
    unit: Laid;
    raster: NonNullable<ReturnType<typeof rasterizeTextUnit>>;
    isActive: boolean;
    scale: number;
    destW: number;
    destH: number;
    /** Center in content (pre-overflow) logical px. */
    cx: number;
    cy: number;
  };
  const painted: Painted[] = [];

  for (const unit of laid) {
    const isActive =
      display.wordHighlight && unit.wordIndex === activeIndex;
    const fill = isActive
      ? display.highlightColor
      : (args.baseStyle.color ?? "#ffffff");
    const wordProps: TextProps = {
      ...args.baseStyle,
      content: unit.text,
      color: fill,
      align: "left",
      bubble: undefined,
    };
    const raster = rasterizeTextUnit(wordProps, unit.text, pr);
    if (!raster) continue;

    const scale = isActive && display.highlightZoom ? ACTIVE_SCALE : 1;
    painted.push({
      unit,
      raster,
      isActive,
      scale,
      destW: raster.logicalWidth * pr,
      destH: raster.logicalHeight * pr,
      cx: unit.x + unit.width / 2,
      cy: unit.y + unit.height / 2,
    });
  }

  const active = painted.find((p) => p.isActive);
  const pulse =
    active &&
    display.highlightBackgroundAlpha > 0.001 &&
    display.highlightEnergyZoom
      ? timedWordZoomFactor(contentMs, visible[activeIndex])
      : 1;

  // Chip hugs the glyph box (layout width), not the oversized raster pad.
  let chipW = 0;
  let chipH = 0;
  if (active && display.highlightBackgroundAlpha > 0.001) {
    const padX = Math.max(
      4,
      active.unit.width * CHIP_PAD_X_RATIO + (t.strokeWidth || 0),
    );
    const padY = Math.max(
      3,
      active.unit.height * CHIP_PAD_Y_RATIO + (t.strokeWidth || 0) * 0.5,
    );
    chipW = (active.unit.width + padX * 2) * active.scale * pulse;
    chipH = (active.unit.height + padY * 2) * active.scale * pulse;
  }

  // Expand canvas so zoomed glyphs + highlight chip never clip at the text box.
  let overflowL = 0;
  let overflowR = 0;
  let overflowT = 0;
  let overflowB = 0;
  const margin = Math.max(4, Math.round(t.fontSize * 0.08));

  const expandForRect = (
    left: number,
    top: number,
    right: number,
    bottom: number,
  ) => {
    overflowL = Math.max(overflowL, Math.ceil(margin - left));
    overflowT = Math.max(overflowT, Math.ceil(margin - top));
    overflowR = Math.max(overflowR, Math.ceil(right + margin - contentW));
    overflowB = Math.max(overflowB, Math.ceil(bottom + margin - contentBoxH));
  };

  for (const p of painted) {
    const halfW = (p.raster.logicalWidth * p.scale) / 2;
    const halfH = (p.raster.logicalHeight * p.scale) / 2;
    expandForRect(p.cx - halfW, p.cy - halfH, p.cx + halfW, p.cy + halfH);
  }

  if (active && chipW > 0) {
    expandForRect(
      active.cx - chipW / 2,
      active.cy - chipH / 2,
      active.cx + chipW / 2,
      active.cy + chipH / 2,
    );
  }

  const logicalW = Math.ceil(contentW + overflowL + overflowR);
  const logicalH = Math.ceil(contentBoxH + overflowT + overflowB);
  const width = Math.max(2, Math.ceil(logicalW * pr));
  const height = Math.max(2, Math.ceil(logicalH * pr));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (display.backgroundAlpha > 0.001) {
    const a = Math.min(1, Math.max(0, display.backgroundAlpha));
    ctx.fillStyle = hexToRgba(display.backgroundColor, a);
    const r = Math.min(12, logicalH / 3) * pr;
    roundRect(ctx, 0, 0, width, height, r);
    ctx.fill();
  }

  const drawWord = (p: Painted) => {
    const cx = (overflowL + p.cx) * pr;
    const cy = (overflowT + p.cy) * pr;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(p.scale, p.scale);
    ctx.drawImage(
      p.raster.canvas,
      -p.destW / 2,
      -p.destH / 2,
      p.destW,
      p.destH,
    );
    ctx.restore();
  };

  // Chip behind every glyph so it never covers neighboring words.
  if (active && display.highlightBackgroundAlpha > 0.001 && chipW > 0) {
    const cx = (overflowL + active.cx) * pr;
    const cy = (overflowT + active.cy) * pr;
    const bw = chipW * pr;
    const bh = chipH * pr;
    const radius = Math.min(bw, bh) * CHIP_RADIUS_RATIO;
    ctx.fillStyle = hexToRgba(
      display.highlightBackgroundColor,
      display.highlightBackgroundAlpha,
    );
    roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, radius);
    ctx.fill();
  }

  for (const p of painted) {
    if (!p.isActive) drawWord(p);
  }
  if (active) drawWord(active);

  return {
    canvas,
    width,
    height,
    logicalWidth: logicalW,
    logicalHeight: logicalH,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(full.slice(0, 2), 16) || 0;
  const g = Number.parseInt(full.slice(2, 4), 16) || 0;
  const b = Number.parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
