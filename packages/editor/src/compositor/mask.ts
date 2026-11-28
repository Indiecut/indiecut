import { buildClosedPath, ensureMinPoints } from "../geometry/vectorShape";
import type {
  MaskBoolean,
  MaskType,
  ResolvedClipMask,
} from "../project/types";
import { maskFingerprint } from "./maskFingerprint";

export function softstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function combineMatteAlpha(
  accum: number,
  next: number,
  mode: MaskBoolean,
): number {
  switch (mode) {
    case "add":
      return Math.min(1, accum + next - accum * next);
    case "subtract":
      return Math.max(0, accum * (1 - next));
    case "intersect":
      return accum * next;
    default:
      return accum;
  }
}

function featherPx(feather: number, layoutScale: number): number {
  // 0..100 UI → soft edge width in layout px
  return (Math.min(100, Math.max(0, feather)) / 100) * 80 * layoutScale;
}

function expandPx(expand: number | undefined, layoutScale: number): number {
  if (expand == null || expand === 0) return 0;
  return (Math.min(100, Math.max(-100, expand)) / 100) * 60 * layoutScale;
}

function rotateLocal(
  x: number,
  y: number,
  rotationDeg: number,
): { x: number; y: number } {
  if (!rotationDeg) return { x, y };
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c + y * s, y: -x * s + y * c };
}

function toMaskLeafLocal(
  mask: ResolvedClipMask,
  lx: number,
  ly: number,
): { x: number; y: number } {
  const dx = lx - mask.position.x;
  const dy = ly - mask.position.y;
  return rotateLocal(dx, dy, mask.rotationDeg);
}

/** Signed distance: positive = inside visible region (before invert). */
export function maskSignedDistance(
  mask: ResolvedClipMask,
  lx: number,
  ly: number,
  layoutScale = 1,
): number {
  const p = toMaskLeafLocal(mask, lx, ly);
  const exp = expandPx(mask.expand, layoutScale);

  switch (mask.type as MaskType) {
    case "split": {
      // Half-plane: visible where y <= 0 in mask-local (after rotation).
      return -p.y;
    }
    case "filmstrip": {
      const gap = Math.max(1, mask.stripGap ?? 200);
      const half = gap / 2;
      // Band |y| <= half is visible.
      return half - Math.abs(p.y);
    }
    case "circle": {
      const w = Math.max(1, mask.size?.w ?? 400);
      const h = Math.max(1, mask.size?.h ?? 400);
      // Ellipse SDF approximation
      const nx = p.x / (w / 2);
      const ny = p.y / (h / 2);
      const r = Math.hypot(nx, ny);
      const dist = (1 - r) * Math.min(w, h) * 0.5;
      return dist + exp;
    }
    case "rectangle": {
      const w = Math.max(1, mask.size?.w ?? 400);
      const h = Math.max(1, mask.size?.h ?? 400);
      const hw = w / 2;
      const hh = h / 2;
      const cr =
        ((mask.cornerRadius ?? 0) / 100) * Math.min(hw, hh);
      // Rounded box SDF
      const qx = Math.abs(p.x) - hw + cr;
      const qy = Math.abs(p.y) - hh + cr;
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const inside = Math.min(Math.max(qx, qy), 0);
      return -(outside + inside - cr) + exp;
    }
    case "stars": {
      const w = Math.max(1, mask.size?.w ?? 400);
      const h = Math.max(1, mask.size?.h ?? 400);
      const r = Math.min(w, h) * 0.5;
      const round = ((mask.cornerRadius ?? 0) / 100) * r * 0.25;
      return starSd(p.x / (w / r), p.y / (h / r), r, 5, 0.45) + exp + round * 0.5;
    }
    case "heart": {
      const w = Math.max(1, mask.size?.w ?? 400);
      const h = Math.max(1, mask.size?.h ?? 400);
      const sx = (w / 2) / 1.1;
      const sy = (h / 2) / 1.1;
      return -heartSd(p.x / sx, p.y / sy) * Math.min(sx, sy) + exp;
    }
    case "text": {
      // Raster path handles text; SDF fallback = empty
      return -1e6;
    }
    default:
      return -1e6;
  }
}

