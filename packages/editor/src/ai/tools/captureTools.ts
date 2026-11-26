import { sourceMsAtLocal } from "../../engine/speedRemap";
import { findClipInTracks } from "../../engine/timelineOps";
import { toArrayBuffer, toUint8Array } from "../../media/bytes";
import { captureSourceFrame } from "../../media/captureSourceFrame";
import { capturePreviewComposite } from "../../preview/previewWorkerClient";
import { getEditorStore } from "../../store/editorStore";
import type { ToolResult } from "./types";

const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_QUALITY = 0.85;
const MAX_WIDTH_CAP = 1920;

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseCaptureQuality(input: Record<string, unknown>): {
  maxWidth: number;
  quality: number;
} {
  let maxWidth = DEFAULT_MAX_WIDTH;
  if (typeof input.maxWidth === "number" && Number.isFinite(input.maxWidth)) {
    maxWidth = Math.min(MAX_WIDTH_CAP, Math.max(64, Math.round(input.maxWidth)));
  }
  let quality = DEFAULT_QUALITY;
  if (typeof input.quality === "number" && Number.isFinite(input.quality)) {
    quality = Math.min(1, Math.max(0.1, input.quality));
  }
  return { maxWidth, quality };
}

/**
 * Agent tool: composite snapshot at playhead with configurable width/quality.
 */
