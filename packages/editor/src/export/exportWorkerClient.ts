import type {
  ExportQualityConfig,
  ExportWorkerRequest,
  ExportWorkerResponse,
  PreviewSeekLayer,
} from "./exportWorkerProtocol";
import { getPlatform } from "@indiecut/platform";

type FrameWaiter = {
  frameIndex: number;
  resolve: () => void;
  reject: (err: Error) => void;
};

/**
 * One export worker + its StreamTarget IPC stream id.
 * Long exports reuse a single session across sequential ~5s segments.
 */
export class ExportWorkerSession {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private streamId: string | null = null;
  private frameWaiter: FrameWaiter | null = null;
  private encodeDoneWaiter: {
    resolve: () => void;
    reject: (err: Error) => void;
  } | null = null;
  private failureHandler: ((err: Error) => void) | null = null;
  private previewHandler: ((dataUrl: string, frameIndex: number) => void) | null =
    null;
  private readonly loadedLuts = new Set<string>();
  private readonly onMessageBound = (event: MessageEvent<ExportWorkerResponse>) => {
    void this.onMessage(event);
  };

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./exportWorker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.addEventListener("message", this.onMessageBound);
      this.worker.addEventListener("error", (err) => {
        console.error("Export worker error", err);
        this.failureHandler?.(
          new Error(err.message || "Export worker crashed"),
        );
      });
    }
    return this.worker;
  }

  private post(msg: ExportWorkerRequest, transfer?: Transferable[]) {
    const w = this.getWorker();
    if (transfer && transfer.length > 0) {
      w.postMessage(msg, transfer);
    } else {
      w.postMessage(msg);
    }
  }

  private async onMessage(event: MessageEvent<ExportWorkerResponse>) {
    const msg = event.data;
    if (!msg?.type) return;

    if (msg.type === "streamWrite") {
      const bridge = getPlatform();
      if (!bridge?.exportStream) {
        this.post({
          type: "streamWriteAck",
          writeId: msg.writeId,
          ok: false,
          error: "Export stream IPC unavailable — restart the Electron app",
        });
        return;
      }
      if (!this.streamId) {
        this.post({
          type: "streamWriteAck",
          writeId: msg.writeId,
          ok: false,
          error: "Export stream id missing (worker init cleared it)",
        });
        return;
      }
      try {
        await bridge.exportStream.write(
          this.streamId,
          msg.position,
          msg.data,
        );
        this.post({ type: "streamWriteAck", writeId: msg.writeId, ok: true });
      } catch (err) {
        this.post({
          type: "streamWriteAck",
          writeId: msg.writeId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (msg.type === "ready" || msg.type === "loaded") {
      return;
    }

    if (msg.type === "frameDone") {
      if (
        this.frameWaiter &&
        this.frameWaiter.frameIndex === msg.frameIndex
      ) {
        this.frameWaiter.resolve();
        this.frameWaiter = null;
      }
      return;
    }

    if (msg.type === "previewFrame") {
      if (msg.dataUrl) this.previewHandler?.(msg.dataUrl, msg.frameIndex);
      return;
    }

    if (msg.type === "encodeDone") {
      this.encodeDoneWaiter?.resolve();
      this.encodeDoneWaiter = null;
      return;
    }

    if (msg.type === "failure") {
      const err = new Error(msg.error || "Export failed");
      this.frameWaiter?.reject(err);
      this.frameWaiter = null;
      this.encodeDoneWaiter?.reject(err);
      this.encodeDoneWaiter = null;
      this.failureHandler?.(err);
    }
  }

  async init(args: { width: number; height: number }): Promise<void> {
    this.dispose({ clearStreamId: true });
    const canvas = new OffscreenCanvas(args.width, args.height);
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const w = this.getWorker();
      const onReady = (event: MessageEvent<ExportWorkerResponse>) => {
        if (event.data?.type === "ready") {
          w.removeEventListener("message", onReady);
          resolve();
        } else if (event.data?.type === "failure") {
          w.removeEventListener("message", onReady);
          reject(new Error(event.data.error));
        }
      };
      w.addEventListener("message", onReady);
      this.post(
        {
          type: "init",
          canvas,
          width: args.width,
          height: args.height,
        },
        [canvas],
      );
    });
    await this.readyPromise;
  }

  setStreamId(id: string | null) {
    this.streamId = id;
  }

  setFailureHandler(handler: ((err: Error) => void) | null) {
    this.failureHandler = handler;
  }

  setPreviewHandler(
    handler: ((dataUrl: string, frameIndex: number) => void) | null,
  ) {
    this.previewHandler = handler;
  }

  async loadAsset(args: {
    assetId: string;
    kind: "video" | "image";
    buffer: ArrayBuffer;
    mimeHint?: string;
  }): Promise<void> {
    await this.readyPromise;
    const loaded = new Promise<void>((resolve, reject) => {
      const w = this.getWorker();
      const onMsg = (event: MessageEvent<ExportWorkerResponse>) => {
        if (
          event.data?.type === "loaded" &&
          event.data.assetId === args.assetId
        ) {
          w.removeEventListener("message", onMsg);
          resolve();
        } else if (
          event.data?.type === "failure" &&
          event.data.assetId === args.assetId
        ) {
          w.removeEventListener("message", onMsg);
          reject(new Error(event.data.error));
        }
      };
      w.addEventListener("message", onMsg);
      this.post(
        {
          type: "load",
          assetId: args.assetId,
          kind: args.kind,
          buffer: args.buffer,
          mimeHint: args.mimeHint,
        },
        [args.buffer],
      );
    });
    await loaded;
  }

  loadLut(lutId: string, text: string) {
    this.post({ type: "loadLut", lutId, text });
  }

  isLutLoaded(lutId: string): boolean {
    return this.loadedLuts.has(lutId);
  }

  markLutLoaded(lutId: string) {
    this.loadedLuts.add(lutId);
  }

  async beginEncode(args: {
    width: number;
    height: number;
    fps: number;
    totalFrames: number;
    layoutWidth: number;
    layoutHeight: number;
    videoQuality: ExportQualityConfig;
    audio?: {
      sampleRate: number;
      numberOfChannels: number;
      pcm: Float32Array;
      audioQuality: ExportQualityConfig;
    } | null;
    emitPreview?: boolean;
  }): Promise<void> {
    const transfer: Transferable[] = [];
    if (args.audio?.pcm) {
      transfer.push(args.audio.pcm.buffer);
    }
    this.post(
      {
        type: "beginEncode",
        width: args.width,
        height: args.height,
        fps: args.fps,
        totalFrames: args.totalFrames,
        layoutWidth: args.layoutWidth,
        layoutHeight: args.layoutHeight,
        videoQuality: args.videoQuality,
        audio: args.audio ?? null,
        emitPreview: args.emitPreview ?? false,
      },
      transfer,
    );
  }

  async encodeFrame(
    frameIndex: number,
    layers: PreviewSeekLayer[],
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.frameWaiter = { frameIndex, resolve, reject };
      this.post({ type: "encodeFrame", frameIndex, layers });
    });
  }

  async finishEncode(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.encodeDoneWaiter = { resolve, reject };
      this.post({ type: "finishEncode" });
    });
  }

  async cancelEncode(): Promise<void> {
    this.post({ type: "cancelEncode" });
    this.frameWaiter?.reject(new Error("Export cancelled"));
    this.frameWaiter = null;
    this.encodeDoneWaiter?.reject(new Error("Export cancelled"));
    this.encodeDoneWaiter = null;
  }

  dispose(opts?: { clearStreamId?: boolean }) {
    if (this.worker) {
      this.worker.removeEventListener("message", this.onMessageBound);
      this.worker.terminate();
      this.worker = null;
    }
    this.readyPromise = null;
    if (opts?.clearStreamId !== false) {
      this.streamId = null;
    }
    this.frameWaiter = null;
    this.encodeDoneWaiter = null;
    this.failureHandler = null;
    this.previewHandler = null;
    this.loadedLuts.clear();
  }
}
