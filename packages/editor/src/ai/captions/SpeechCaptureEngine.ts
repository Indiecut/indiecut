import { resolveOrtAssetBaseUrl } from "./resolveOrtAssetBaseUrl";
import { SPEECH_MODEL_HF_ID } from "./speechModels";
import type {
  SpeechCaptureProgress,
  SpeechLanguage,
  SpeechSpan,
} from "./types";
import type {
  SpeechWorkerInbound,
  SpeechWorkerOutbound,
} from "./speechCapture.worker";

type ProgressCallback = (progress: SpeechCaptureProgress) => void;

export type SpeechCaptureResult = {
  text: string;
  spans: SpeechSpan[];
  language: SpeechLanguage;
};

class SpeechCaptureEngine {
  private worker: Worker | null = null;
  private ready = false;
  private loading = false;

  async transcribe({
    audioData,
    language = "auto",
    onProgress,
  }: {
    audioData: Float32Array;
    language?: SpeechLanguage;
    onProgress?: ProgressCallback;
  }): Promise<SpeechCaptureResult> {
    await this.ensureWorker({ onProgress });

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Speech worker not initialized"));
        return;
      }

      const handleMessage = (event: MessageEvent<SpeechWorkerOutbound>) => {
        const response = event.data;
        switch (response.type) {
          case "transcribe-progress":
            onProgress?.({
              status: "transcribing",
              progress: response.progress,
              message: "Transcribing audio…",
            });
            break;
          case "transcribe-complete":
            this.worker?.removeEventListener("message", handleMessage);
            resolve({
              text: response.text,
              spans: response.spans,
              language,
            });
            break;
          case "transcribe-error":
            this.worker?.removeEventListener("message", handleMessage);
            reject(new Error(response.error));
            break;
          case "cancelled":
            this.worker?.removeEventListener("message", handleMessage);
            reject(new Error("Transcription cancelled"));
            break;
        }
      };

      this.worker.addEventListener("message", handleMessage);
      this.post({
        type: "transcribe",
        audio: audioData,
        language,
      });
    });
  }

  cancel(): void {
    this.post({ type: "cancel" });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.loading = false;
  }

  private post(message: SpeechWorkerInbound): void {
    this.worker?.postMessage(message);
  }

  private async ensureWorker({
    onProgress,
  }: {
    onProgress?: ProgressCallback;
  }): Promise<void> {
    if (this.worker && this.ready) return;

    if (this.loading) {
      await this.waitUntilReady();
      return;
    }

    this.terminate();
    this.loading = true;
    this.ready = false;

    this.worker = new Worker(
      new URL("./speechCapture.worker.ts", import.meta.url),
      { type: "module" },
    );

    onProgress?.({
      status: "loading-model",
      progress: 0,
      message: "Downloading model 0%",
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Failed to create speech worker"));
        return;
      }

      const handleMessage = (event: MessageEvent<SpeechWorkerOutbound>) => {
        const response = event.data;
        switch (response.type) {
          case "init-progress":
            onProgress?.({
              status: "loading-model",
              progress: response.progress,
              message: `Downloading model ${Math.round(response.progress)}%`,
            });
            break;
          case "init-complete":
            onProgress?.({
              status: "loading-model",
              progress: 100,
              message: "Downloading model 100%",
            });
            this.worker?.removeEventListener("message", handleMessage);
            this.ready = true;
            this.loading = false;
            resolve();
            break;
          case "init-error":
            this.worker?.removeEventListener("message", handleMessage);
            this.loading = false;
            this.terminate();
            reject(new Error(response.error));
            break;
        }
      };

      this.worker.addEventListener("message", handleMessage);
      this.post({
        type: "init",
        modelId: SPEECH_MODEL_HF_ID,
        ortAssetBaseUrl: resolveOrtAssetBaseUrl(),
      });
    });
  }

  private waitUntilReady(): Promise<void> {
    return new Promise((resolve) => {
      const tick = () => {
        if (this.ready || !this.loading) {
          resolve();
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
  }
}

export const speechCaptureEngine = new SpeechCaptureEngine();
