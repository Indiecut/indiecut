import assert from "node:assert/strict";
import {
  ForwardCanvasCursor,
  type ForwardCanvasSink,
  type ForwardWrappedCanvas,
} from "./forwardCanvasCursor";

/** Minimal OffscreenCanvas stand-in for Node unit tests. */
class FakeCanvas {
  width: number;
  height: number;
  readonly tag: number;
  constructor(tag: number) {
    this.tag = tag;
    this.width = 4;
    this.height = 4;
  }
  getContext() {
    return {
      drawImage() {
        /* no-op for snapshot */
      },
    };
  }
}

// @ts-expect-error test polyfill for worker OffscreenCanvas
globalThis.OffscreenCanvas = FakeCanvas;

const FRAME_TS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

function wrap(ts: number): ForwardWrappedCanvas {
  return {
    canvas: new FakeCanvas(ts) as unknown as OffscreenCanvas,
    timestamp: ts,
    duration: 0.1,
  };
}

/**
 * Mimics MediaBunny `canvases(start)`: yields the last frame at-or-before start,
 * then subsequent frames in order. Tracks how many streams were opened.
 */
function makeSequentialSink(): ForwardCanvasSink & {
  canvasesStarts: number[];
  seekCalls: number[];
} {
  const canvasesStarts: number[] = [];
  const seekCalls: number[] = [];
  return {
    canvasesStarts,
    seekCalls,
    async getCanvas(timestamp: number) {
      seekCalls.push(timestamp);
      let best: number | null = null;
      for (const t of FRAME_TS) {
        if (t <= timestamp) best = t;
      }
      return best === null ? null : wrap(best);
    },
    async *canvases(startTimestamp = 0) {
      canvasesStarts.push(startTimestamp);
      let last: number | null = null;
      let started = false;
      for (const t of FRAME_TS) {
        if (!started) {
          if (t > startTimestamp) {
            if (last !== null) yield wrap(last);
            yield wrap(t);
            started = true;
          } else if (t >= startTimestamp) {
            yield wrap(t);
            started = true;
          } else {
            last = t;
          }
          continue;
        }
        yield wrap(t);
      }
    },
  };
}

async function main() {
  const sink = makeSequentialSink();
  const cursor = new ForwardCanvasCursor(sink);

  // Sequential pulls share one canvases() stream (no per-frame re-seek).
  const a = await cursor.get(0.1);
  assert.ok(a);
  const b = await cursor.get(0.2);
  assert.ok(b);
  const c = await cursor.get(0.35);
  assert.ok(c);
  assert.deepEqual(sink.canvasesStarts, [0.1]);
  assert.deepEqual(sink.seekCalls, []);

  // Batched blend-style pulls still use one stream (serialized).
  const sink2 = makeSequentialSink();
  const cursor2 = new ForwardCanvasCursor(sink2);
  const [d, e] = await Promise.all([cursor2.get(0.1), cursor2.get(0.2)]);
  assert.ok(d && e);
  assert.equal(sink2.canvasesStarts.length, 1);

  // Rewind falls back to getCanvas and starts a new stream afterward.
  const f = await cursor.get(0.05);
  assert.ok(f);
  assert.deepEqual(sink.seekCalls, [0.05]);
  const g = await cursor.get(0.2);
  assert.ok(g);
  assert.deepEqual(sink.canvasesStarts, [0.1, 0.2]);

  cursor.dispose();
  assert.equal(await cursor.get(0.9), null);

  console.log("forwardCanvasCursor.test.ts: ok");
}

void main();
