import assert from "node:assert/strict";
import {
  ForwardCanvasCursor,
  type ForwardCanvasSink,
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

/**
 * Mimics MediaBunny held-sample behavior: a queried timestamp's canvas is only
 * emitted once the timestamp iterator ends (flush) or a later timestamp arrives.
 */
function makeHeldSampleSink(): ForwardCanvasSink & {
  sequentialCalls: number[];
  seekCalls: number[];
} {
  const sequentialCalls: number[] = [];
  const seekCalls: number[] = [];
  return {
    sequentialCalls,
    seekCalls,
    async getCanvas(timestamp: number) {
      seekCalls.push(timestamp);
      return { canvas: new FakeCanvas(timestamp) as unknown as OffscreenCanvas };
    },
    async *canvasesAtTimestamps(timestamps: AsyncIterable<number>) {
      const collected: number[] = [];
      for await (const ts of timestamps) {
        sequentialCalls.push(ts);
        collected.push(ts);
      }
      // Flush held samples only after the timestamp iterator ends.
      for (const ts of collected) {
        yield { canvas: new FakeCanvas(ts) as unknown as OffscreenCanvas };
      }
    },
  };
}

async function main() {
  const sink = makeHeldSampleSink();
  const cursor = new ForwardCanvasCursor(sink);

  // Single pulls must complete (iterator ends → flush). Deadlock regression.
  const a = await cursor.get(0.1);
  assert.ok(a);
  assert.deepEqual(sink.sequentialCalls, [0.1]);

  const b = await cursor.get(0.2);
  assert.ok(b);
  assert.deepEqual(sink.sequentialCalls, [0.1, 0.2]);

  // Batched pulls share one iterator
  const sink2 = makeHeldSampleSink();
  const cursor2 = new ForwardCanvasCursor(sink2);
  const [c, d] = await Promise.all([cursor2.get(0.3), cursor2.get(0.4)]);
  assert.ok(c && d);
  assert.deepEqual(sink2.sequentialCalls, [0.3, 0.4]);

  // Rewind falls back to getCanvas
  const e = await cursor.get(0.05);
  assert.ok(e);
  assert.deepEqual(sink.seekCalls, [0.05]);

  cursor.dispose();
  assert.equal(await cursor.get(0.9), null);

  console.log("forwardCanvasCursor.test.ts: ok");
}

void main();
