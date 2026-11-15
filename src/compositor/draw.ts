import {
  blendChannel,
  blendModeToCompositeOperation,
  needsPixelBlend,
  resolveBlendMode,
  resolveOpacity,
} from "./blend";
import { applyColorAdjust, needsColorAdjust } from "./colorAdjust";
import { applyLut, needsLut, type CubeLut } from "../engine/lutCube";
import {
  applyMaskStackToCanvas,
  hasActiveMasks,
} from "./mask";
import {
  applyRemoveBgColor,
  needsRemoveBgColor,
} from "./removeBgColor";
import { applyCropToCanvas, isFullCrop } from "./crop";
import { bakePlane3D } from "./plane3d";
import { computeFittedRect, resolveTransform } from "./transform";
import type {
  CompositorDrawContext,
  CompositorFit,
  CompositorLayerSource,
} from "./types";
import type {
  ResolvedTransform,
  ResolvedTransform3D,
} from "../engine/animatable";
import type {
  BlendMode,
  CropRect,
  RemoveBgParams,
  ResolvedClipMask,
  ResolvedColorAdjust,
} from "../project/types";
import type { FittedRect } from "./transform";

/**
 * Shared compositor blit — preview worker and export call the same path.
 * Time is supplied by the caller; never reads Date.now() / performance.now().
 * Layout: contain/cover base rect + clip transform; blend + opacity via
 * canvas GCO or pixel path (EDITOR_MATH.md §2).
 * Order: decode → color adjust → LUT → remove BG → crop → transform → mask → blend.
 */

type Scratch = {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
};

let scratchBase: Scratch | null = null;
let scratchSrc: Scratch | null = null;

function ensureScratch(
  slot: "base" | "src",
  w: number,
  h: number,
): Scratch {
  const existing = slot === "base" ? scratchBase : scratchSrc;
  if (!existing || existing.canvas.width !== w || existing.canvas.height !== h) {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: slot === "src" });
    if (!ctx) throw new Error("Compositor scratch 2D unavailable");
    const next = { canvas, ctx };
    if (slot === "base") scratchBase = next;
    else scratchSrc = next;
    return next;
  }
  return existing;
}

function drawTransformed(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  drawSource: CanvasImageSource,
  fitted: FittedRect,
  cx: number,
  cy: number,
  ox: number,
  oy: number,
  rad: number,
  applyScaleX: number,
  applyScaleY: number,
): void {
  g.translate(cx + ox, cy + oy);
  g.rotate(rad);
  g.scale(applyScaleX, applyScaleY);
  g.translate(-cx, -cy);
  g.drawImage(drawSource, fitted.dx, fitted.dy, fitted.drawW, fitted.drawH);
}

function prepareTransformedLayer(
  dstW: number,
  dstH: number,
  drawSource: CanvasImageSource,
  fitted: FittedRect,
  cx: number,
  cy: number,
  ox: number,
  oy: number,
  rad: number,
  applyScaleX: number,
  applyScaleY: number,
  mapX: number,
  mapY: number,
  masksEnabled: boolean | null | undefined,
  masks: ResolvedClipMask[] | null | undefined,
): Scratch {
  const src = ensureScratch("src", dstW, dstH);
  src.ctx.setTransform(1, 0, 0, 1, 0, 0);
  src.ctx.clearRect(0, 0, dstW, dstH);
  src.ctx.save();
  src.ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in src.ctx) {
    src.ctx.imageSmoothingQuality = "high";
  }
  drawTransformed(
    src.ctx,
    drawSource,
    fitted,
    cx,
    cy,
    ox,
    oy,
    rad,
    applyScaleX,
    applyScaleY,
  );
  src.ctx.restore();

  if (hasActiveMasks(masksEnabled, masks)) {
    applyMaskStackToCanvas(
      src.ctx,
      dstW,
      dstH,
      masksEnabled,
      masks,
      mapX,
      mapY,
      {
        cx,
        cy,
        ox,
        oy,
        rad,
        scaleX: applyScaleX,
        scaleY: applyScaleY,
      },
    );
  }

  return src;
}

function composePixelBlendFromScratch(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dstW: number,
  dstH: number,
  mode: BlendMode,
  alpha: number,
  src: Scratch,
): void {
  const destData = g.getImageData(0, 0, dstW, dstH);
  const srcData = src.ctx.getImageData(0, 0, dstW, dstH);
  const dd = destData.data;
  const sd = srcData.data;
  const n = dd.length;

  for (let i = 0; i < n; i += 4) {
    const sa = sd[i + 3]! / 255;
    if (sa < 1e-4) continue;
    const ea = alpha * sa;
    if (ea < 1e-4) continue;

    const aR = sd[i]! / 255;
    const aG = sd[i + 1]! / 255;
    const aB = sd[i + 2]! / 255;
    const bR = dd[i]! / 255;
    const bG = dd[i + 1]! / 255;
    const bB = dd[i + 2]! / 255;

    const r = blendChannel(mode, aR, bR);
    const gch = blendChannel(mode, aG, bG);
    const bch = blendChannel(mode, aB, bB);

    dd[i] = Math.round(((1 - ea) * bR + ea * r) * 255);
    dd[i + 1] = Math.round(((1 - ea) * bG + ea * gch) * 255);
    dd[i + 2] = Math.round(((1 - ea) * bB + ea * bch) * 255);
  }

  g.putImageData(destData, 0, 0);
}

