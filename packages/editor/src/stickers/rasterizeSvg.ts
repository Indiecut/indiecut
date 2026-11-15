import { getKineticSticker } from "./kinetic";
import { generateKineticStickerSvg } from "./kinetic/generateSvg";
import { STICKER_RASTER_SIZE } from "./manifest";
import {
  DEFAULT_STICKER_BACKING,
  DEFAULT_STICKER_PALETTE,
  DEFAULT_STICKER_STROKE,
  stickerStyleFingerprint,
  toKineticRenderOptions,
} from "./stickerStyle";
import type { StickerStyleParams } from "../project/types";

const pngCache = new Map<string, ArrayBuffer>();
const bitmapCache = new Map<string, ImageBitmap>();

function cacheKey(
  stickerId: string,
  style: StickerStyleParams | null | undefined,
  size: number,
): string {
  return `${stickerId}|${stickerStyleFingerprint(style)}|${size}`;
}

function canvasToPngBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error("sticker toBlob failed"));
          return;
        }
        void b.arrayBuffer().then(resolve, reject);
      },
      "image/png",
    );
  });
}

function assertHasVisiblePixels(
  ctx: CanvasRenderingContext2D,
  size: number,
  label: string,
): void {
  const step = Math.max(1, Math.floor(size / 8));
  for (let y = step; y < size; y += step) {
    for (let x = step; x < size; x += step) {
      if (ctx.getImageData(x, y, 1, 1).data[3]! >= 8) return;
    }
  }
  throw new Error(`sticker raster blank (${label})`);
}

async function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  if (img.naturalWidth < 1 || img.naturalHeight < 1) {
    throw new Error("sticker image has no intrinsic size");
  }
  return img;
}

async function svgStringToCanvas(
  svg: string,
  size: number,
): Promise<HTMLCanvasElement> {
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await loadHtmlImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for sticker rasterize");
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  assertHasVisiblePixels(ctx, size, "kinetic");
  return canvas;
}

function resolveStyle(
  style?: StickerStyleParams | null,
): StickerStyleParams {
  return {
    paletteKey: style?.paletteKey ?? DEFAULT_STICKER_PALETTE,
    backingMode: style?.backingMode ?? DEFAULT_STICKER_BACKING,
    strokeScale: style?.strokeScale ?? DEFAULT_STICKER_STROKE,
  };
}

function svgForSticker(
  stickerId: string,
  style?: StickerStyleParams | null,
  size = STICKER_RASTER_SIZE,
): string {
  const def = getKineticSticker(stickerId);
  if (!def) throw new Error(`Unknown sticker ${stickerId}`);
  return generateKineticStickerSvg(def, {
    ...toKineticRenderOptions(resolveStyle(style)),
    size,
  });
}

/**
 * Rasterize a kinetic sticker to PNG (export / legacy buffer path).
 * Cached by stickerId + style + size — not recreated every seek.
 */
export async function rasterizeStickerToPngBuffer(
  stickerId: string,
  style?: StickerStyleParams | null,
  size = STICKER_RASTER_SIZE,
): Promise<ArrayBuffer> {
  const key = cacheKey(stickerId, style, size);
  const cached = pngCache.get(key);
  if (cached) return cached.slice(0);

  const canvas = await svgStringToCanvas(svgForSticker(stickerId, style, size), size);
  const png = await canvasToPngBuffer(canvas);
  pngCache.set(key, png);
  return png.slice(0);
}

/**
 * Rasterize sticker to ImageBitmap on the main thread (transferable to workers).
 * Cached by stickerId + style + size.
 */
export async function rasterizeStickerToImageBitmap(
  stickerId: string,
  style?: StickerStyleParams | null,
  size = STICKER_RASTER_SIZE,
): Promise<ImageBitmap> {
  const key = cacheKey(stickerId, style, size);
  const cached = bitmapCache.get(key);
  if (cached) {
    return createImageBitmap(cached);
  }
  const canvas = await svgStringToCanvas(svgForSticker(stickerId, style, size), size);
  const bitmap = await createImageBitmap(canvas);
  bitmapCache.set(key, bitmap);
  return createImageBitmap(bitmap);
}

/** Data-URL for library thumbs (default style). */
export function stickerThumbDataUrl(stickerId: string, size = 128): string {
  const svg = svgForSticker(stickerId, null, size);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** @deprecated */
export async function rasterizeSvgToPngBuffer(
  _svgBuffer: ArrayBuffer,
  size = STICKER_RASTER_SIZE,
): Promise<ArrayBuffer> {
  void _svgBuffer;
  void size;
  throw new Error("rasterizeSvgToPngBuffer is removed — use rasterizeStickerToPngBuffer(stickerId)");
}
