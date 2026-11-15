import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

const MAX_EDGE = 1280;
/** GIF delay 0 is commonly treated as ~100ms. */
const DEFAULT_FRAME_SEC = 0.1;
const MIN_FRAME_SEC = 1 / 100;

export type GifToMp4Result = {
  mp4: ArrayBuffer;
  width: number;
  height: number;
  durationMs: number;
  thumbJpeg: ArrayBuffer;
};

function even(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v + 1;
}

function fitSize(srcW: number, srcH: number): { w: number; h: number } {
  const maxEdge = Math.max(srcW, srcH);
  const scale = maxEdge > MAX_EDGE ? MAX_EDGE / maxEdge : 1;
  return {
    w: even(srcW * scale),
    h: even(srcH * scale),
  };
}

async function canvasToJpeg(
  canvas: OffscreenCanvas,
  quality = 0.85,
): Promise<ArrayBuffer> {
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality,
  });
  return blob.arrayBuffer();
}

function frameDurationSec(frame: VideoFrame): number {
  const us = frame.duration;
  if (us == null || us <= 0) return DEFAULT_FRAME_SEC;
  return Math.max(MIN_FRAME_SEC, us / 1_000_000);
}

/**
 * Decode an animated (or still) GIF via WebCodecs ImageDecoder and encode one
 * playthrough as H.264 MP4 with MediaBunny CanvasSource.
 * Transparent pixels are composited on black.
 */
export async function gifBufferToMp4(
  buffer: ArrayBuffer,
  onProgress?: (progress: number) => void,
): Promise<GifToMp4Result> {
  if (typeof ImageDecoder === "undefined") {
    throw new Error("ImageDecoder is unavailable in this runtime");
  }

  const decoder = new ImageDecoder({ data: buffer, type: "image/gif" });
  try {
    await decoder.tracks.ready;
    await decoder.completed.catch(() => undefined);

    const track = decoder.tracks.selectedTrack;
    if (!track) throw new Error("GIF has no selected track");
    const frameCount = Math.max(1, track.frameCount || 1);

    const first = await decoder.decode({ frameIndex: 0 });
    const srcW = Math.max(1, first.image.displayWidth || first.image.codedWidth);
    const srcH = Math.max(
      1,
      first.image.displayHeight || first.image.codedHeight,
    );
    const { w: outW, h: outH } = fitSize(srcW, srcH);

    const canvas = new OffscreenCanvas(outW, outH);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No 2d context for GIF encode");

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat(),
      target,
    });
    const videoSource = new CanvasSource(canvas, {
      codec: "avc",
      quality: new Quality("medium"),
      hardwareAcceleration: "no-preference",
    });
    // Approximate fps from first frame for container metadata; per-frame
    // durations are still passed to add().
    const approxFps = Math.min(
      50,
      Math.max(1, Math.round(1 / frameDurationSec(first.image))),
    );
    output.addVideoTrack(videoSource, { frameRate: approxFps });
    await output.start();

    let timestampSec = 0;
    let thumbJpeg: ArrayBuffer | undefined;

    for (let i = 0; i < frameCount; i++) {
      const decoded =
        i === 0 ? first : await decoder.decode({ frameIndex: i });
      const frame = decoded.image;
      try {
        const durSec = frameDurationSec(frame);
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(frame, 0, 0, outW, outH);

        if (i === 0) {
          const thumbScale = Math.min(1, 320 / Math.max(outW, outH));
          const tw = Math.max(1, Math.round(outW * thumbScale));
          const th = Math.max(1, Math.round(outH * thumbScale));
          const thumbCanvas = new OffscreenCanvas(tw, th);
          const tctx = thumbCanvas.getContext("2d");
          if (!tctx) throw new Error("No 2d context for GIF thumb");
          tctx.drawImage(canvas, 0, 0, tw, th);
          thumbJpeg = await canvasToJpeg(thumbCanvas);
        }

        await videoSource.add(timestampSec, durSec);
        timestampSec += durSec;
      } finally {
        frame.close();
      }

      onProgress?.(frameCount <= 1 ? 1 : (i + 1) / frameCount);
      if (i % 4 === 3) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }

    videoSource.close();
    await output.finalize();

    if (!target.buffer || target.buffer.byteLength === 0) {
      throw new Error("GIF→MP4 produced an empty buffer");
    }
    if (!thumbJpeg) {
      throw new Error("GIF→MP4 missing thumbnail");
    }

    return {
      mp4: target.buffer,
      width: srcW,
      height: srcH,
      durationMs: Math.max(1, Math.round(timestampSec * 1000)),
      thumbJpeg,
    };
  } finally {
    try {
      decoder.close();
    } catch {
      /* ignore */
    }
  }
}

export function isGifFile(fileName: string, mimeHint?: string): boolean {
  if (mimeHint?.toLowerCase() === "image/gif") return true;
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return base.toLowerCase().endsWith(".gif");
}
