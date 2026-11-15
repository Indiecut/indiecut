import type { TextBubbleProps, TextProps } from "../project/types";

export type RasterizedText = {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  /** Logical size at pixelRatio 1 (layout units). */
  logicalWidth: number;
  logicalHeight: number;
};

/** Tight pad so selection chrome hugs glyphs. */
const PAD = 4;

/** Default weight — matches pre-Step-1 hardcoded paint. */
export const DEFAULT_TEXT_FONT_WEIGHT = 600;

/** Logical px of comic extrusion when retro3DColor is set. */
export const RETRO_3D_DEPTH = 4;

/** Extra logical height for speech-round tail. */
const SPEECH_TAIL_H = 10;

export type ParsedLinearGradient = {
  angleDeg: number;
  stops: Array<{ offset: number; color: string }>;
};

export type ResolvedBubble = {
  type: TextBubbleProps["type"];
  fill: string;
  stroke: string;
  strokeWidth: number;
  paddingX: number;
  paddingY: number;
  accentColor?: string;
  /** Extra height below bubble for speech tail (device px). */
  tailH: number;
};

export type ResolvedTextPaint = {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline";
  color: string;
  /** Parsed CSS linear-gradient; null = flat color fill. */
  gradient: ParsedLinearGradient | null;
  align: "left" | "center" | "right";
  letterSpacing: number;
  /** Explicit line-height multiplier; null = metrics-based. */
  lineHeightMul: number | null;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  /** Comic / retro extrusion tint; null = off. */
  retro3DColor: string | null;
  /** Extrusion depth in device pixels (0 when off). */
  retro3DDepth: number;
  /** Active bubble chrome; null when type is none / absent. */
  bubble: ResolvedBubble | null;
  pad: number;
  shadowPad: number;
  underlinePad: number;
  pr: number;
};

type Ctx2d = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** True when bubble chrome should paint / expand measure. */
export function bubbleIsActive(
  bubble?: TextBubbleProps | null,
): bubble is TextBubbleProps {
  return Boolean(bubble && bubble.type && bubble.type !== "none");
}

/**
 * Parse mock-style CSS linear-gradient strings.
 * e.g. `linear-gradient(180deg, #38bdf8 0%, #1d4ed8 100%)`
 */
export function parseLinearGradientCss(
  raw: string | null | undefined,
): ParsedLinearGradient | null {
  if (!raw || typeof raw !== "string") return null;
  const m = raw
    .trim()
    .match(
      /^linear-gradient\(\s*([+-]?\d*\.?\d+)deg\s*,\s*(.+)\s*\)$/i,
    );
  if (!m) return null;
  const angleDeg = Number(m[1]);
  if (!Number.isFinite(angleDeg)) return null;
  const stopParts = m[2]!.split(/,(?![^(]*\))/);
  const stops: Array<{ offset: number; color: string }> = [];
  for (let i = 0; i < stopParts.length; i++) {
    const part = stopParts[i]!.trim();
    const sm = part.match(
      /^(.*?)\s+([+-]?\d*\.?\d+)%\s*$/,
    );
    if (sm) {
      const color = sm[1]!.trim();
      const offset = Number(sm[2]) / 100;
      if (!color || !Number.isFinite(offset)) continue;
      stops.push({
        offset: Math.min(1, Math.max(0, offset)),
        color,
      });
    } else if (part) {
      stops.push({
        offset: stopParts.length <= 1 ? 0 : i / (stopParts.length - 1),
        color: part,
      });
    }
  }
  if (stops.length < 2) return null;
  return { angleDeg, stops };
}

export function formatLinearGradientCss(
  angleDeg: number,
  from: string,
  to: string,
): string {
  return `linear-gradient(${Math.round(angleDeg)}deg, ${from} 0%, ${to} 100%)`;
}

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

