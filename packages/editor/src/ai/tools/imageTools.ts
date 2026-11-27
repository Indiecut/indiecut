import { getEditorStore } from "../../store/editorStore";
import {
  editImage,
  geminiAspectFromProject,
  generateImage,
  type GeminiImageMime,
} from "../providers/gemini";
import { getAiSecretsCached } from "../secrets/aiSecrets";
import { capturePreviewComposite } from "../../preview/previewWorkerClient";
import { captureSourceFrameBytes } from "./captureTools";
import { importGeneratedImageOntoTracks } from "./importGeneratedImage";
import type { MutationBatch } from "./mutationBatch";
import type { ToolResult } from "./types";

function applyImagePlacement(
  batch: MutationBatch,
  imported: Awaited<ReturnType<typeof importGeneratedImageOntoTracks>>,
  summary: string,
  detail: string,
): ToolResult {
  batch.tracks = imported.placed.tracks;
  batch.labels.push(summary);
  batch.dirty = true;
  batch.resultThumb = {
    bytes: imported.bytes,
    mimeType: imported.mimeType,
    detail,
  };
  return {
    ok: true,
    summary,
    data: {
      ok: true,
      clipId: imported.placed.clip.id,
      trackId: imported.placed.trackId,
      mediaId: imported.assetId,
      startMs: imported.placed.clip.startMs,
      durationMs: imported.placed.clip.durationMs,
    },
    mutated: true,
  };
}

function projectAspectHint(aspectHint?: unknown): string {
  const project = getEditorStore().project;
  if (typeof aspectHint === "string" && aspectHint.trim()) {
    return geminiAspectFromProject({
      aspectRatio: aspectHint.trim(),
      width: project.width,
      height: project.height,
    });
  }
  return geminiAspectFromProject({
    aspectRatio: project.aspectRatio,
    width: project.width,
    height: project.height,
  });
}

function parseTiming(input: Record<string, unknown>): {
  startMs?: number;
  durationMs?: number;
  exactStart: boolean;
} {
  const exactStart =
    typeof input.startMs === "number" && Number.isFinite(input.startMs);
  return {
    startMs: exactStart ? (input.startMs as number) : undefined,
    durationMs:
      typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
        ? (input.durationMs as number)
        : undefined,
    exactStart,
  };
}

export async function executeImageGenerate(
  input: Record<string, unknown>,
  batch: MutationBatch,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const apiKey = getAiSecretsCached().geminiKey;
  if (!apiKey) {
    return {
      ok: false,
      summary: "Gemini API key not set — add it in Settings → AI",
      data: { error: "gemini_key_missing" },
    };
  }

  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) {
    return {
      ok: false,
      summary: "prompt is required for skill image.generate",
      data: { error: "missing_prompt" },
    };
  }

  const timing = parseTiming(input);
  const aspectRatio = projectAspectHint(input.aspectHint);

  try {
    const generated = await generateImage({
      apiKey,
      prompt,
      aspectRatio,
      signal,
    });
    const short =
      prompt.length > 48 ? `${prompt.slice(0, 45)}…` : prompt;
    const imported = await importGeneratedImageOntoTracks({
      bytes: generated.bytes,
      mimeType: generated.mimeType,
      name: `AI: ${short}`,
      tracks: batch.tracks,
      startMs: timing.startMs,
      durationMs: timing.durationMs,
      exactStart: timing.exactStart,
      preferOverlay: false,
      targetTrackId:
        typeof input.trackId === "string" ? input.trackId : undefined,
    });
    const detail = `Generated “${short}” → ${imported.placed.clip.id} @ ${Math.round(imported.placed.clip.startMs)}ms`;
    return applyImagePlacement(
      batch,
      imported,
      `Generated image at playhead`,
      detail,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "generate failed";
    return {
      ok: false,
      summary: `Image generate failed: ${message}`,
      data: { error: "image_generate_failed", skill: "image.generate", message },
    };
  }
}