/** 5-point star SDF in a circle of radius r (iq-style). */
function starSd(
  px: number,
  py: number,
  r: number,
  n: number,
  inset: number,
): number {
  const an = Math.PI / n;
  let a = Math.atan2(py, px);
  a = Math.abs(((a % (2 * an)) + 2 * an) % (2 * an) - an);
  const d = Math.hypot(px, py);
  const ra = r;
  const rb = r * inset;
  const ca = Math.cos(an);
  const sa = Math.sin(an);
  // Distance to star edge along the wedge
  const y = d * Math.cos(a);
  const x = d * Math.sin(a);
  const bn = (y * ca - x * sa) / (ra * ca - rb);
  const edge = Math.max(bn * ra - y, 0);
  // Positive inside
  const inside = d < rb + (ra - rb) * (1 - a / an) * 0.85;
  const approx = ra * 0.55 - d + (inside ? (ra - rb) * 0.2 : 0);
  return approx - edge * 0.15;
}

/** Heart SDF (approx) in normalized coords. Positive outside → we negate. */
function heartSd(x: number, y: number): number {
  // Flip Y so heart points up in screen space (y+ down).
  const yy = -y;
  const xx = x;
  const a = xx * xx + yy * yy - 1;
  return a * a * a - xx * xx * yy * yy * yy;
}

export function sampleMaskAlpha(
  mask: ResolvedClipMask,
  lx: number,
  ly: number,
  layoutScale = 1,
): number {
  if (mask.type === "text" || mask.type === "custom") {
    return 0;
  }
  const d = maskSignedDistance(mask, lx, ly, layoutScale);
  const f = featherPx(mask.feather, layoutScale);
  let a: number;
  if (f < 1e-3) {
    a = d >= 0 ? 1 : 0;
  } else {
    a = softstep(-f, f, d);
  }
  if (mask.invert) a = 1 - a;
  return a;
}

export function needsRasterMask(mask: ResolvedClipMask): boolean {
  return (
    mask.type === "text" ||
    mask.type === "stars" ||
    mask.type === "heart" ||
    mask.type === "custom"
  );
}

type Scratch2d = {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
};

let matteScratch: Scratch2d | null = null;
let combineScratch: Scratch2d | null = null;
let pathScratch: Scratch2d | null = null;
let stampScratch: Scratch2d | null = null;
let hiResScratch: Scratch2d | null = null;

function ensureBuf(
  slot: "matte" | "combine" | "path" | "stamp" | "hires",
  w: number,
  h: number,
): Scratch2d {
  const existing =
    slot === "matte"
      ? matteScratch
      : slot === "combine"
        ? combineScratch
        : slot === "path"
          ? pathScratch
          : slot === "stamp"
            ? stampScratch
            : hiResScratch;
  if (!existing || existing.canvas.width !== w || existing.canvas.height !== h) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", {
      // Path/stamp drawn then composited — avoid willReadFrequently (hurts AA quality).
      willReadFrequently: false,
    });
    if (!ctx) throw new Error("Mask scratch 2D unavailable");
    const next = { canvas, ctx };
    if (slot === "matte") matteScratch = next;
    else if (slot === "combine") combineScratch = next;
    else if (slot === "path") pathScratch = next;
    else if (slot === "stamp") stampScratch = next;
    else hiResScratch = next;
    return next;
  }
  return existing;
}

/** Supersample factor for path/text stamps before downscale. */
const PATH_SS = 3;

type MaskStamp = {
  canvas: OffscreenCanvas;
  /** Logical size in pre-transform stage pixels (draw dest size). */
  logicalW: number;
  logicalH: number;
};

const stampCache = new Map<string, MaskStamp>();

function stampCacheKey(
  mask: ResolvedClipMask,
  w: number,
  h: number,
  mapX: number,
  mapY: number,
  ss: number,
): string {
  return `${w}x${h}|ss${ss}|${mapX.toFixed(4)}|${mapY.toFixed(4)}|${maskFingerprint(true, [mask])}`;
}

function drawStarPath(
  ctx: OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawHeartPath(
  ctx: OffscreenCanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + hh * 0.35);
  ctx.bezierCurveTo(
    cx - hw * 0.1,
    cy + hh * 0.1,
    cx - hw,
    cy - hh * 0.15,
    cx - hw,
    cy - hh * 0.45,
  );
  ctx.bezierCurveTo(
    cx - hw,
    cy - hh * 0.85,
    cx - hw * 0.45,
    cy - hh,
    cx,
    cy - hh * 0.55,
  );
  ctx.bezierCurveTo(
    cx + hw * 0.45,
    cy - hh,
    cx + hw,
    cy - hh * 0.85,
    cx + hw,
    cy - hh * 0.45,
  );
  ctx.bezierCurveTo(
    cx + hw,
    cy - hh * 0.15,
    cx + hw * 0.1,
    cy + hh * 0.1,
    cx,
    cy + hh * 0.35,
  );
  ctx.closePath();
}

