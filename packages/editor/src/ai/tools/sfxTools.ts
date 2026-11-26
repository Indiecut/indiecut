import { generateSoundEffect } from "../providers/elevenlabs";
import { getAiSecretsCached } from "../secrets/aiSecrets";
import { importGeneratedAudioOntoTracks } from "./importGeneratedAudio";
import type { MutationBatch } from "./mutationBatch";
import type { ToolResult } from "./types";

function parseTiming(input: Record<string, unknown>): {
  startMs?: number;
  exactStart: boolean;
} {
  const exactStart =
    typeof input.startMs === "number" && Number.isFinite(input.startMs);
  return {
    startMs: exactStart ? (input.startMs as number) : undefined,
    exactStart,
  };
}

function resolveDescription(input: Record<string, unknown>): string {
  if (typeof input.text === "string" && input.text.trim()) {
    return input.text.trim();
  }
  if (typeof input.prompt === "string" && input.prompt.trim()) {
    return input.prompt.trim();
  }
  return "";
}

/**
 * ElevenLabs sound effects → import audio onto the timeline.
 * Requires API key only (no Voice ID).
 */
export async function executeSfxGenerate(
  input: Record<string, unknown>,
  batch: MutationBatch,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const secrets = getAiSecretsCached();
  const apiKey = secrets.elevenLabsKey;
  if (!apiKey || secrets.elevenLabsSfxOk === false) {
    return {
      ok: false,
      summary:
        "Sound effects unavailable — add an ElevenLabs API key and pass Test (SFX) in Settings → AI",
      data: { error: "elevenlabs_sfx_unavailable" },
    };
  }

  const text = resolveDescription(input);
  if (!text) {
    return {
      ok: false,
      summary: "text (or prompt) is required for skill sfx.generate",
      data: { error: "missing_text" },
    };
  }

  const timing = parseTiming(input);

  let durationSeconds: number | undefined;
  if (
    typeof input.durationSeconds === "number" &&
    Number.isFinite(input.durationSeconds)
  ) {
    durationSeconds = input.durationSeconds;
  } else if (
    typeof input.durationMs === "number" &&
    Number.isFinite(input.durationMs) &&
    input.durationMs > 0
  ) {
    durationSeconds = input.durationMs / 1000;
  }

  const loop = input.loop === true;
  const promptInfluence =
    typeof input.promptInfluence === "number" &&
    Number.isFinite(input.promptInfluence)
      ? input.promptInfluence
      : undefined;

  try {
    const generated = await generateSoundEffect({
      apiKey,
      text,
      durationSeconds,
      loop,
      promptInfluence,
      signal,
    });
    const short = text.length > 48 ? `${text.slice(0, 45)}…` : text;
    const imported = await importGeneratedAudioOntoTracks({
      bytes: generated.bytes,
      mimeType: generated.mimeType,
      name: `AI SFX: ${short}`,
      tracks: batch.tracks,
      startMs: timing.startMs,
      exactStart: timing.exactStart,
      targetTrackId:
        typeof input.trackId === "string" ? input.trackId : undefined,
    });

    const summary = "Generated sound effect on timeline";
    batch.tracks = imported.placed.tracks;
    batch.labels.push(summary);
    batch.dirty = true;

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
  } catch (err) {
    const message = err instanceof Error ? err.message : "generate failed";
    return {
      ok: false,
      summary: `SFX generate failed: ${message}`,
      data: { error: "sfx_generate_failed", skill: "sfx.generate", message },
    };
  }
}