function applyTextTransform(
  content: string,
  transform: TextProps["textTransform"],
): string {
  if (!transform || transform === "none") return content;
  if (transform === "uppercase") return content.toUpperCase();
  if (transform === "lowercase") return content.toLowerCase();
  if (transform === "capitalize") {
    return content.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return content;
}

export function textHasShadow(props: TextProps): boolean {
  const blur = props.shadowBlur ?? 0;
  const ox = props.shadowOffsetX ?? 0;
  const oy = props.shadowOffsetY ?? 0;
  return blur > 0 || ox !== 0 || oy !== 0;
}

function resolveBubble(
  props: TextProps,
  pr: number,
): ResolvedBubble | null {
  if (!bubbleIsActive(props.bubble)) return null;
  const b = props.bubble;
  const type = b.type;
  const tailH =
    type === "speech-round" || type === "speech-comic"
      ? Math.ceil(SPEECH_TAIL_H * pr)
      : type === "thought-cloud"
        ? Math.ceil(SPEECH_TAIL_H * 1.4 * pr)
        : 0;
  return {
    type,
    fill: b.fill || "#ffffff",
    stroke: b.stroke || "#000000",
    strokeWidth: Math.max(0, (b.strokeWidth ?? 0) * pr),
    paddingX: Math.max(0, (b.paddingX ?? 12) * pr),
    paddingY: Math.max(0, (b.paddingY ?? 8) * pr),
    accentColor: b.accentColor,
    tailH,
  };
}

/** Content origin inset (device px) from canvas top-left to glyph top-left. */
export function contentInsets(t: ResolvedTextPaint): { x: number; y: number } {
  const bx = t.bubble ? t.bubble.paddingX + t.bubble.strokeWidth / 2 : 0;
  const by = t.bubble ? t.bubble.paddingY + t.bubble.strokeWidth / 2 : 0;
  return {
    x: t.pad + t.strokeWidth + bx,
    y: t.pad + t.strokeWidth + by,
  };
}

export function resolveText(props: TextProps, pixelRatio = 1): ResolvedTextPaint {
  const pr = Math.max(0.25, pixelRatio);
  const shadow = textHasShadow(props);
  const shadowBlur = Math.max(0, (props.shadowBlur ?? 0) * pr);
  const shadowOffsetX = (props.shadowOffsetX ?? 0) * pr;
  const shadowOffsetY = (props.shadowOffsetY ?? 0) * pr;
  const retro3DColor =
    typeof props.retro3DColor === "string" && props.retro3DColor.length > 0
      ? props.retro3DColor
      : null;
  const retro3DDepth = retro3DColor ? Math.ceil(RETRO_3D_DEPTH * pr) : 0;
  const bubble = resolveBubble(props, pr);
  const neonGlowPad =
    bubble?.type === "neon-frame" || bubble?.type === "star-badge"
      ? Math.ceil(Math.max(bubble.strokeWidth * 2, 8 * pr))
      : bubble?.type === "comic-burst" || bubble?.type === "hexagon"
        ? Math.ceil(10 * pr)
        : 0;
  const effectPad = Math.max(
    shadow
      ? Math.ceil(
          Math.max(0, shadowBlur) +
            Math.abs(shadowOffsetX) +
            Math.abs(shadowOffsetY) +
            2 * pr,
        )
      : 0,
    retro3DDepth + (retro3DDepth > 0 ? Math.ceil(2 * pr) : 0),
    neonGlowPad,
  );
  const underline =
    (props.textDecoration ?? "none") === "underline";
  return {
    content: applyTextTransform(props.content || "", props.textTransform),
    fontFamily: props.fontFamily || "system-ui, sans-serif",
    fontSize: Math.max(8, (props.fontSize ?? 48) * pr),
    fontWeight: props.fontWeight ?? DEFAULT_TEXT_FONT_WEIGHT,
    fontStyle: props.fontStyle === "italic" ? "italic" : "normal",
    textDecoration: underline ? "underline" : "none",
    color: props.color || "#ffffff",
    gradient: parseLinearGradientCss(props.gradient),
    align: props.align || "center",
    letterSpacing: (props.letterSpacing ?? 0) * pr,
    lineHeightMul:
      typeof props.lineHeight === "number" && Number.isFinite(props.lineHeight)
        ? Math.max(0.5, props.lineHeight)
        : null,
    strokeColor: props.strokeColor || "#000000",
    strokeWidth: Math.max(0, (props.strokeWidth ?? 0) * pr),
    shadow,
    shadowColor: props.shadowColor || "rgba(0,0,0,0.55)",
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    retro3DColor,
    retro3DDepth,
    bubble,
    pad: PAD * pr,
    shadowPad: effectPad,
    underlinePad: underline ? Math.ceil(pr * 3) : 0,
    pr,
  };
}

export function textFontCss(t: ResolvedTextPaint): string {
  const style = t.fontStyle === "italic" ? "italic " : "";
  return `${style}${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
}

export function measureLineWidth(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  line: string,
  letterSpacing: number,
): number {
  if (!letterSpacing) {
    const m = ctx.measureText(line);
    const left = m.actualBoundingBoxLeft ?? 0;
    const right = m.actualBoundingBoxRight ?? m.width;
    return Math.max(m.width, left + right);
  }
  const chars = [...line];
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    w += ctx.measureText(chars[i]!).width;
    if (i < chars.length - 1) w += letterSpacing;
  }
  return w;
}

export function lineAdvanceHeight(
  t: ResolvedTextPaint,
  ascent: number,
  descent: number,
): number {
  const natural = Math.ceil(ascent + descent + t.fontSize * 0.12);
  if (t.lineHeightMul != null) {
    // Never shrink below real glyph bounds — tight multipliers (e.g. 1.05)
    // otherwise clip strokes and make selection boxes too short.
    return Math.max(natural, Math.ceil(t.fontSize * t.lineHeightMul));
  }
  return natural;
}

function applyShadow(ctx: Ctx2d, t: ResolvedTextPaint): void {
  if (!t.shadow) {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  ctx.shadowColor = t.shadowColor;
  ctx.shadowBlur = t.shadowBlur;
  ctx.shadowOffsetX = t.shadowOffsetX;
  ctx.shadowOffsetY = t.shadowOffsetY;
}

function clearShadow(ctx: Ctx2d): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function drawTextRun(
  ctx: Ctx2d,
  line: string,
  x: number,
  y: number,
  t: ResolvedTextPaint,
  align: "left" | "center" | "right",
  draw: (ch: string, cx: number, cy: number) => void,
): void {
  if (!t.letterSpacing) {
    draw(line, x, y);
    return;
  }
  const chars = [...line];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  let total = 0;
  for (let i = 0; i < chars.length; i++) {
    total += widths[i]!;
    if (i < chars.length - 1) total += t.letterSpacing;
  }
  let cursor =
    align === "left"
      ? x
      : align === "right"
        ? x - total
        : x - total / 2;
  // With letterSpacing we force left-aligned glyph advances from computed origin.
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    draw(chars[i]!, cursor, y);
    cursor += widths[i]! + t.letterSpacing;
  }
  ctx.textAlign = prevAlign;
}

/** Stacked offset fills for comic / retro extrusion (drawn under stroke+fill). */
export function paintRetro3D(
  ctx: Ctx2d,
  line: string,
  x: number,
  y: number,
  t: ResolvedTextPaint,
  align: "left" | "center" | "right" = t.align,
): void {
  if (!t.retro3DColor || t.retro3DDepth <= 0) return;
  clearShadow(ctx);
  ctx.fillStyle = t.retro3DColor;
  for (let i = t.retro3DDepth; i >= 1; i--) {
    drawTextRun(ctx, line, x, y, t, align, (ch, cx, cy) =>
      ctx.fillText(ch, cx + i, cy + i),
    );
  }
}

/** Draw a line of text (optional stroke + fill) with letter-spacing. */
export function paintTextLine(
  ctx: Ctx2d,
  line: string,
  x: number,
  y: number,
  t: ResolvedTextPaint,
  align: "left" | "center" | "right" = t.align,
): void {
  if (t.strokeWidth > 0) {
    ctx.lineWidth = t.strokeWidth;
    ctx.strokeStyle = t.strokeColor;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    drawTextRun(ctx, line, x, y, t, align, (ch, cx, cy) =>
      ctx.strokeText(ch, cx, cy),
    );
  }
  if (t.gradient) {
    const w = measureLineWidth(ctx, line, t.letterSpacing);
    let left = x;
    if (align === "center") left = x - w / 2;
    else if (align === "right") left = x - w;
    ctx.fillStyle = createFillGradient(
      ctx,
      t.gradient,
      left,
      y,
      Math.max(1, w),
      t.fontSize,
    );
  } else {
    ctx.fillStyle = t.color;
  }
  drawTextRun(ctx, line, x, y, t, align, (ch, cx, cy) =>
    ctx.fillText(ch, cx, cy),
  );
}

function roundRectPath(
  ctx: Ctx2d,
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

function burstPath(
  ctx: Ctx2d,
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  spikes = 12,
): void {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function fillStrokePath(
  ctx: Ctx2d,
  bubble: ResolvedBubble,
  opts?: { join?: CanvasLineJoin },
): void {
  ctx.fillStyle = bubble.fill;
  ctx.fill();
  if (bubble.strokeWidth > 0) {
    ctx.lineWidth = bubble.strokeWidth;
    ctx.strokeStyle = bubble.stroke;
    ctx.lineJoin = opts?.join ?? "round";
    ctx.stroke();
  }
}

function hexagonPath(
  ctx: Ctx2d,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const inset = Math.min(w * 0.18, h * 0.45);
  ctx.beginPath();
  ctx.moveTo(x + inset, y);
  ctx.lineTo(x + w - inset, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - inset, y + h);
  ctx.lineTo(x + inset, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

function ribbonPath(
  ctx: Ctx2d,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const notch = Math.min(h * 0.35, 18);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w / 2, y + h - notch);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function arrowTagPath(
  ctx: Ctx2d,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const tip = Math.min(w * 0.22, h * 0.85);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - tip, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - tip, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function ticketPath(
  ctx: Ctx2d,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = Math.min(10, h / 3);
  const notch = Math.min(8, h * 0.22);
  const midX = x + w * 0.72;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(midX - notch, y);
  ctx.arc(midX, y, notch, Math.PI, 0, true);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.lineTo(midX + notch, y + h);
  ctx.arc(midX, y + h, notch, 0, Math.PI, true);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tornPaperPath(
  ctx: Ctx2d,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const jags = 7;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i <= jags; i++) {
    const px = x + (w * i) / jags;
    const py = y + (i % 2 === 0 ? 0 : Math.min(6, h * 0.12));
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x + w, y + h);
  for (let i = jags - 1; i >= 0; i--) {
    const px = x + (w * i) / jags;
    const py = y + h - (i % 2 === 0 ? 0 : Math.min(6, h * 0.12));
    ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * Draw bubble chrome under glyphs. `rect` is the padded content box
 * (text bounds expanded by bubble padding), in device pixels.
 */
export function paintBubble(
  ctx: Ctx2d,
  rect: { x: number; y: number; w: number; h: number },
  bubble: ResolvedBubble,
): void {
  if (bubble.type === "none") return;
  const { x, y, w, h } = rect;
  if (w <= 0 || h <= 0) return;

  clearShadow(ctx);
  const type = bubble.type;

  if (type === "comic-burst" || type === "star-badge") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const inner = Math.sqrt(w * w + h * h) / 2;
    const outer = inner * (type === "star-badge" ? 1.28 : 1.22);
    burstPath(ctx, cx, cy, inner * 0.9, outer, type === "star-badge" ? 8 : 14);
    fillStrokePath(ctx, bubble);
    return;
  }

  if (type === "neon-frame") {
    const r = Math.min(12, w / 4, h / 4);
    roundRectPath(ctx, x, y, w, h, Math.max(8, r));
    ctx.fillStyle = bubble.fill;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = bubble.stroke;
    ctx.shadowBlur = Math.max(8, bubble.strokeWidth * 3);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.lineWidth = Math.max(1.5, bubble.strokeWidth);
    ctx.strokeStyle = bubble.stroke;
    ctx.stroke();
    ctx.restore();
    clearShadow(ctx);
    roundRectPath(ctx, x, y, w, h, Math.max(8, r));
    ctx.lineWidth = Math.max(1, bubble.strokeWidth * 0.55);
    ctx.strokeStyle = bubble.accentColor || bubble.stroke;
    ctx.stroke();
    return;
  }

  if (type === "pill") {
    roundRectPath(ctx, x, y, w, h, Math.min(w, h) / 2);
    fillStrokePath(ctx, bubble);
    return;
  }

  if (type === "rounded-rect") {
    roundRectPath(ctx, x, y, w, h, Math.min(14, w / 5, h / 3));
    fillStrokePath(ctx, bubble);
    return;
  }

  if (type === "promo-badge") {
    const r = Math.min(10, h / 3);
    roundRectPath(ctx, x, y, w, h, r);
    fillStrokePath(ctx, bubble);
    // accent underline bar
    const barH = Math.max(3, h * 0.08);
    ctx.fillStyle = bubble.accentColor || bubble.stroke;
    ctx.fillRect(x + w * 0.12, y + h - barH * 2.2, w * 0.76, barH);
    return;
  }

  if (type === "typing-box") {
    roundRectPath(ctx, x, y, w, h, 4);
    fillStrokePath(ctx, bubble, { join: "miter" });
    const dot = Math.max(2, Math.min(5, h * 0.12));
    const baseY = y + h - Math.max(6, h * 0.18);
    ctx.fillStyle = bubble.accentColor || bubble.stroke;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x + w * 0.2 + i * dot * 2.4, baseY, dot, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (type === "hexagon") {
    hexagonPath(ctx, x, y, w, h);
    fillStrokePath(ctx, bubble);
    return;
  }

  if (type === "ribbon") {
    ribbonPath(ctx, x, y, w, h);
    fillStrokePath(ctx, bubble);
    return;
  }

  if (type === "arrow-tag") {
    arrowTagPath(ctx, x, y, w, h);
    fillStrokePath(ctx, bubble);
    return;
  }

  if (type === "ticket") {
    ticketPath(ctx, x, y, w, h);
    fillStrokePath(ctx, bubble);
    // dashed divider
    const midX = x + w * 0.72;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(midX, y + 6);
    ctx.lineTo(midX, y + h - 6);
    ctx.strokeStyle = bubble.accentColor || bubble.stroke;
    ctx.lineWidth = Math.max(1, bubble.strokeWidth * 0.6);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (type === "torn-paper") {
    tornPaperPath(ctx, x, y, w, h);
    fillStrokePath(ctx, bubble);
    return;
  }

  if (type === "speech-comic") {
    const bodyH = Math.max(1, h - bubble.tailH);
    const jags = 10;
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    for (let i = 0; i <= jags; i++) {
      const px = x + (w * i) / jags;
      const py = y + (i % 2 === 0 ? 0 : Math.min(5, bodyH * 0.1));
      ctx.lineTo(px, py);
    }
    for (let i = 0; i <= jags; i++) {
      const px = x + w - (i % 2 === 0 ? 0 : Math.min(5, w * 0.04));
      const py = y + (bodyH * i) / jags;
      ctx.lineTo(px, py);
    }
    for (let i = jags; i >= 0; i--) {
      const px = x + (w * i) / jags;
      const py = y + bodyH - (i % 2 === 0 ? 0 : Math.min(5, bodyH * 0.1));
      ctx.lineTo(px, py);
    }
    for (let i = jags; i >= 0; i--) {
      const px = x + (i % 2 === 0 ? 0 : Math.min(5, w * 0.04));
      const py = y + (bodyH * i) / jags;
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    fillStrokePath(ctx, bubble);
    if (bubble.tailH > 0) {
      const tx = x + w * 0.22;
      const ty = y + bodyH - 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + w * 0.14, ty);
      ctx.lineTo(tx + w * 0.02, ty + bubble.tailH);
      ctx.closePath();
      fillStrokePath(ctx, bubble);
    }
    return;
  }

  if (type === "thought-cloud") {
    const bodyH = Math.max(1, h - bubble.tailH);
    thoughtCloudPath(ctx, x, y, w, bodyH);
    // Canvas ellipse union via multiple fills
    ctx.fillStyle = bubble.fill;
    const cy = y + bodyH * 0.55;
    const blobs: Array<[number, number, number, number]> = [
      [x + w * 0.28, cy, w * 0.22, bodyH * 0.38],
      [x + w * 0.5, y + bodyH * 0.42, w * 0.3, bodyH * 0.42],
      [x + w * 0.72, cy, w * 0.24, bodyH * 0.36],
      [x + w * 0.5, y + bodyH * 0.7, w * 0.34, bodyH * 0.32],
    ];
    for (const [bx, by, rx, ry] of blobs) {
      ctx.beginPath();
      ctx.ellipse(bx, by, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      if (bubble.strokeWidth > 0) {
        ctx.lineWidth = bubble.strokeWidth;
        ctx.strokeStyle = bubble.stroke;
        ctx.stroke();
      }
    }
    if (bubble.tailH > 0) {
      const dots = [
        { cx: x + w * 0.3, cy: y + bodyH + bubble.tailH * 0.25, r: 4 },
        { cx: x + w * 0.22, cy: y + bodyH + bubble.tailH * 0.55, r: 3 },
        { cx: x + w * 0.16, cy: y + bodyH + bubble.tailH * 0.85, r: 2 },
      ];
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
        ctx.fillStyle = bubble.fill;
        ctx.fill();
        if (bubble.strokeWidth > 0) {
          ctx.lineWidth = Math.max(1, bubble.strokeWidth * 0.7);
          ctx.strokeStyle = bubble.stroke;
          ctx.stroke();
        }
      }
    }
    return;
  }

  // speech-round (default)
  const r = Math.min(16, w / 4, h / 3);
  const bodyH = Math.max(1, h - bubble.tailH);
  roundRectPath(ctx, x, y, w, bodyH, r);
  fillStrokePath(ctx, bubble);
  if (bubble.tailH > 0) {
    const tx = x + w * 0.28;
    const ty = y + bodyH - 1;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + w * 0.12, ty);
    ctx.lineTo(tx + w * 0.04, ty + bubble.tailH);
    ctx.closePath();
    fillStrokePath(ctx, bubble);
  }
}

/** Bubble rect wrapping measured text block (device px). */
export function bubbleRectForText(
  fullW: number,
  maxW: number,
  textH: number,
  t: ResolvedTextPaint,
): { x: number; y: number; w: number; h: number } | null {
  if (!t.bubble) return null;
  const inset = contentInsets(t);
  let textLeft: number;
  if (t.align === "left") textLeft = inset.x;
  else if (t.align === "right") textLeft = fullW - inset.x - maxW;
  else textLeft = (fullW - maxW) / 2;
  const textTop = inset.y;
  return {
    x: textLeft - t.bubble.paddingX,
    y: textTop - t.bubble.paddingY,
    w: maxW + t.bubble.paddingX * 2,
    h: textH + t.bubble.paddingY * 2 + t.bubble.tailH,
  };
}

export function paintUnderline(
  ctx: Ctx2d,
  line: string,
  x: number,
  y: number,
  ascent: number,
  descent: number,
  t: ResolvedTextPaint,
): void {
  if (t.textDecoration !== "underline") return;
  const w = measureLineWidth(ctx, line, t.letterSpacing);
  let left = x;
  if (t.align === "center") left = x - w / 2;
  else if (t.align === "right") left = x - w;
  const thickness = Math.max(1, Math.round(t.fontSize * 0.06));
  const uy = y + ascent + Math.max(1, descent * 0.35);
  clearShadow(ctx);
  ctx.fillStyle = t.color;
  ctx.fillRect(left, uy, w, thickness);
}

/** Stable key for text raster cache / preview draw fingerprint. */
export function textPropsFingerprint(
  props?: TextProps | null,
  pixelRatio = 1,
): string {
  if (!props) return "";
  const t = resolveText(props, 1);
  const b = props.bubble;
  return [
    t.content,
    t.fontFamily,
    props.fontSize ?? 48,
    t.fontWeight,
    t.fontStyle,
    t.textDecoration,
    props.textTransform ?? "none",
    t.color,
    props.gradient ?? "",
    t.align,
    t.letterSpacing,
    t.lineHeightMul ?? "",
    t.strokeColor,
    props.strokeWidth ?? 0,
    t.shadow ? 1 : 0,
    t.shadowColor,
    props.shadowBlur ?? 0,
    props.shadowOffsetX ?? 0,
    props.shadowOffsetY ?? 0,
    t.retro3DColor ?? "",
    b?.type ?? "",
    b?.fill ?? "",
    b?.stroke ?? "",
    b?.strokeWidth ?? "",
    b?.paddingX ?? "",
    b?.paddingY ?? "",
    b?.accentColor ?? "",
    pixelRatio.toFixed(3),
  ].join("|");
}

/** Logical (unscaled) measure for selection overlay + compositor layout size. */
export function measureTextSize(
  props: TextProps,
): { width: number; height: number } | null {
  return measureTextSizeAt(props, 1);
}

function measureTextSizeAt(
  props: TextProps,
  pixelRatio: number,
): { width: number; height: number } | null {
  const t = resolveText(props, pixelRatio);
  if (!t.content.trim()) return null;

  // Prefer a document canvas on the main thread so measureText sees
  // FontFaces registered on document.fonts. OffscreenCanvas often falls
  // back to system fonts there, which shrinks the selection box vs preview.
  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(1, 1)
        : null;
  if (!canvas) return null;
  const mctx = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!mctx) return null;

  mctx.font = textFontCss(t);
  const lines = t.content.split("\n");
  let ascent = t.fontSize * 0.8;
  let descent = t.fontSize * 0.25;
  let maxW = 0;
  for (const line of lines) {
    const metrics = mctx.measureText(line || "M");
    if (metrics.actualBoundingBoxAscent > 0) {
      ascent = Math.max(ascent, metrics.actualBoundingBoxAscent);
    }
    if (metrics.actualBoundingBoxDescent > 0) {
      descent = Math.max(descent, metrics.actualBoundingBoxDescent);
    }
    maxW = Math.max(maxW, measureLineWidth(mctx, line, t.letterSpacing));
  }
  const lineHeight = lineAdvanceHeight(t, ascent, descent);

  // lineJoin "round" can ink past a centered stroke by ~0.5× width at bends.
  const strokePad =
    t.strokeWidth > 0 ? Math.ceil(t.strokeWidth * 2.5) : 0;
  const bubblePadW = t.bubble
    ? t.bubble.paddingX * 2 + t.bubble.strokeWidth
    : 0;
  const bubblePadH = t.bubble
    ? t.bubble.paddingY * 2 + t.bubble.strokeWidth + t.bubble.tailH
    : 0;
  const width = Math.max(
    2,
    Math.ceil(maxW + t.pad * 2 + strokePad + t.shadowPad + bubblePadW),
  );
  const height = Math.max(
    2,
    Math.ceil(
      lines.length * lineHeight +
        t.pad * 2 +
        strokePad +
        t.shadowPad +
        t.underlinePad +
        bubblePadH,
    ),
  );
  return { width, height };
}

/**
 * Rasterize TextProps. `pixelRatio` is supersample vs logical size
 * (e.g. 3 = glyphs drawn at 3× so downscale-to-stage stays sharp).
 */
export function rasterizeText(
  props: TextProps,
  pixelRatio = 1,
): RasterizedText | null {
  const logical = measureTextSizeAt(props, 1);
  if (!logical) return null;

  const t = resolveText(props, pixelRatio);
  const size = measureTextSizeAt(props, pixelRatio);
  if (!size) return null;
  let { width, height } = size;
  const lines = t.content.split("\n");

  const mctxFont = textFontCss(t);
  const probe =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1)
      : document.createElement("canvas");
  const probeCtx = probe.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!probeCtx) return null;
  probeCtx.font = mctxFont;
  const metrics0 = probeCtx.measureText(lines[0] || "M");
  const ascent =
    metrics0.actualBoundingBoxAscent > 0
      ? metrics0.actualBoundingBoxAscent
      : t.fontSize * 0.8;
  const descent =
    metrics0.actualBoundingBoxDescent > 0
      ? metrics0.actualBoundingBoxDescent
      : t.fontSize * 0.25;
  const lineHeight = lineAdvanceHeight(t, ascent, descent);

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

  ctx.font = mctxFont;
  ctx.textBaseline = "top";
  ctx.textAlign = t.letterSpacing ? "left" : t.align;
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }

  const fullW = size.width;
  const inset = contentInsets(t);
  let x = fullW / 2;
  if (t.align === "left") x = inset.x;
  else if (t.align === "right") x = fullW - inset.x;

  let y = inset.y;
  const textH = lines.length * lineHeight;

  let maxW = 0;
  for (const line of lines) {
    maxW = Math.max(maxW, measureLineWidth(ctx, line, t.letterSpacing));
  }
  if (t.bubble) {
    const rect = bubbleRectForText(fullW, maxW, textH, t);
    if (rect) paintBubble(ctx, rect, t.bubble);
  }

  for (const line of lines) {
    // With letterSpacing, paintTextLine computes origin from align + x as anchor.
    if (t.letterSpacing) {
      ctx.textAlign = "left";
    } else {
      ctx.textAlign = t.align;
    }
    paintRetro3D(ctx, line, x, y, t, t.align);
    applyShadow(ctx, t);
    paintTextLine(ctx, line, x, y, t, t.align);
    if (t.textDecoration === "underline") {
      paintUnderline(ctx, line, x, y, ascent, descent, t);
    }
    y += lineHeight;
  }

  return {
    canvas,
    width,
    height,
    logicalWidth: logical.width,
    logicalHeight: logical.height,
  };
}

/**
 * How many bitmap pixels per logical layout pixel for sharp preview.
 * Accounts for clip scale, stage vs layout, and device pixel ratio.
 */
export function textRasterPixelRatio(args: {
  scaleX: number;
  scaleY: number;
  stageWidth: number;
  layoutWidth: number;
  devicePixelRatio?: number;
}): number {
  const mag = Math.max(Math.abs(args.scaleX), Math.abs(args.scaleY), 0.01);
  const stageScale =
    args.layoutWidth > 0 ? args.stageWidth / args.layoutWidth : 1;
  const dpr = args.devicePixelRatio ?? 1;
  // Aim for ≥2 samples per displayed pixel after scale.
  const ratio = mag * Math.max(stageScale, 0.05) * dpr * 2;
  return Math.min(12, Math.max(2, ratio));
}
