import { generateSpeech } from "../providers/elevenlabs";
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

export async function executeVoiceGenerate(
  input: Record<string, unknown>,
  batch: MutationBatch,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const secrets = getAiSecretsCached();
  const apiKey = secrets.elevenLabsKey;
  const defaultVoiceId = secrets.elevenLabsVoiceId;
  if (!apiKey || !defaultVoiceId) {
    return {
      ok: false,
      summary:
        "ElevenLabs is not configured — add API key and Voice ID in Settings → AI",
      data: { error: "elevenlabs_not_configured" },
    };
  }

  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) {
    return {
      ok: false,
      summary: "text is required for skill voice.generate",
      data: { error: "missing_text" },
    };
  }

  const voiceId =
    typeof input.voiceId === "string" && input.voiceId.trim()
      ? input.voiceId.trim()
      : defaultVoiceId;

  const timing = parseTiming(input);

  try {
    const generated = await generateSpeech({
      apiKey,
      voiceId,
      text,
      signal,
    });
    const short = text.length > 48 ? `${text.slice(0, 45)}…` : text;
    const imported = await importGeneratedAudioOntoTracks({
      bytes: generated.bytes,
      mimeType: generated.mimeType,
      name: `AI VO: ${short}`,
      tracks: batch.tracks,
      startMs: timing.startMs,
      exactStart: timing.exactStart,
      targetTrackId:
        typeof input.trackId === "string" ? input.trackId : undefined,
    });

    const summary = `Generated voiceover at playhead`;
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
      summary: `Voice generate failed: ${message}`,
      data: { error: "voice_generate_failed", skill: "voice.generate", message },
    };
  }
}
