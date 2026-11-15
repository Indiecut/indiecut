import assert from "node:assert/strict";
import {
  downmixToMono16k,
  resampleLinear,
  SPEECH_TARGET_SAMPLE_RATE,
} from "./downmixToMono16k";

const stereo = new Float32Array([1, -1, 1, -1, 0.5, -0.5, 0.5, -0.5]);
const monoSameRate = await downmixToMono16k({
  pcm: stereo,
  sampleRate: SPEECH_TARGET_SAMPLE_RATE,
  numberOfChannels: 2,
});
assert.equal(monoSameRate.length, 4);
assert.equal(monoSameRate[0], 0);
assert.equal(monoSameRate[2], 0);

const from48k = resampleLinear({
  samples: new Float32Array(48000),
  fromRate: 48000,
  toRate: 16000,
});
assert.equal(from48k.length, 16000);

const empty = await downmixToMono16k({
  pcm: new Float32Array(0),
  sampleRate: 48000,
  numberOfChannels: 2,
});
assert.equal(empty.length, 0);

console.log("downmixToMono16k.test.ts: ok");
