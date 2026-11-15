import type {
  MediaWorkerRequest,
  MediaWorkerResponse,
  MediaWorkerSuccess,
} from "./mediaWorkerProtocol";

type ProgressHandler = (progress: number, stage: string) => void;

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./mediaWorker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

function newJobId(): string {
  return `job_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Run MediaBunny probe + derivative generation in a Vite module worker.
 * Transfers `buffer` ownership to the worker (do not reuse after call).
 */
export function processMediaInWorker(args: {
  assetId: string;
  fileName: string;
  buffer: ArrayBuffer;
  mimeHint?: string;
  onProgress?: ProgressHandler;
}): Promise<MediaWorkerSuccess> {
  const { assetId, fileName, buffer, mimeHint, onProgress } = args;
  const jobId = newJobId();
  const w = getWorker();

  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<MediaWorkerResponse>) => {
      const msg = event.data;
      if (!msg || msg.jobId !== jobId) return;

      if (msg.type === "progress") {
        onProgress?.(msg.progress, msg.stage);
        return;
      }

      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);

      if (msg.type === "success") {
        resolve(msg);
      } else {
        reject(new Error(msg.error || "Media worker failed"));
      }
    };

    const onError = (err: ErrorEvent) => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      reject(err.error instanceof Error ? err.error : new Error(err.message));
    };

    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);

    const request: MediaWorkerRequest = {
      type: "process",
      jobId,
      assetId,
      fileName,
      buffer,
      mimeHint,
    };
    w.postMessage(request, [buffer]);
  });
}
