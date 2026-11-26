import { runAutoCaptionJob } from "../captions/runAutoCaptionJob";
import type { SpeechLanguage } from "../captions/types";
import { hasElevenLabsVoice, hasGeminiKey } from "../secrets/aiSecrets";
import {
  executeImageEditFrame,
  executeImageGenerate,
} from "../tools/imageTools";
import { executeVoiceGenerate } from "../tools/voiceTools";
import type { MutationBatch } from "../tools/mutationBatch";
import type { ToolResult } from "../tools/types";

export async function executeSkillRun(
  input: Record<string, unknown>,
  batch: MutationBatch,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const skill = typeof input.skill === "string" ? input.skill : "";
  const skillInput =
    input.input && typeof input.input === "object" && !Array.isArray(input.input)
      ? (input.input as Record<string, unknown>)
      : input;

  if (skill === "image.generate") {
    if (!hasGeminiKey()) {
      return {
        ok: false,
        summary:
          "Gemini is not configured — add a Gemini API key in Settings → AI",
        data: { error: "gemini_not_configured" },
      };
    }
    const result = await executeImageGenerate(skillInput, batch, signal);
    if (result.ok && result.data && typeof result.data === "object") {
      const mediaId = (result.data as { mediaId?: string }).mediaId;
      if (mediaId) batch.importedMediaIds.push(mediaId);
    }
    return result;
  }

  if (skill === "image.editFrame") {
    if (!hasGeminiKey()) {
      return {
        ok: false,
        summary:
          "Gemini is not configured — add a Gemini API key in Settings → AI",
        data: { error: "gemini_not_configured" },
      };
    }
    const result = await executeImageEditFrame(skillInput, batch, signal);
    if (result.ok && result.data && typeof result.data === "object") {
      const mediaId = (result.data as { mediaId?: string }).mediaId;
      if (mediaId) batch.importedMediaIds.push(mediaId);
    }
    return result;
  }

  if (skill === "voice.generate") {
    if (!hasElevenLabsVoice()) {
      return {
        ok: false,
        summary:
          "ElevenLabs is not configured — add API key and Voice ID in Settings → AI",
        data: { error: "elevenlabs_not_configured" },
      };
    }
    const result = await executeVoiceGenerate(skillInput, batch, signal);
    if (result.ok && result.data && typeof result.data === "object") {
      const mediaId = (result.data as { mediaId?: string }).mediaId;
      if (mediaId) batch.importedMediaIds.push(mediaId);
    }
    return result;
  }

  if (skill === "captions.auto") {
    try {
      const language =
        typeof skillInput.language === "string"
          ? (skillInput.language as SpeechLanguage)
          : "auto";
      const result = await runAutoCaptionJob({
        language,
        signal,
      });
      // Captions job commits itself — refresh batch tracks from store.
      const { getEditorStore } = await import("../../store/editorStore");
      batch.tracks = structuredClone(getEditorStore().project.tracks);
      batch.labels.push(
        `Auto-captioned ${result.cueCount} cues on ${result.clipCount} clip(s)`,
      );
      batch.dirty = true;
      return {
        ok: true,
        summary: `Auto-captioned ${result.cueCount} cues`,
        data: { ok: true, ...result },
        mutated: true,
      };
    } catch (err) {
      return {
        ok: false,
        summary: err instanceof Error ? err.message : "Auto-caption failed",
        data: { error: "captions_auto_failed" },
      };
    }
  }

  return {
    ok: false,
    summary: `Unknown or unavailable skill: ${skill}. Call capabilities_list.`,
    data: { error: "unknown_skill", skill },
  };
}
