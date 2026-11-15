import { getEditorStore } from "../../store/editorStore";
import { buildSpeechSourcePcm } from "./buildSpeechSourcePcm";
import { downmixToMono16k } from "./downmixToMono16k";
import { hasAudibleTimelineSpeech } from "./hasAudibleTimelineSpeech";
import { placeSpeechLinesOnTimeline } from "./placeSpeechLinesOnTimeline";
import { segmentSpeechIntoLines } from "./segmentSpeechIntoLines";
import { speechCaptureEngine } from "./SpeechCaptureEngine";
import type { SpeechCaptureProgress, SpeechLanguage } from "./types";

export type AutoCaptionJobResult = {
  clipCount: number;
  cueCount: number;
  trackId: string | null;
};

export async function runAutoCaptionJob({
  language,
  onProgress,
  signal,
}: {
  language: SpeechLanguage;
  onProgress?: (progress: SpeechCaptureProgress) => void;
  signal?: AbortSignal;
}): Promise<AutoCaptionJobResult> {
  const project = getEditorStore().project;

  if (!hasAudibleTimelineSpeech(project)) {
    throw new Error(
      "No audio detected. Add a clip with audio to the timeline first.",
    );
  }

  const throwIfAborted = () => {
    if (signal?.aborted) {
      speechCaptureEngine.cancel();
      throw new Error("Caption generation cancelled");
    }
  };

  onProgress?.({
    status: "transcribing",
    progress: 0,
    message: "Mixing timeline audio…",
  });
  throwIfAborted();

  const source = await buildSpeechSourcePcm(project);
  throwIfAborted();

  onProgress?.({
    status: "transcribing",
    progress: 0,
    message: "Preparing audio…",
  });
  const samples = await downmixToMono16k(source);
  if (samples.length === 0) {
    throw new Error("Timeline audio is empty after mix.");
  }
  throwIfAborted();

  const onAbort = () => {
    speechCaptureEngine.cancel();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const result = await speechCaptureEngine.transcribe({
      audioData: samples,
      language,
      onProgress,
    });
    throwIfAborted();

    onProgress?.({
      status: "transcribing",
      progress: 100,
      message: "Placing captions…",
    });

    const lines = segmentSpeechIntoLines({ spans: result.spans });
    if (lines.length === 0) {
      throw new Error("No speech was detected in the timeline audio.");
    }

    const placed = placeSpeechLinesOnTimeline({
      lines,
      commitLabel: "Add auto captions",
    });
    if (placed.clipCount === 0 || placed.cueCount === 0) {
      throw new Error("No captions were generated.");
    }

    onProgress?.({
      status: "complete",
      progress: 100,
      message: `Added ${placed.cueCount} caption cue(s)`,
    });

    return placed;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