function measureMaskTextBlock(
  g: OffscreenCanvasRenderingContext2D,
  t: NonNullable<ResolvedClipMask["text"]>,
  fontSize: number,
  letterSpacingPx: number,
): { width: number; height: number; lineHeight: number; lines: string[] } {
  const lines = t.content.split("\n");
  const lineHeight = (t.lineHeight ?? 1.2) * fontSize;
  let maxW = 0;

  if (letterSpacingPx) {
    for (const line of lines) {
      const chars = [...line];
      let w = 0;
      for (let i = 0; i < chars.length; i++) {
        w += g.measureText(chars[i]!).width;
        if (i < chars.length - 1) w += letterSpacingPx;
      }
      maxW = Math.max(maxW, w);
    }
  } else {
    for (const line of lines) {
      const m = g.measureText(line);
      const left = m.actualBoundingBoxLeft ?? 0;
      const right = m.actualBoundingBoxRight ?? m.width;
      maxW = Math.max(maxW, Math.max(m.width, left + right));
    }
  }

  // Use real ascent/descent when available so tall glyphs fit the box.
  const sample = g.measureText(lines[0] || "Mg");
  const ascent =
    sample.actualBoundingBoxAscent > 0
      ? sample.actualBoundingBoxAscent
      : fontSize * 0.8;
  const descent =
    sample.actualBoundingBoxDescent > 0
      ? sample.actualBoundingBoxDescent
      : fontSize * 0.25;
  const firstLine = ascent + descent;
  const height =
    lines.length <= 1
      ? firstLine
      : firstLine + (lines.length - 1) * lineHeight;

  return {
    width: Math.max(1, maxW),
    height: Math.max(1, height),
    lineHeight,
    lines,
  };
}

