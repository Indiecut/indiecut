/**
 * Transition samplers — pure sample(frameA, frameB, progress) for preview/export.
 * cross_dissolve, fade_to_black, slide_left/right, flash, circle_wipe.
 */

import type { TransitionParams } from "../project/types";

export type TransitionFrameSource = {
  canvas: CanvasImageSource;
  width: number;
  height: number;
};

export type TransitionSampleResult = {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  width: number;
  height: number;
};

function createCanvas(
  width: number,
  height: number,
): {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2d unavailable");
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  return { canvas, ctx };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function drawCover(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  src: TransitionFrameSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  // Simple stretch into dest rect (A/B already composition-sized when caller prepares).
  ctx.drawImage(src.canvas, 0, 0, src.width, src.height, dx, dy, dw, dh);
  ctx.restore();
}

export function sampleTransition(
  presetId: string,
  frameA: TransitionFrameSource,
  frameB: TransitionFrameSource,
  progress: number,
  params?: Pick<TransitionParams, "direction" | "intensity"> | null,
): TransitionSampleResult {
  const p = Math.min(1, Math.max(0, progress));
  const w = Math.max(frameA.width, frameB.width, 1);
  const h = Math.max(frameA.height, frameB.height, 1);
  const { canvas, ctx } = createCanvas(w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const id = presetId.toLowerCase();
  const intensity = params?.intensity ?? 1;

  if (id === "cross_dissolve" || id === "cinematic_fade") {
    const t = id === "cinematic_fade" ? easeInOut(p) : p;
    drawCover(ctx, frameA, 0, 0, w, h, 1 - t);
    drawCover(ctx, frameB, 0, 0, w, h, t);
    return { canvas, width: w, height: h };
  }

  if (id === "fade_to_black") {
    if (p < 0.5) {
      const a = 1 - p * 2;
      drawCover(ctx, frameA, 0, 0, w, h, a);
    } else {
      const a = (p - 0.5) * 2;
      drawCover(ctx, frameB, 0, 0, w, h, a);
    }
    return { canvas, width: w, height: h };
  }

  if (id === "fade_to_white") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    if (p < 0.5) {
      drawCover(ctx, frameA, 0, 0, w, h, 1 - p * 2);
    } else {
      drawCover(ctx, frameB, 0, 0, w, h, (p - 0.5) * 2);
    }
    return { canvas, width: w, height: h };
  }

  if (id === "slide_left" || id === "slide_right" || id === "slide_up" || id === "slide_down") {
    const dir =
      params?.direction ??
      (id === "slide_left"
        ? "left"
        : id === "slide_right"
          ? "right"
          : id === "slide_up"
            ? "up"
            : "down");
    let ax = 0;
    let ay = 0;
    let bx = 0;
    let by = 0;
    if (dir === "left") {
      ax = -w * p;
      bx = w * (1 - p);
    } else if (dir === "right") {
      ax = w * p;
      bx = -w * (1 - p);
    } else if (dir === "up") {
      ay = -h * p;
      by = h * (1 - p);
    } else {
      ay = h * p;
      by = -h * (1 - p);
    }
    drawCover(ctx, frameA, ax, ay, w, h, 1);
    drawCover(ctx, frameB, bx, by, w, h, 1);
    return { canvas, width: w, height: h };
  }

  if (id === "flash") {
    // Peak white flash mid-transition, then reveal B.
    const flashPeak = 1 - Math.abs(p - 0.5) * 2;
    const flashAmt = flashPeak * intensity;
    if (p < 0.5) {
      drawCover(ctx, frameA, 0, 0, w, h, 1);
    } else {
      drawCover(ctx, frameB, 0, 0, w, h, 1);
    }
    if (flashAmt > 0.01) {
      ctx.save();
      ctx.globalAlpha = flashAmt;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    return { canvas, width: w, height: h };
  }

  if (id === "circle_wipe") {
    drawCover(ctx, frameA, 0, 0, w, h, 1);
    const radius = Math.hypot(w, h) * 0.5 * p;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.max(0.5, radius), 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, frameB, 0, 0, w, h, 1);
    ctx.restore();
    return { canvas, width: w, height: h };
  }

  // Fallback: cross dissolve
  drawCover(ctx, frameA, 0, 0, w, h, 1 - p);
  drawCover(ctx, frameB, 0, 0, w, h, p);
  return { canvas, width: w, height: h };
}