export function draw(ctx: CompositorDrawContext): void {
  const { ctx: g, width, height, fit } = ctx;
  const layoutW = ctx.layoutWidth && ctx.layoutWidth > 0 ? ctx.layoutWidth : width;
  const layoutH =
    ctx.layoutHeight && ctx.layoutHeight > 0 ? ctx.layoutHeight : height;
  g.save();
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  if (ctx.clear !== false) {
    g.fillStyle = "#000000";
    g.fillRect(0, 0, width, height);
  }

  const layers: CompositorLayerSource[] = ctx.layers ?? [];

  for (const layer of layers) {
    const placement = layer.placement === "native" ? "native" : "frame";
    if (layer.frame) {
      blit(
        g,
        layer.frame.canvas,
        layer.frame.width,
        layer.frame.height,
        width,
        height,
        layoutW,
        layoutH,
        fit,
        layer.transform,
        layer.blendMode,
        layer.opacity,
        layer.adjust,
        layer.filter,
        layer.lut,
        placement,
        layer.layoutSize,
        layer.masksEnabled,
        layer.masks,
        layer.removeBg,
        layer.crop,
        layer.transform3d,
      );
    } else if (layer.image) {
      const img = layer.image;
      const iw =
        "width" in img && typeof img.width === "number" ? img.width : width;
      const ih =
        "height" in img && typeof img.height === "number" ? img.height : height;
      blit(
        g,
        img,
        iw,
        ih,
        width,
        height,
        layoutW,
        layoutH,
        fit,
        layer.transform,
        layer.blendMode,
        layer.opacity,
        layer.adjust,
        layer.filter,
        layer.lut,
        placement,
        layer.layoutSize,
        layer.masksEnabled,
        layer.masks,
        layer.removeBg,
        layer.crop,
        layer.transform3d,
      );
    }
  }

  g.restore();
}