async function capturePlateForEdit(
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<
  | {
      ok: true;
      bytes: ArrayBuffer;
      mimeType: GeminiImageMime;
      meta: Record<string, unknown>;
    }
  | { ok: false; result: ToolResult }
> {
  const source =
    input.source === "media" || input.source === "source"
      ? "media"
      : input.source === "composite" || !input.source
        ? "composite"
        : null;
  if (!source) {
    return {
      ok: false,
      result: {
        ok: false,
        summary: 'source must be "composite" or "media"',
        data: { error: "invalid_source" },
      },
    };
  }

  if (source === "composite") {
    // Plate for Gemini edit — slightly sharper than Claude vision, still capped.
    let maxWidth = 1024;
    if (typeof input.maxWidth === "number" && Number.isFinite(input.maxWidth)) {
      maxWidth = Math.min(1280, Math.max(64, Math.round(input.maxWidth)));
    }
    let quality = 0.75;
    if (typeof input.quality === "number" && Number.isFinite(input.quality)) {
      quality = Math.min(1, Math.max(0.1, input.quality));
    }
    try {
      const captured = await capturePreviewComposite({
        maxWidth,
        quality,
        mimeType: "image/jpeg",
      });
      const mimeType: GeminiImageMime =
        captured.mimeType === "image/webp" ? "image/webp" : "image/jpeg";
      return {
        ok: true,
        bytes: captured.buffer,
        mimeType,
        meta: {
          kind: "composite",
          playheadMs: getEditorStore().project.playheadMs,
          width: captured.width,
          height: captured.height,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "capture failed";
      return {
        ok: false,
        result: {
          ok: false,
          summary: `Composite capture failed: ${message}`,
          data: { error: "capture_failed", message },
        },
      };
    }
  }

  const captured = await captureSourceFrameBytes(input, signal);
  if (!captured.ok || !captured.buffer) {
    return {
      ok: false,
      result: captured.ok
        ? {
            ok: false,
            summary: "Source capture returned no bytes",
            data: { error: "capture_empty" },
          }
        : captured,
    };
  }
  const { buffer: _omit, ...meta } = (captured.data ?? {}) as Record<
    string,
    unknown
  >;
  return {
    ok: true,
    bytes: captured.buffer,
    mimeType: "image/jpeg",
    meta,
  };
}

export async function executeImageEditFrame(
  input: Record<string, unknown>,
  batch: MutationBatch,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const apiKey = getAiSecretsCached().geminiKey;
  if (!apiKey) {
    return {
      ok: false,
      summary: "Gemini API key not set — add it in Settings → AI",
      data: { error: "gemini_key_missing" },
    };
  }

  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) {
    return {
      ok: false,
      summary: "prompt is required for skill image.editFrame",
      data: { error: "missing_prompt" },
    };
  }

  const plate = await capturePlateForEdit(input, signal);
  if (!plate.ok) return plate.result;

  const timing = parseTiming(input);
  const aspectRatio = projectAspectHint(input.aspectHint);

  try {
    const edited = await editImage({
      apiKey,
      prompt,
      imageBytes: plate.bytes,
      imageMimeType: plate.mimeType,
      aspectRatio,
      signal,
    });
    const short =
      prompt.length > 48 ? `${prompt.slice(0, 45)}…` : prompt;
    const imported = await importGeneratedImageOntoTracks({
      bytes: edited.bytes,
      mimeType: edited.mimeType,
      name: `AI edit: ${short}`,
      tracks: batch.tracks,
      startMs: timing.startMs,
      durationMs: timing.durationMs,
      exactStart: timing.exactStart,
      preferOverlay: true,
      targetTrackId:
        typeof input.trackId === "string" ? input.trackId : undefined,
    });
    const detail = `Edited (${String(plate.meta.kind ?? "plate")}) “${short}” → ${imported.placed.clip.id}`;
    return applyImagePlacement(
      batch,
      imported,
      `Edited frame → overlay image`,
      detail,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "edit failed";
    return {
      ok: false,
      summary: `Image edit failed: ${message}`,
      data: { error: "image_edit_failed", message },
    };
  }
}
