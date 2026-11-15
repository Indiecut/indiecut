import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { MediaAssetRef } from "../project/types";
import { toArrayBuffer, toUint8Array } from "./bytes";

export type CapturedSourceFrame = {
  /** Object URL for an image/jpeg blob — caller must revoke. */
  url: string;
  width: number;
  height: number;
};

async function canvasToObjectUrl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality = 0.92,
): Promise<{ url: string; width: number; height: number }> {
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const snapshot = new OffscreenCanvas(w, h);
  const ctx = snapshot.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable for frame capture");
  ctx.drawImage(canvas, 0, 0, w, h);

  const blob = await snapshot.convertToBlob({
    type: "image/jpeg",
    quality,
  });
  return { url: URL.createObjectURL(blob), width: w, height: h };
}

async function captureVideoFrame(args: {
  absolutePath: string;
  sourceMs: number;
}): Promise<CapturedSourceFrame> {
  const bridge = window.indiecut;
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }

  const bytes = toUint8Array(await bridge.fs.readFile(args.absolutePath));
  const blob = new Blob([toArrayBuffer(bytes)], { type: "video/mp4" });
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track for crop preview");

    const sink = new CanvasSink(track, { poolSize: 2 });
    const timestampSec = Math.max(0, args.sourceMs / 1000);
    const wrapped = await sink.getCanvas(timestampSec);
    if (!wrapped?.canvas) throw new Error("Could not decode crop preview frame");
    // Must finish the snapshot before dispose — CanvasSink reuses canvases.
    return await canvasToObjectUrl(wrapped.canvas);
  } finally {
    await input.dispose();
  }
}

async function captureImageFrame(args: {
  absolutePath: string;
}): Promise<CapturedSourceFrame> {
  const bridge = window.indiecut;
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }

  const bytes = toUint8Array(await bridge.fs.readFile(args.absolutePath));
  const blob = new Blob([toArrayBuffer(bytes)]);
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(
      Math.max(1, bitmap.width),
      Math.max(1, bitmap.height),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for image capture");
    ctx.drawImage(bitmap, 0, 0);
    return canvasToObjectUrl(canvas);
  } finally {
    bitmap.close();
  }
}

/**
 * Capture a still of the media asset for crop UI.
 * Video uses sourceMs; image loads the full file.
 * Prefer master for accurate crop framing (fall back to proxy).
 */
export async function captureSourceFrame(args: {
  asset: MediaAssetRef;
  projectPath: string;
  sourceMs: number;
}): Promise<CapturedSourceFrame> {
  const { asset, projectPath, sourceMs } = args;
  if (asset.kind === "video") {
    const tryPaths = [asset.path, asset.proxyPath].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    let lastError: unknown = null;
    for (const storedPath of tryPaths) {
      try {
        const abs = resolveMediaAbsolutePath({ projectPath, storedPath });
        return await captureVideoFrame({ absolutePath: abs, sourceMs });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Could not decode crop preview frame");
  }

  const abs = resolveMediaAbsolutePath({
    projectPath,
    storedPath: asset.path,
  });
  return captureImageFrame({ absolutePath: abs });
}
