/**
 * Video effect samplers — blur / grain / vignette / shake.
 * Applied as post-process on the composed stack below (effect tracks).
 */

export type EffectSampleResult = {
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
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("OffscreenCanvas 2d unavailable");
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d unavailable");
  return { canvas, ctx };
}

function hashNoise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Apply effect to a full-frame source buffer.
 * `localMs` drives time-varying FX (shake); `intensity` is 0–1.
 */
export function sampleEffect(
  effectId: string,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  localMs: number,
  intensity = 1,
): EffectSampleResult {
  const amt = Math.min(1, Math.max(0, intensity));
  const { canvas, ctx } = createCanvas(srcW, srcH);
  const id = effectId.toLowerCase();

  if (amt <= 1e-4 || id === "none") {
    ctx.drawImage(source, 0, 0, srcW, srcH);
    return { canvas, width: srcW, height: srcH };
  }

  if (id === "blur") {
    const px = 1 + amt * 12;
    ctx.filter = `blur(${px.toFixed(2)}px)`;
    ctx.drawImage(source, 0, 0, srcW, srcH);
    ctx.filter = "none";
    // Mix with original for strength control
    if (amt < 0.999) {
      ctx.globalAlpha = 1 - amt;
      ctx.drawImage(source, 0, 0, srcW, srcH);
      ctx.globalAlpha = 1;
    }
    return { canvas, width: srcW, height: srcH };
  }

  if (id === "shake") {
    const t = localMs / 1000;
    const mag = amt * 18;
    const ox = Math.sin(t * 42.7) * mag + Math.sin(t * 17.3) * mag * 0.4;
    const oy = Math.cos(t * 37.1) * mag + Math.cos(t * 11.9) * mag * 0.35;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, srcW, srcH);
    ctx.drawImage(source, ox, oy, srcW, srcH);
    return { canvas, width: srcW, height: srcH };
  }

  if (id === "vignette") {
    ctx.drawImage(source, 0, 0, srcW, srcH);
    const g = ctx.createRadialGradient(
      srcW / 2,
      srcH / 2,
      Math.min(srcW, srcH) * (0.35 - amt * 0.15),
      srcW / 2,
      srcH / 2,
      Math.hypot(srcW, srcH) * 0.55,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${(0.75 * amt).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, srcW, srcH);
    return { canvas, width: srcW, height: srcH };
  }

  if (id === "grain") {
    ctx.drawImage(source, 0, 0, srcW, srcH);
    const image = ctx.getImageData(0, 0, srcW, srcH);
    const d = image.data;
    const seed = Math.floor(localMs / 33) % 1000;
    const strength = amt * 48;
    // Subsample noise for speed — every 2nd pixel, copy to neighbor
    for (let y = 0; y < srcH; y += 2) {
      for (let x = 0; x < srcW; x += 2) {
        const n = (hashNoise(x, y, seed) - 0.5) * strength;
        for (let dy = 0; dy < 2 && y + dy < srcH; dy++) {
          for (let dx = 0; dx < 2 && x + dx < srcW; dx++) {
            const i = ((y + dy) * srcW + (x + dx)) * 4;
            d[i] = Math.min(255, Math.max(0, d[i]! + n));
            d[i + 1] = Math.min(255, Math.max(0, d[i + 1]! + n));
            d[i + 2] = Math.min(255, Math.max(0, d[i + 2]! + n));
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    return { canvas, width: srcW, height: srcH };
  }

  ctx.drawImage(source, 0, 0, srcW, srcH);
  return { canvas, width: srcW, height: srcH };
}