function drawTextStamp(
  g: OffscreenCanvasRenderingContext2D,
  mask: ResolvedClipMask,
  scale: number,
  mapX: number,
  mapY: number,
): void {
  const t = mask.text;
  if (!t || !t.content) return;
  const weight = t.fontWeight ?? 700;
  const italic = t.italic ? "italic " : "";
  // Size W×H is the hard bounds; glyphs uniform-scale to fit inside.
  const boxW = Math.max(1, (mask.size?.w ?? 400) * mapX * scale);
  const boxH = Math.max(1, (mask.size?.h ?? 400) * mapY * scale);

  // Probe at box height as em size, then shrink/grow to fit both axes.
  const probe = Math.max(1, boxH);
  const spacingFactor = t.letterSpacing ?? 0;
  const fontCss = `${italic}${weight} ${probe}px ${t.fontFamily}`;
  g.font = fontCss;
  const probeSpacing = spacingFactor * (probe / Math.max(1, t.fontSize || probe));
  const measured = measureMaskTextBlock(g, t, probe, probeSpacing);
  const fit = Math.min(boxW / measured.width, boxH / measured.height);
  const fontSize = Math.max(1, probe * fit);
  const letterSpacingPx =
    spacingFactor * (fontSize / Math.max(1, t.fontSize || fontSize));

  g.font = `${italic}${weight} ${fontSize}px ${t.fontFamily}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffffff";
  if ("textRendering" in g) {
    (g as OffscreenCanvasRenderingContext2D & { textRendering?: string }).textRendering =
      "geometricPrecision";
  }

  const final = measureMaskTextBlock(g, t, fontSize, letterSpacingPx);
  const align = t.align ?? "center";
  const startY = -((final.lines.length - 1) * final.lineHeight) / 2;

  for (let i = 0; i < final.lines.length; i++) {
    const line = final.lines[i]!;
    const y = startY + i * final.lineHeight;
    if (letterSpacingPx) {
      const chars = [...line];
      const widths = chars.map((ch) => g.measureText(ch).width);
      let total = 0;
      for (let c = 0; c < chars.length; c++) {
        total += widths[c]!;
        if (c < chars.length - 1) total += letterSpacingPx;
      }
      let x =
        align === "left"
          ? -final.width / 2
          : align === "right"
            ? final.width / 2 - total
            : -total / 2;
      for (let c = 0; c < chars.length; c++) {
        g.fillText(chars[c]!, x + widths[c]! / 2, y);
        x += widths[c]! + letterSpacingPx;
      }
    } else {
      let x = 0;
      if (align === "left" || align === "right") {
        const w = g.measureText(line).width;
        x = align === "left" ? -final.width / 2 + w / 2 : final.width / 2 - w / 2;
      }
      g.fillText(line, x, y);
    }
  }
}

/**
 * Draw a single mask shape into `g` in pre-transform stage space
 * (origin top-left, clip center at dstW/2,dstH/2). Coordinates already
 * include `scale` (1 for final, PATH_SS for supersampled).
 */
function drawMaskShape(
  g: OffscreenCanvasRenderingContext2D,
  mask: ResolvedClipMask,
  dstW: number,
  dstH: number,
  mapX: number,
  mapY: number,
  layoutScale: number,
  scale: number,
): void {
  const cx = (dstW / 2 + mask.position.x * mapX) * scale;
  const cy = (dstH / 2 + mask.position.y * mapY) * scale;
  const rad = (mask.rotationDeg * Math.PI) / 180;
  const sizeW = (mask.size?.w ?? 400) * mapX * scale;
  const sizeH = (mask.size?.h ?? 400) * mapY * scale;
  const exp = expandPx(mask.expand, layoutScale) * ((mapX + mapY) / 2) * scale;

  g.save();
  g.translate(cx, cy);
  g.rotate(rad);
  g.fillStyle = "#ffffff";

  switch (mask.type) {
    case "split": {
      // Half-plane y <= 0 — oversized rect so edges stay off-screen.
      const big = Math.max(dstW, dstH) * scale * 4;
      g.fillRect(-big, -big, big * 2, big);
      break;
    }
    case "filmstrip": {
      const gap = Math.max(1, mask.stripGap ?? 200) * mapY * scale;
      const half = gap / 2;
      const big = Math.max(dstW, dstH) * scale * 4;
      g.fillRect(-big, -half, big * 2, gap);
      break;
    }
    case "circle": {
      g.beginPath();
      g.ellipse(0, 0, Math.max(0.5, sizeW / 2 + exp), Math.max(0.5, sizeH / 2 + exp), 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "rectangle": {
      const w = sizeW + exp * 2;
      const h = sizeH + exp * 2;
      const cr =
        ((mask.cornerRadius ?? 0) / 100) * Math.min(w, h) * 0.5;
      g.beginPath();
      if (typeof g.roundRect === "function") {
        g.roundRect(-w / 2, -h / 2, w, h, cr);
      } else {
        g.rect(-w / 2, -h / 2, w, h);
      }
      g.fill();
      break;
    }
    case "stars": {
      const r = Math.min(sizeW, sizeH) / 2 + exp;
      drawStarPath(g, 0, 0, r, r * 0.45, 5);
      g.fill();
      break;
    }
    case "heart": {
      drawHeartPath(g, 0, 0, sizeW + exp * 2, sizeH + exp * 2);
      g.fill();
      break;
    }
    case "custom": {
      const pts = ensureMinPoints(mask.points ?? []);
      const scaleX = Math.max(0.5, sizeW / 2 + exp);
      const scaleY = Math.max(0.5, sizeH / 2 + exp);
      buildClosedPath(g, pts, scaleX, scaleY);
      g.fill();
      break;
    }
    case "text":
      drawTextStamp(g, mask, scale, mapX, mapY);
      break;
    default:
      break;
  }

  g.restore();
}

/**
 * Build a white-on-transparent stamp in pre-transform stage pixels.
 * Text/path shapes stay at supersampled resolution and are filtered only
 * when drawn through the clip transform (avoids downsample→upsample blur).
 */
function buildMaskStamp(
  mask: ResolvedClipMask,
  dstW: number,
  dstH: number,
  mapX: number,
  mapY: number,
  layoutScale: number,
  ss: number,
): MaskStamp {
  const key = stampCacheKey(mask, dstW, dstH, mapX, mapY, ss);
  const cached = stampCache.get(key);
  if (cached) return cached;

  const useSs =
    ss > 1 &&
    (mask.type === "text" || mask.type === "stars" || mask.type === "heart");
  const pixelW = useSs ? dstW * ss : dstW;
  const pixelH = useSs ? dstH * ss : dstH;
  const drawScale = useSs ? ss : 1;

  const buf = ensureBuf(useSs ? "hires" : "stamp", pixelW, pixelH);
  const g = buf.ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.clearRect(0, 0, pixelW, pixelH);
  g.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in g) g.imageSmoothingQuality = "high";
  drawMaskShape(g, mask, dstW, dstH, mapX, mapY, layoutScale, drawScale);

  // Feather via blur (in pixel space of this stamp)
  const f =
    featherPx(mask.feather, layoutScale) * ((mapX + mapY) / 2) * drawScale;
  if (f > 0.5) {
    const blurred = ensureBuf("path", pixelW, pixelH);
    blurred.ctx.setTransform(1, 0, 0, 1, 0, 0);
    blurred.ctx.clearRect(0, 0, pixelW, pixelH);
    blurred.ctx.imageSmoothingEnabled = true;
    blurred.ctx.filter = `blur(${(f * 0.5).toFixed(2)}px)`;
    blurred.ctx.drawImage(buf.canvas, 0, 0);
    blurred.ctx.filter = "none";
    g.clearRect(0, 0, pixelW, pixelH);
    g.drawImage(blurred.canvas, 0, 0);
  }

  if (mask.invert) {
    g.globalCompositeOperation = "xor";
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, pixelW, pixelH);
    g.globalCompositeOperation = "source-over";
  }

  const copy = new OffscreenCanvas(pixelW, pixelH);
  const cg = copy.getContext("2d");
  const stamp: MaskStamp = {
    canvas: copy,
    logicalW: dstW,
    logicalH: dstH,
  };
  if (cg) {
    cg.clearRect(0, 0, pixelW, pixelH);
    cg.drawImage(buf.canvas, 0, 0);
    if (stampCache.size > 16) {
      const first = stampCache.keys().next().value;
      if (first) stampCache.delete(first);
    }
    stampCache.set(key, stamp);
  }
  return stamp;
}

function booleanCompositeOp(
  mode: MaskBoolean | undefined,
): GlobalCompositeOperation {
  switch (mode) {
    case "subtract":
      return "destination-out";
    case "intersect":
      return "destination-in";
    case "add":
    default:
      return "source-over";
  }
}

export type MaskTransformParams = {
  cx: number;
  cy: number;
  ox: number;
  oy: number;
  rad: number;
  scaleX: number;
  scaleY: number;
};

/**
 * Apply mask stack onto a full-frame transformed layer scratch (in place).
 * Stamps are built in pre-transform space, then drawn with the same clip
 * transform as the layer so canvas filtering keeps text/path edges crisp.
 */
export function applyMaskStackToCanvas(
  layerCtx: OffscreenCanvasRenderingContext2D,
  dstW: number,
  dstH: number,
  masksEnabled: boolean | null | undefined,
  masks: ResolvedClipMask[] | null | undefined,
  mapX: number,
  mapY: number,
  xf: MaskTransformParams,
): void {
  if (!masksEnabled || !masks || masks.length === 0) return;

  const layoutScale = (mapX + mapY) / 2;
  // Extra samples when the clip is scaled up so glyphs stay sharp after transform.
  const mag = Math.max(Math.abs(xf.scaleX), Math.abs(xf.scaleY), 1);
  const ss = Math.min(6, Math.max(PATH_SS, Math.ceil(PATH_SS * mag)));

  const matte = ensureBuf("matte", dstW, dstH);
  const mg = matte.ctx;
  mg.setTransform(1, 0, 0, 1, 0, 0);
  mg.globalAlpha = 1;
  mg.globalCompositeOperation = "source-over";
  mg.clearRect(0, 0, dstW, dstH);
  mg.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in mg) mg.imageSmoothingQuality = "high";

  for (let i = 0; i < masks.length; i++) {
    const mask = masks[i]!;
    const stamp = buildMaskStamp(mask, dstW, dstH, mapX, mapY, layoutScale, ss);

    mg.save();
    mg.globalCompositeOperation =
      i === 0 ? "copy" : booleanCompositeOp(mask.booleanBlend);
    // Ride with clip: same transform stack as drawTransformed in blit.
    // Map supersampled stamp → logical pre-transform rect, then clip xf.
    mg.translate(xf.cx + xf.ox, xf.cy + xf.oy);
    mg.rotate(xf.rad);
    mg.scale(xf.scaleX, xf.scaleY);
    mg.translate(-xf.cx, -xf.cy);
    mg.drawImage(
      stamp.canvas,
      0,
      0,
      stamp.canvas.width,
      stamp.canvas.height,
      0,
      0,
      stamp.logicalW,
      stamp.logicalH,
    );
    mg.restore();
  }

  layerCtx.save();
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.globalCompositeOperation = "destination-in";
  layerCtx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in layerCtx) {
    layerCtx.imageSmoothingQuality = "high";
  }
  layerCtx.drawImage(matte.canvas, 0, 0);
  layerCtx.restore();
}

export function hasActiveMasks(
  masksEnabled: boolean | null | undefined,
  masks: ResolvedClipMask[] | null | undefined,
): boolean {
  return Boolean(masksEnabled && masks && masks.length > 0);
}
