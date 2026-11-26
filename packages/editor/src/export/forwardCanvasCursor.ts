import { acquireExportCanvas } from "./exportCanvasPool";

const REWIND_EPS_SEC = 1e-3;

type SinkCanvas = OffscreenCanvas | HTMLCanvasElement;

export type ForwardWrappedCanvas = {
  canvas: SinkCanvas;
  timestamp: number;
  duration: number;
};

/**
 * Minimal sink surface used by the cursor (MediaBunny CanvasSink satisfies this).
 * Prefer `canvases()` for forward export — sequential decode without per-frame keyframe seeks.
 */
export type ForwardCanvasSink = {
  getCanvas(timestamp: number): Promise<ForwardWrappedCanvas | null>;
  canvases(
    startTimestamp?: number,
    endTimestamp?: number,
  ): AsyncGenerator<ForwardWrappedCanvas, void, unknown>;
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
 * Sequential decode cursor for export.
 *
 * Uses MediaBunny `canvases(start)` so packets are decoded once in presentation
 * order. Rewinds fall back to sparse `getCanvas`. Concurrent `get()` calls are
 * serialized so blend pairs stay ordered on one stream.
 */
export class ForwardCanvasCursor {
  private readonly sink: ForwardCanvasSink;
  private lastRequestTs = -Infinity;
  private closed = false;

  private iterator: AsyncIterator<ForwardWrappedCanvas> | null = null;
  /** True after a `canvases()` iterator completes (EOF), not after rewind/seek. */
  private streamEnded = false;
  /** Next frame already pulled from the stream (timestamp > last answered). */
  private pending: ForwardWrappedCanvas | null = null;
  /** Last frame with timestamp ≤ the most recent answered request. */
  private lastBest: ForwardWrappedCanvas | null = null;

  /** Serialize gets — Promise.all(blend) still shares one forward stream. */
  private opChain: Promise<unknown> = Promise.resolve();

  constructor(sink: ForwardCanvasSink) {
    this.sink = sink;
  }

  async get(timestampSec: number): Promise<OffscreenCanvas | null> {
    const run = this.opChain.then(() => this.getImpl(timestampSec));
    this.opChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  dispose(): void {
    this.closed = true;
    void this.closeStream();
  }

  private async getImpl(timestampSec: number): Promise<OffscreenCanvas | null> {
    if (this.closed) return null;
    const ts = Math.max(0, timestampSec);

    if (ts < this.lastRequestTs - REWIND_EPS_SEC) {
      await this.closeStream();
      const wrapped = await this.sink.getCanvas(ts);
      this.lastRequestTs = ts;
      if (!wrapped) return null;
      this.lastBest = wrapped;
      return snapshotCanvas(wrapped.canvas);
    }

    this.lastRequestTs = ts;

    // Already scanned past `ts` — lastBest still answers without pulling more.
    const alreadyPastTs =
      this.lastBest !== null &&
      this.lastBest.timestamp <= ts + REWIND_EPS_SEC &&
      this.pending !== null &&
      this.pending.timestamp > ts + REWIND_EPS_SEC;
    const streamExhaustedWithBest =
      this.streamEnded &&
      this.lastBest !== null &&
      this.lastBest.timestamp <= ts + REWIND_EPS_SEC &&
      this.iterator === null &&
      this.pending === null;
    if (alreadyPastTs || streamExhaustedWithBest) {
      return snapshotCanvas(this.lastBest!.canvas);
    }

    if (!this.iterator) {
      this.iterator = this.sink.canvases(ts)[Symbol.asyncIterator]();
      this.streamEnded = false;
      this.pending = null;
      this.lastBest = null;
    }

    while (true) {
      const next = this.pending ?? (await this.pullNext());
      this.pending = null;
      if (!next) break;

      if (next.timestamp <= ts + REWIND_EPS_SEC) {
        this.lastBest = next;
        continue;
      }

      // First frame after ts — hold for a later get().
      this.pending = next;
      break;
    }

    if (!this.lastBest) return null;
    return snapshotCanvas(this.lastBest.canvas);
  }

  private async pullNext(): Promise<ForwardWrappedCanvas | null> {
    if (!this.iterator) return null;
    const result = await this.iterator.next();
    if (result.done) {
      this.iterator = null;
      this.streamEnded = true;
      return null;
    }
    return result.value;
  }

  private async closeStream(): Promise<void> {
    const it = this.iterator;
    this.iterator = null;
    this.pending = null;
    this.lastBest = null;
    this.streamEnded = false;
    if (it?.return) {
      try {
        await it.return(undefined);
      } catch {
        /* ignore */
      }
    }
  }
}
