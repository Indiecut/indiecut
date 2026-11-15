import { acquireExportCanvas } from "./exportCanvasPool";

const REWIND_EPS_SEC = 1e-3;

type SinkCanvas = OffscreenCanvas | HTMLCanvasElement;

/** Minimal sink surface used by the cursor (MediaBunny CanvasSink satisfies this). */
export type ForwardCanvasSink = {
  getCanvas(timestamp: number): Promise<{ canvas: SinkCanvas } | null>;
  canvasesAtTimestamps(
    timestamps: AsyncIterable<number>,
  ): AsyncGenerator<{ canvas: SinkCanvas } | null, void, unknown>;
};

type PendingRequest = {
  timestamp: number;
  /** Already handed to MediaBunny's timestamp iterator (do not re-yield). */
  issued: boolean;
  resolve: (canvas: OffscreenCanvas | null) => void;
  reject: (err: Error) => void;
};

/** Copy out of CanvasSink's pool before the next decode reuses the wrap. */
export function snapshotCanvas(
  source: CanvasImageSource & { width: number; height: number },
): OffscreenCanvas {
  const w = Math.max(1, source.width);
  const h = Math.max(1, source.height);
  const out = acquireExportCanvas(w, h);
  // CPU-backed — avoids IOSurface growth during long exports.
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("ForwardCanvasCursor snapshot 2D unavailable");
  ctx.drawImage(source, 0, 0, w, h);
  return out;
}

/**
 * MediaBunny `canvasesAtTimestamps` cursor for export.
 *
 * MediaBunny keeps the matching sample in a "held" slot until either:
 * - a later timestamp arrives, or
 * - the timestamp iterator ends (flush).
 *
 * So a pull-driven generator must NOT block waiting for the next `get()` after
 * issuing the current timestamp — that deadlocks (producer waits for next ts,
 * consumer waits for the held sample). Instead we end the iterator when the
 * queue has no unissued requests, which forces a flush, then start a fresh
 * pump on the next `get()`. Batching multiple `get()`s (e.g. Promise.all for
 * blend pairs) still shares one iterator and keeps the sequential decode win.
 */
export class ForwardCanvasCursor {
  private readonly sink: ForwardCanvasSink;
  private readonly queue: PendingRequest[] = [];
  private lastTs = -Infinity;
  private abortPump = false;
  private closed = false;
  private pumpPromise: Promise<void> | null = null;

  constructor(sink: ForwardCanvasSink) {
    this.sink = sink;
  }

  async get(timestampSec: number): Promise<OffscreenCanvas | null> {
    if (this.closed) return null;
    const ts = Math.max(0, timestampSec);

    if (ts < this.lastTs - REWIND_EPS_SEC) {
      await this.resetIterator();
      const wrapped = await this.sink.getCanvas(ts);
      this.lastTs = ts;
      if (!wrapped) return null;
      return snapshotCanvas(wrapped.canvas);
    }

    this.lastTs = ts;
    return new Promise<OffscreenCanvas | null>((resolve, reject) => {
      this.queue.push({ timestamp: ts, issued: false, resolve, reject });
      void this.ensurePump();
    });
  }

  dispose(): void {
    this.closed = true;
    this.abortPump = true;
    const pending = this.queue.splice(0, this.queue.length);
    for (const req of pending) {
      req.resolve(null);
    }
  }

  private async resetIterator(): Promise<void> {
    this.abortPump = true;
    if (this.pumpPromise) {
      try {
        await this.pumpPromise;
      } catch {
        /* pump errors surface via pending rejects */
      }
    }
    this.abortPump = false;
    this.pumpPromise = null;
  }

  private ensurePump(): void {
    if (this.pumpPromise || this.closed) return;
    this.pumpPromise = this.runPump().finally(() => {
      this.pumpPromise = null;
      // Requests may have arrived while the previous iterator was flushing.
      if (!this.closed && !this.abortPump && this.queue.some((r) => !r.issued)) {
        this.ensurePump();
      }
    });
  }

  /**
   * Real async generator required: MediaBunny's toAsyncIterator does
   * `yield* source[Symbol.asyncIterator]()`.
   *
   * Yield every unissued queued timestamp, then return so MediaBunny flushes
   * held samples. Do not wait for future get() calls inside this generator.
   */
  private async *timestampGenerator(): AsyncGenerator<number, void, unknown> {
    while (!this.closed && !this.abortPump) {
      const next = this.queue.find((req) => !req.issued);
      if (!next) return;
      next.issued = true;
      yield next.timestamp;
    }
  }

  private async runPump(): Promise<void> {
    try {
      for await (const wrapped of this.sink.canvasesAtTimestamps(
        this.timestampGenerator(),
      )) {
        const req = this.queue.shift();
        if (!req) {
          if (this.closed || this.abortPump) break;
          continue;
        }
        if (this.closed) {
          req.resolve(null);
          break;
        }
        try {
          req.resolve(wrapped ? snapshotCanvas(wrapped.canvas) : null);
        } catch (err) {
          req.reject(err instanceof Error ? err : new Error(String(err)));
        }
        if (this.abortPump) break;
      }
    } catch (err) {
      const pending = this.queue.splice(0, this.queue.length);
      const error = err instanceof Error ? err : new Error(String(err));
      for (const req of pending) {
        req.reject(error);
      }
    } finally {
      if (this.closed || this.abortPump) {
        const leftover = this.queue.splice(0, this.queue.length);
        for (const req of leftover) {
          req.resolve(null);
        }
      }
    }
  }
}
