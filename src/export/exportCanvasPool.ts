/**
 * Reusable OffscreenCanvases for export decode/composite.
 * Acquire while a frame is being built; releaseAll after it is encoded.
 */

type PooledCanvas = {
  canvas: OffscreenCanvas;
  inUse: boolean;
};

const pool: PooledCanvas[] = [];

export function acquireExportCanvas(w: number, h: number): OffscreenCanvas {
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));

  for (const entry of pool) {
    if (entry.inUse) continue;
    entry.inUse = true;
    if (entry.canvas.width !== width || entry.canvas.height !== height) {
      entry.canvas.width = width;
      entry.canvas.height = height;
    }
    return entry.canvas;
  }

  const canvas = new OffscreenCanvas(width, height);
  pool.push({ canvas, inUse: true });
  return canvas;
}

export function releaseExportCanvas(canvas: OffscreenCanvas): void {
  for (const entry of pool) {
    if (entry.canvas === canvas) {
      entry.inUse = false;
      return;
    }
  }
}

export function releaseAllExportCanvases(): void {
  for (const entry of pool) {
    entry.inUse = false;
  }
}

export function clearExportCanvasPool(): void {
  pool.length = 0;
}
