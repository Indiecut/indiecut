import assert from "node:assert/strict";
import {
  MIN_LINE_DURATION_MS,
  segmentSpeechIntoLines,
} from "./segmentSpeechIntoLines";

const lines = segmentSpeechIntoLines({
  spans: [
    {
      text: "hello world from indiecut captions",
      startSec: 1,
      endSec: 5,
    },
  ],
  wordsPerLine: 3,
});

assert.equal(lines.length, 2);
assert.equal(lines[0]!.text, "hello world from");
assert.equal(lines[1]!.text, "indiecut captions");
assert.ok(lines[0]!.durationMs >= MIN_LINE_DURATION_MS);
assert.ok(lines[1]!.startMs >= lines[0]!.startMs + lines[0]!.durationMs);

const empty = segmentSpeechIntoLines({
  spans: [{ text: "   ", startSec: 0, endSec: 1 }],
});
assert.equal(empty.length, 0);

console.log("segmentSpeechIntoLines.test.ts: ok");
