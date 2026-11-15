import assert from "node:assert/strict";
import {
  parseAssDocument,
  parseSrtDocument,
  parseTimedTextFile,
} from "./parseTimedTextFile";

const srt = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:05,000
Second line
`;

const srtResult = parseSrtDocument(srt);
assert.equal(srtResult.lines.length, 2);
assert.equal(srtResult.lines[0]!.text, "Hello world");
assert.equal(srtResult.lines[0]!.startMs, 1000);
assert.equal(srtResult.lines[0]!.durationMs, 2500);
assert.equal(srtResult.lines[1]!.text, "Second line");

const ass = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,Hello {\\b1}ASS{\\b0}
Dialogue: 0,0:00:03.00,0:00:03.50,Default,,0,0,0,,
`;

const assResult = parseAssDocument(ass);
assert.equal(assResult.lines.length, 1);
assert.equal(assResult.lines[0]!.text, "Hello ASS");
assert.equal(assResult.lines[0]!.startMs, 1000);
assert.equal(assResult.lines[0]!.durationMs, 1500);
assert.equal(assResult.skippedCount, 1);

const byName = parseTimedTextFile({
  fileName: "demo.srt",
  input: srt,
});
assert.equal(byName.lines.length, 2);

const unsupported = parseTimedTextFile({
  fileName: "notes.txt",
  input: "not a subtitle",
});
assert.equal(unsupported.lines.length, 0);
assert.ok(unsupported.warnings.length > 0);

console.log("parseTimedTextFile.test.ts: ok");
