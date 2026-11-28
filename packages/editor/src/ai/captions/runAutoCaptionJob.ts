import { getAiSecretsCached } from "../secrets/aiSecrets";
import { transcribeSpeech } from "../providers/elevenlabs";
import { getEditorStore } from "../../store/editorStore";
import { buildSpeechSourcePcm } from "./buildSpeechSourcePcm";
import type { CaptionSttProvider } from "./captionProviders";
import { DEFAULT_CAPTION_STT_PROVIDER } from "./captionProviders";
import { downmixToMono16k, SPEECH_TARGET_SAMPLE_RATE } from "./downmixToMono16k";
import { hasAudibleTimelineSpeech } from "./hasAudibleTimelineSpeech";
import { placeSpeechLinesOnTimeline } from "./placeSpeechLinesOnTimeline";
import { segmentSpeechIntoLines } from "./segmentSpeechIntoLines";
import { speechCaptureEngine } from "./SpeechCaptureEngine";
import type {
  SpeechCaptureProgress,
  SpeechLanguage,
  SpeechSpan,
} from "./types";

export type AutoCaptionJobResult = {
  clipCount: number;
  cueCount: number;
  trackId: string | null;
};

function wordsToSpans(
  words: Array<{ text: string; startSec: number; endSec: number }>,
): SpeechSpan[] {
  return words.map((w) => ({
    text: w.text,
    startSec: w.startSec,
    endSec: w.endSec,
  }));
}

/**
 * Group word-level spans into ~wordsPerLine multi-word spans so
 * `segmentSpeechIntoLines` produces short caption lines with real timings.
 */
function groupWordSpans(
  words: SpeechSpan[],
  wordsPerLine: number,
): SpeechSpan[] {
  if (words.length === 0) return [];
  const spans: SpeechSpan[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    const chunk = words.slice(i, i + wordsPerLine);
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    spans.push({
      text: chunk.map((w) => w.text).join(" "),
      startSec: first.startSec,
      endSec: Math.max(first.startSec, last.endSec),
    });
  }
  return spans;
}

export async function runAutoCaptionJob({
  language,
  provider = DEFAULT_CAPTION_STT_PROVIDER,
  onProgress,
  signal,
}: {
  language: SpeechLanguage;
  provider?: CaptionSttProvider;
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
    let spans: SpeechSpan[];

    if (provider === "elevenlabs") {
      const apiKey = getAiSecretsCached().elevenLabsKey?.trim();
      if (!apiKey) {
        throw new Error(
          "ElevenLabs is not configured — add an API key in Settings → AI → Voice",
        );
      }

      onProgress?.({
        status: "transcribing",
        progress: 10,
        message: "Transcribing with ElevenLabs…",
      });

      const transcript = await transcribeSpeech({
        apiKey,
        samples,
        sampleRate: SPEECH_TARGET_SAMPLE_RATE,
        language,
        signal,
      });
      throwIfAborted();

      const wordSpans = wordsToSpans(transcript.words);
      spans =
        wordSpans.length > 0
          ? groupWordSpans(wordSpans, 3)
          : [
              {
                text: transcript.text,
                startSec: 0,
                endSec: Math.max(0.8, samples.length / SPEECH_TARGET_SAMPLE_RATE),
              },
            ];
    } else {
      const result = await speechCaptureEngine.transcribe({
        audioData: samples,
        language,
        onProgress,
      });
      throwIfAborted();
      spans = result.spans;
    }

    onProgress?.({
      status: "transcribing",
      progress: 100,
      message: "Placing captions…",
    });

    const lines = segmentSpeechIntoLines({ spans });
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
