/// <reference lib="webworker" />

import {
  ALL_FORMATS,
  AudioSampleSink,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import { gifBufferToMp4, isGifFile } from "./gifToMp4";
import { guessKindFromExt } from "./paths";
import {
  createPeakAccumulator,
  finalizePeaks,
  pushInterleavedF32,
} from "./peaks";
import type {
  MediaWorkerRequest,
  MediaWorkerResponse,
  MediaWorkerResultMeta,
} from "./mediaWorkerProtocol";

const IMAGE_STILL_MS = 3000;
const THUMB_MAX = 320;

function post(msg: MediaWorkerResponse, transfer?: Transferable[]) {
  self.postMessage(msg, transfer ?? []);
}

function progress(
  jobId: string,
  assetId: string,
  stage: "probe" | "thumb" | "peaks" | "proxy",
  value: number,
) {
  post({
    type: "progress",
    jobId,
    assetId,
    stage,
    progress: Math.min(1, Math.max(0, value)),
  });
}

async function canvasToJpeg(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality = 0.85,
): Promise<ArrayBuffer> {
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality,
    });
    return blob.arrayBuffer();
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
      "image/jpeg",
      quality,
    );
  });
  return blob.arrayBuffer();
}

async function imageBytesToJpegThumb(
  bytes: ArrayBuffer,
  mime: string,
): Promise<{ jpeg: ArrayBuffer; width: number; height: number }> {
  const blob = new Blob([bytes], { type: mime || "image/*" });
  const bitmap = await createImageBitmap(blob);
  const naturalW = bitmap.width;
  const naturalH = bitmap.height;
  const scale = Math.min(1, THUMB_MAX / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context for image thumb");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const jpeg = await canvasToJpeg(canvas);
  return { jpeg, width: naturalW, height: naturalH };
}

function mimeFromName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/aac",
    m4a: "audio/mp4",
    flac: "audio/flac",
    ogg: "audio/ogg",
  };
  return map[ext] ?? "application/octet-stream";
}