function blit(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  layoutW: number,
  layoutH: number,
  fit: CompositorFit,
  transform?: ResolvedTransform | null,
  blendMode?: BlendMode | null,
  opacity?: number | null,
  adjust?: ResolvedColorAdjust | null,
  filter?: { lutId?: string; strength?: number } | null,
  lut?: CubeLut | null,
  placement: "frame" | "native" = "frame",
  layoutSize?: { width: number; height: number } | null,
  masksEnabled?: boolean | null,
  masks?: ResolvedClipMask[] | null,
  removeBg?: RemoveBgParams | null,
  crop?: CropRect | null,
  transform3d?: ResolvedTransform3D | null,
): void {
  let drawSource: CanvasImageSource = source;
  let drawW = srcW;
  let drawH = srcH;

  if (needsColorAdjust(adjust)) {
    const adjusted = applyColorAdjust(source, srcW, srcH, adjust);
    drawSource = adjusted.canvas;
    drawW = adjusted.width;
    drawH = adjusted.height;
  }

  if (lut && needsLut(filter)) {
    const graded = applyLut(
      drawSource,
      drawW,
      drawH,
      lut,
      filter?.strength ?? 1,
    );
    drawSource = graded.canvas;
    drawW = graded.width;
    drawH = graded.height;
  }

  if (needsRemoveBgColor(removeBg)) {
    const keyedOut = applyRemoveBgColor(
      drawSource,
      drawW,
      drawH,
      removeBg.color,
    );
    drawSource = keyedOut.canvas;
    drawW = keyedOut.width;
    drawH = keyedOut.height;
  }

  if (!isFullCrop(crop)) {
    const cropped = applyCropToCanvas(drawSource, drawW, drawH, crop);
    drawSource = cropped.canvas;
    drawW = cropped.width;
    drawH = cropped.height;
  }

  // Opt-in 3D plane: only bake when the user has actually tilted/pushed the
  // plane. Identity (0,0,0 / z=0) keeps the normal 2D blit so Enable 3D alone
  // does not change the look.
  if (transform3d?.enabled) {
    const hasTilt =
      Math.abs(transform3d.rotateX) > 1e-3 ||
      Math.abs(transform3d.rotateY) > 1e-3 ||
      Math.abs(transform3d.rotateZ) > 1e-3 ||
      Math.abs(transform3d.z) > 1e-3;
    if (hasTilt) {
      const baked = bakePlane3D({
        source: drawSource,
        srcW: drawW,
        srcH: drawH,
        dstW,
        dstH,
        layoutW,
        layoutH,
        fit,
        transform,
        transform3d,
        placement,
        layoutSize,
      });
      if (baked) {
        const mode = resolveBlendMode(blendMode);
        const alpha = resolveOpacity(opacity);
        if (alpha <= 1e-4) return;
        g.save();
        g.imageSmoothingEnabled = true;
        if ("imageSmoothingQuality" in g) {
          g.imageSmoothingQuality = "high";
        }
        g.globalCompositeOperation = blendModeToCompositeOperation(mode);
        g.globalAlpha = mode === "normal" ? alpha : 1;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(baked.canvas, 0, 0);
        g.restore();
        return;
      }
      // Fall through to 2D if WebGL unavailable.
    }
  }

  const t = resolveTransform(transform);
  const scaleX = t.uniformScale !== false ? t.scaleX : t.scaleX;
  const scaleY = t.uniformScale !== false ? t.scaleX : t.scaleY;
  const mapX = dstW / layoutW;
  const mapY = dstH / layoutH;

  let fitted;
  let applyScaleX = scaleX;
  let applyScaleY = scaleY;
  if (placement === "native") {
    if (layoutSize && layoutSize.width > 0 && layoutSize.height > 0) {
      const nativeW = layoutSize.width * scaleX * mapX;
      const nativeH = layoutSize.height * scaleY * mapY;
      fitted = {
        drawW: nativeW,
        drawH: nativeH,
        dx: (dstW - nativeW) / 2,
        dy: (dstH - nativeH) / 2,
      };
      applyScaleX = 1;
      applyScaleY = 1;
    } else {
      const nativeW = drawW * mapX;
      const nativeH = drawH * mapY;
      fitted = {
        drawW: nativeW,
        drawH: nativeH,
        dx: (dstW - nativeW) / 2,
        dy: (dstH - nativeH) / 2,
      };
    }
  } else {
    fitted = computeFittedRect(drawW, drawH, dstW, dstH, fit);
  }
  if (!fitted) return;

  const cx = dstW / 2;
  const cy = dstH / 2;
  const ox = t.x * mapX;
  const oy = t.y * mapY;
  const rad = (t.rotation * Math.PI) / 180;
  const mode = resolveBlendMode(blendMode);
  const alpha = resolveOpacity(opacity);
  if (alpha <= 1e-4) return;

  const masked = hasActiveMasks(masksEnabled, masks);

  g.save();
  g.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in g) {
    g.imageSmoothingQuality = "high";
  }

  const keyed = needsRemoveBgColor(removeBg);
  // When masked, keyed, or pixel blend, render through a scratch so alpha survives.
  if (masked || keyed || needsPixelBlend(mode)) {
    const src = prepareTransformedLayer(
      dstW,
      dstH,
      drawSource,
      fitted,
      cx,
      cy,
      ox,
      oy,
      rad,
      applyScaleX,
      applyScaleY,
      mapX,
      mapY,
      masksEnabled,
      masks,
    );

    if (needsPixelBlend(mode)) {
      composePixelBlendFromScratch(g, dstW, dstH, mode, alpha, src);
      g.restore();
      return;
    }

    if (alpha < 1 - 1e-4 && mode !== "normal") {
      const base = ensureScratch("base", dstW, dstH);
      base.ctx.setTransform(1, 0, 0, 1, 0, 0);
      base.ctx.globalAlpha = 1;
      base.ctx.globalCompositeOperation = "copy";
      base.ctx.drawImage(g.canvas as OffscreenCanvas | HTMLCanvasElement, 0, 0);
      base.ctx.globalCompositeOperation = "source-over";

      g.globalCompositeOperation = blendModeToCompositeOperation(mode);
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(src.canvas, 0, 0);

      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1 - alpha;
      g.drawImage(base.canvas, 0, 0);
      g.restore();
      return;
    }

    g.globalCompositeOperation = blendModeToCompositeOperation(mode);
    g.globalAlpha = mode === "normal" ? alpha : 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(src.canvas, 0, 0);
    g.restore();
    return;
  }

  // Fast path — no mask
  if (alpha < 1 - 1e-4 && mode !== "normal") {
    const base = ensureScratch("base", dstW, dstH);
    base.ctx.setTransform(1, 0, 0, 1, 0, 0);
    base.ctx.globalAlpha = 1;
    base.ctx.globalCompositeOperation = "copy";
    base.ctx.drawImage(g.canvas as OffscreenCanvas | HTMLCanvasElement, 0, 0);
    base.ctx.globalCompositeOperation = "source-over";

    g.globalCompositeOperation = blendModeToCompositeOperation(mode);
    g.globalAlpha = 1;
    g.save();
    drawTransformed(
      g,
      drawSource,
      fitted,
      cx,
      cy,
      ox,
      oy,
      rad,
      applyScaleX,
      applyScaleY,
    );
    g.restore();

    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1 - alpha;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(base.canvas, 0, 0);
    g.restore();
    return;
  }

  g.globalCompositeOperation = blendModeToCompositeOperation(mode);
  g.globalAlpha = mode === "normal" ? alpha : 1;
  drawTransformed(
    g,
    drawSource,
    fitted,
    cx,
    cy,
    ox,
    oy,
    rad,
    applyScaleX,
    applyScaleY,
  );
  g.restore();
}
