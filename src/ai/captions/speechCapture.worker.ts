import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";
import type { SpeechSpan } from "./types";

export type SpeechWorkerInbound =
  | { type: "init"; modelId: string; ortAssetBaseUrl: string }
  | { type: "transcribe"; audio: Float32Array; language: string }
  | { type: "cancel" };

export type SpeechWorkerOutbound =
  | { type: "init-progress"; progress: number }
  | { type: "init-complete" }
  | { type: "init-error"; error: string }
  | { type: "transcribe-progress"; progress: number }
  | {
      type: "transcribe-complete";
      text: string;
      spans: SpeechSpan[];
    }
  | { type: "transcribe-error"; error: string }
  | { type: "cancelled" };

const CHUNK_LENGTH_SECONDS = 30;
const STRIDE_SECONDS = 5;

let recognizer: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled = false;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();
let ortPathsConfigured = false;

self.onmessage = async (event: MessageEvent<SpeechWorkerInbound>) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      await handleInit({
        modelId: message.modelId,
        ortAssetBaseUrl: message.ortAssetBaseUrl,
      });
      break;
    case "transcribe":
      await handleTranscribe({
        audio: message.audio,
        language: message.language,
      });
      break;
    case "cancel":
      cancelled = true;
      post({ type: "cancelled" });
      break;
  }
};

function post(message: SpeechWorkerOutbound): void {
  self.postMessage(message);
}

/**
 * Point ORT at same-origin assets before pipeline() so transformers v3 does
 * not default to cdn.jsdelivr.net (blocked by Electron CSP).
 */
function configureOrtAssetPaths({
  ortAssetBaseUrl,
}: {
  ortAssetBaseUrl: string;
}): void {
  if (ortPathsConfigured) return;
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    wasm.wasmPaths = ortAssetBaseUrl;
  }
  ortPathsConfigured = true;
}

async function handleInit({
  modelId,
  ortAssetBaseUrl,
}: {
  modelId: string;
  ortAssetBaseUrl: string;
}): Promise<void> {
  lastReportedProgress = -1;
  fileBytes.clear();
  post({ type: "init-progress", progress: 0 });

  try {
    configureOrtAssetPaths({ ortAssetBaseUrl });

    // Cast matches OpenCut classic — v3 pipeline union is too wide for TS.
    recognizer = (await pipeline("automatic-speech-recognition", modelId, {
      dtype: "q4",
      device: "auto",
      progress_callback: (progressInfo: {
        status?: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        const file = progressInfo.file;
        if (!file) return;

        const loaded = progressInfo.loaded ?? 0;
        const total = progressInfo.total ?? 0;

        if (progressInfo.status === "progress" && total > 0) {
          fileBytes.set(file, { loaded, total });
        } else if (progressInfo.status === "done") {
          const existing = fileBytes.get(file);
          if (existing) {
            fileBytes.set(file, {
              loaded: existing.total,
              total: existing.total,
            });
          }
        }

        let totalLoaded = 0;
        let totalSize = 0;
        for (const entry of fileBytes.values()) {
          totalLoaded += entry.loaded;
          totalSize += entry.total;
        }
        if (totalSize === 0) return;

        const overall = Math.floor((totalLoaded / totalSize) * 100);
        if (overall === lastReportedProgress) return;
        lastReportedProgress = overall;
        post({ type: "init-progress", progress: overall });
      },
    })) as unknown as AutomaticSpeechRecognitionPipeline;

    post({ type: "init-complete" });
  } catch (error) {
    post({
      type: "init-error",
      error: error instanceof Error ? error.message : "Failed to load model",
    });
  }
}

async function handleTranscribe({
  audio,
  language,
}: {
  audio: Float32Array;
  language: string;
}): Promise<void> {
  if (!recognizer) {
    post({ type: "transcribe-error", error: "Model not initialized" });
    return;
  }

  cancelled = false;
  post({ type: "transcribe-progress", progress: 5 });

  try {
    const raw = await recognizer(audio, {
      chunk_length_s: CHUNK_LENGTH_SECONDS,
      stride_length_s: STRIDE_SECONDS,
      language: language === "auto" ? undefined : language,
      return_timestamps: true,
    });

    if (cancelled) return;

    const result = Array.isArray(raw) ? raw[0] : raw;
    if (!result || typeof result !== "object") {
      post({
        type: "transcribe-error",
        error: "Speech recognition returned an empty result",
      });
      return;
    }

    const text =
      "text" in result && typeof result.text === "string" ? result.text : "";
    const spans: SpeechSpan[] = [];
    const chunks =
      "chunks" in result && Array.isArray(result.chunks) ? result.chunks : [];

    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== "object") continue;
      const chunkText =
        "text" in chunk && typeof chunk.text === "string" ? chunk.text : "";
      const timestamp =
        "timestamp" in chunk && Array.isArray(chunk.timestamp)
          ? chunk.timestamp
          : null;
      if (!timestamp || timestamp.length < 2) continue;
      const start = typeof timestamp[0] === "number" ? timestamp[0] : 0;
      const end =
        typeof timestamp[1] === "number" ? timestamp[1] : start;
      spans.push({ text: chunkText, startSec: start, endSec: end });
    }

    post({
      type: "transcribe-progress",
      progress: 100,
    });
    post({
      type: "transcribe-complete",
      text,
      spans,
    });
  } catch (error) {
    if (cancelled) return;
    post({
      type: "transcribe-error",
      error: error instanceof Error ? error.message : "Transcription failed",
    });
  }
}