async function processJob(req: MediaWorkerRequest): Promise<void> {
  const { jobId, assetId, fileName, buffer } = req;
  const mime = req.mimeHint || mimeFromName(fileName);
  const guessed = guessKindFromExt(fileName);

  progress(jobId, assetId, "probe", 0.02);

  // GIFs → H.264 MP4 (one loop) so timeline/preview/export use the video path.
  if (isGifFile(fileName, mime)) {
    try {
      progress(jobId, assetId, "proxy", 0.05);
      const converted = await gifBufferToMp4(buffer, (p) => {
        progress(jobId, assetId, "proxy", 0.05 + p * 0.9);
      });
      const meta: MediaWorkerResultMeta = {
        kind: "video",
        durationMs: converted.durationMs,
        width: converted.width,
        height: converted.height,
        codec: "avc",
        hasAudio: false,
      };
      progress(jobId, assetId, "proxy", 1);
      // Import writes this once as media/<id>.mp4 and again as the 720 proxy.
      const master = converted.mp4;
      const thumb = converted.thumbJpeg;
      post(
        {
          type: "success",
          jobId,
          assetId,
          meta,
          thumbJpeg: thumb,
          masterMp4: master,
        },
        [thumb, master],
      );
      return;
    } catch (gifErr) {
      console.warn("GIF→MP4 failed; falling back to still image", gifErr);
      // Fall through to still-image path below.
    }
  }

  // Fast path for images — no MediaBunny Input required.
  if (guessed === "image" || mime.startsWith("image/")) {
    progress(jobId, assetId, "thumb", 0.2);
    const { jpeg, width, height } = await imageBytesToJpegThumb(buffer, mime);
    const meta: MediaWorkerResultMeta = {
      kind: "image",
      durationMs: IMAGE_STILL_MS,
      width,
      height,
      hasAudio: false,
    };
    progress(jobId, assetId, "thumb", 1);
    post(
      {
        type: "success",
        jobId,
        assetId,
        meta,
        thumbJpeg: jpeg,
      },
      [jpeg],
    );
    return;
  }

  const blob = new Blob([buffer], { type: mime });
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });

  try {
    const durationSec = await input.computeDuration();
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    const hasAudio = Boolean(audioTrack);
    const hasVideo = Boolean(videoTrack);

    let kind: MediaWorkerResultMeta["kind"] = "audio";
    if (hasVideo) kind = "video";
    else if (guessed === "video") kind = "video";
    else if (guessed === "audio" || hasAudio) kind = "audio";

    let width: number | undefined;
    let height: number | undefined;
    let codec: string | undefined;

    if (videoTrack) {
      width = await videoTrack.getDisplayWidth();
      height = await videoTrack.getDisplayHeight();
      codec = (await videoTrack.getCodec()) ?? undefined;
    } else if (audioTrack) {
      codec = (await audioTrack.getCodec()) ?? undefined;
    }

    const meta: MediaWorkerResultMeta = {
      kind,
      durationMs: Math.max(0, Math.round(durationSec * 1000)),
      width,
      height,
      codec,
      hasAudio,
    };

    progress(jobId, assetId, "probe", 0.15);

    let thumbJpeg: ArrayBuffer | undefined;
    if (videoTrack) {
      progress(jobId, assetId, "thumb", 0.2);
      const sink = new CanvasSink(videoTrack, {
        width: THUMB_MAX,
        fit: "contain",
        poolSize: 2,
      });
      const stamp = Math.min(0.1, Math.max(0, durationSec * 0.05));
      const wrapped = await sink.getCanvas(stamp);
      if (wrapped?.canvas) {
        thumbJpeg = await canvasToJpeg(wrapped.canvas);
      }
      progress(jobId, assetId, "thumb", 0.35);
    }

    let peaks = undefined;
    if (audioTrack) {
      // Peaks are best-effort — never fail the whole import (thumb/proxy still needed).
      // Prefer AudioSampleSink: AudioBuffer is unavailable in module workers.
      progress(jobId, assetId, "peaks", 0.4);
      try {
        const sampleRate = await audioTrack.getSampleRate();
        const sink = new AudioSampleSink(audioTrack);
        const acc = createPeakAccumulator(sampleRate);
        for await (const sample of sink.samples()) {
          try {
            const channels = sample.numberOfChannels;
            const frames = sample.numberOfFrames;
            const interleaved = new Float32Array(frames * channels);
            sample.copyTo(interleaved, { planeIndex: 0, format: "f32" });
            pushInterleavedF32(acc, interleaved, channels);
          } finally {
            sample.close();
          }
        }
        peaks = finalizePeaks(acc);
      } catch (peaksErr) {
        console.warn("Peaks generation skipped", peaksErr);
      }
      progress(jobId, assetId, "peaks", 0.55);
    }

    let proxyMp4: ArrayBuffer | undefined;
    if (kind === "video" && videoTrack) {
      progress(jobId, assetId, "proxy", 0.6);

      // Fresh Input for Conversion (same blob source).
      const proxyInput = new Input({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      });
      try {
        const target = new BufferTarget();
        const output = new Output({
          format: new Mp4OutputFormat(),
          target,
        });

        // Preserve source aspect (max edge 1280) — do not force 16:9 letterboxing.
        const srcW = Math.max(1, width ?? 1280);
        const srcH = Math.max(1, height ?? 720);
        const maxEdge = 1280;
        const proxyW =
          srcW >= srcH
            ? maxEdge
            : Math.max(2, Math.round((maxEdge * srcW) / srcH));
        const proxyH =
          srcH > srcW
            ? maxEdge
            : Math.max(2, Math.round((maxEdge * srcH) / srcW));
        // Even dimensions help some encoders.
        const evenW = proxyW % 2 === 0 ? proxyW : proxyW + 1;
        const evenH = proxyH % 2 === 0 ? proxyH : proxyH + 1;

        const conversion = await Conversion.init({
          input: proxyInput,
          output,
          video: {
            width: evenW,
            height: evenH,
            fit: "fill",
            codec: "avc",
            quality: new Quality("medium"),
            frameRate: 30,
          },
          audio: hasAudio
            ? {
                codec: "aac",
                quality: new Quality({ bitrate: 128_000 }),
                numberOfChannels: 2,
                sampleRate: 48000,
              }
            : { discard: true },
        });

        conversion.onProgress = (p) => {
          progress(jobId, assetId, "proxy", 0.6 + p * 0.35);
        };

        if (!conversion.isValid) {
          console.warn("Proxy conversion invalid", conversion.discardedTracks);
        } else {
          try {
            await conversion.execute();
            if (target.buffer) proxyMp4 = target.buffer;
          } catch (convErr) {
            // Retry video-only if audio encode path fails in the worker.
            console.warn("Proxy with audio failed; retrying video-only", convErr);
            const retryInput = new Input({
              source: new BlobSource(blob),
              formats: ALL_FORMATS,
            });
            try {
              const retryTarget = new BufferTarget();
              const retryOutput = new Output({
                format: new Mp4OutputFormat(),
                target: retryTarget,
              });
              const retry = await Conversion.init({
                input: retryInput,
                output: retryOutput,
                video: {
                  width: evenW,
                  height: evenH,
                  fit: "fill",
                  codec: "avc",
                  quality: new Quality("medium"),
                  frameRate: 30,
                },
                audio: { discard: true },
              });
              if (retry.isValid) {
                await retry.execute();
                if (retryTarget.buffer) proxyMp4 = retryTarget.buffer;
              }
            } finally {
              retryInput.dispose();
            }
          }
        }
      } finally {
        proxyInput.dispose();
      }
      progress(jobId, assetId, "proxy", 1);
    } else {
      progress(jobId, assetId, "peaks", 1);
    }

    const transfer: Transferable[] = [];
    if (thumbJpeg) transfer.push(thumbJpeg);
    if (proxyMp4) transfer.push(proxyMp4);

    post(
      {
        type: "success",
        jobId,
        assetId,
        meta,
        thumbJpeg,
        peaks,
        proxyMp4,
      },
      transfer,
    );
  } finally {
    input.dispose();
  }
}

self.onmessage = (event: MessageEvent<MediaWorkerRequest>) => {
  const data = event.data;
  if (!data || data.type !== "process") return;
  void processJob(data).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    post({
      type: "failure",
      jobId: data.jobId,
      assetId: data.assetId,
      error: message,
    });
  });
};