export async function executeStageCaptureFrame(
  input: Record<string, unknown>,
  _signal?: AbortSignal,
): Promise<ToolResult> {
  const playheadMs = getEditorStore().project.playheadMs;
  const { maxWidth, quality } = parseCaptureQuality(input);

  try {
    const captured = await capturePreviewComposite({
      maxWidth,
      quality,
      mimeType: "image/jpeg",
    });
    const mediaType =
      captured.mimeType === "image/webp" ? "image/webp" : "image/jpeg";
    const base64 = bufferToBase64(captured.buffer);
    const meta = {
      kind: "composite" as const,
      playheadMs,
      width: captured.width,
      height: captured.height,
      mimeType: captured.mimeType,
      maxWidth,
      quality,
    };
    return {
      ok: true,
      summary: `Captured ${captured.width}×${captured.height} @ ${Math.round(playheadMs)}ms`,
      data: meta,
      contentBlocks: [
        {
          type: "text",
          text: JSON.stringify(meta),
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64,
          },
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "capture failed";
    return {
      ok: false,
      summary: `Capture failed: ${message}`,
      data: { error: "capture_failed", message },
    };
  }
}

export type SourceFrameCapture = {
  ok: true;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  mimeType: "image/jpeg";
  meta: {
    kind: "source";
    playheadMs: number;
    mediaTimeMs: number;
    width: number;
    height: number;
    mimeType: "image/jpeg";
    clipId?: string;
    mediaId: string;
    maxWidth: number;
    quality: number;
  };
};

/**
 * Decode a source media/clip frame to JPEG bytes (for tools + image edit plates).
 */
export async function captureSourceFrameBytes(
  input: Record<string, unknown>,
  _signal?: AbortSignal,
): Promise<ToolResult & { buffer?: ArrayBuffer }> {
  const store = getEditorStore();
  const project = store.project;
  const projectPath = project.projectPath;
  if (!projectPath) {
    return {
      ok: false,
      summary: "Open a project before capturing a source frame",
      data: { error: "no_project" },
    };
  }

  const { maxWidth, quality } = parseCaptureQuality(input);

  let clipId =
    typeof input.clipId === "string" && input.clipId
      ? input.clipId
      : store.selectedClipId || store.selectedClipIds[0] || null;
  let mediaId =
    typeof input.mediaId === "string" && input.mediaId
      ? input.mediaId
      : null;

  let sourceMs =
    typeof input.sourceMs === "number" && Number.isFinite(input.sourceMs)
      ? Math.max(0, input.sourceMs)
      : null;

  if (clipId) {
    const found = findClipInTracks(project.tracks, clipId);
    if (!found) {
      return {
        ok: false,
        summary: `Clip not found: ${clipId}`,
        data: { error: "clip_not_found", clipId },
      };
    }
    const { clip } = found;
    if (clip.kind !== "video" && clip.kind !== "image") {
      return {
        ok: false,
        summary: "stage_capture mode=media requires a video or image clip",
        data: { error: "unsupported_clip_kind", kind: clip.kind },
      };
    }
    if (!clip.mediaId) {
      return {
        ok: false,
        summary: "Clip has no media",
        data: { error: "no_media", clipId },
      };
    }
    mediaId = clip.mediaId;
    if (sourceMs == null) {
      if (clip.kind === "image") {
        sourceMs = 0;
      } else {
        const localMs = Math.max(0, project.playheadMs - clip.startMs);
        sourceMs = sourceMsAtLocal(clip, localMs, project.fps);
      }
    }
  }

  if (!mediaId) {
    return {
      ok: false,
      summary: "Provide clipId/mediaId or select a video/image clip",
      data: { error: "missing_media" },
    };
  }

  const asset = project.mediaIndex.find((m) => m.id === mediaId);
  if (!asset) {
    return {
      ok: false,
      summary: `Media not found: ${mediaId}`,
      data: { error: "media_not_found", mediaId },
    };
  }
  if (asset.kind !== "video" && asset.kind !== "image") {
    return {
      ok: false,
      summary: "stage_capture mode=media requires video or image media",
      data: { error: "unsupported_media_kind", kind: asset.kind },
    };
  }

  if (sourceMs == null) {
    sourceMs = asset.kind === "image" ? 0 : Math.max(0, project.playheadMs);
  }

  try {
    const frame = await captureSourceFrame({
      asset,
      projectPath,
      sourceMs,
    });
    try {
      const res = await fetch(frame.url);
      const raw = toUint8Array(await res.arrayBuffer());
      let buffer: ArrayBuffer = toArrayBuffer(raw);
      let width = frame.width;
      let height = frame.height;

      if (width > maxWidth) {
        const scale = maxWidth / width;
        const tw = Math.max(1, Math.round(width * scale));
        const th = Math.max(1, Math.round(height * scale));
        const bitmap = await createImageBitmap(
          new Blob([toArrayBuffer(raw)], { type: "image/jpeg" }),
        );
        try {
          const canvas = new OffscreenCanvas(tw, th);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("2D context unavailable");
          ctx.drawImage(bitmap, 0, 0, tw, th);
          const blob = await canvas.convertToBlob({
            type: "image/jpeg",
            quality,
          });
          buffer = await blob.arrayBuffer();
          width = tw;
          height = th;
        } finally {
          bitmap.close();
        }
      }

      const meta = {
        kind: "source" as const,
        playheadMs: project.playheadMs,
        mediaTimeMs: sourceMs,
        width,
        height,
        mimeType: "image/jpeg" as const,
        clipId: clipId ?? undefined,
        mediaId,
        maxWidth,
        quality,
      };
      const base64 = bufferToBase64(buffer);
      return {
        ok: true,
        summary: `Captured source ${width}×${height} @ ${Math.round(sourceMs)}ms`,
        data: { ...meta, buffer },
        buffer,
        contentBlocks: [
          { type: "text", text: JSON.stringify(meta) },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64,
            },
          },
        ],
      };
    } finally {
      URL.revokeObjectURL(frame.url);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "capture failed";
    return {
      ok: false,
      summary: `Source capture failed: ${message}`,
      data: { error: "capture_failed", message },
    };
  }
}

/**
 * Agent tool: source plate from media/clip (not the overlay composite stack).
 */
export async function executeMediaCaptureFrame(
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const result = await captureSourceFrameBytes(input, signal);
  if (result.ok && result.data && typeof result.data === "object") {
    const { buffer: _buf, ...meta } = result.data as Record<string, unknown>;
    return {
      ...result,
      data: meta,
    };
  }
  return result;
}
