import assert from "node:assert/strict";
import {
  applyChoke,
  autoSampleKeyColor,
  colorKeyDistance,
  estimateSmartKeyFromImageData,
  estimateSmartKeyParams,
  keyAlphaFromDistance,
  needsRemoveBgColor,
  removeBgFingerprint,
} from "./removeBgColor";

function approx(actual: number, expected: number, eps = 1e-3) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${expected}, got ${actual}`,
  );
}

const baseColor = {
  keyColor: [0, 255, 0] as [number, number, number],
  tolerance: 0.34,
  softness: 0.18,
  spill: 0.72,
  choke: 0.18,
};

assert.equal(needsRemoveBgColor(undefined), false);
assert.equal(
  needsRemoveBgColor({
    enabled: false,
    color: { ...baseColor },
  }),
  false,
);
assert.equal(
  needsRemoveBgColor({
    enabled: true,
    color: { ...baseColor },
  }),
  true,
);

approx(colorKeyDistance(0, 255, 0, 0, 255, 0), 0);
assert.ok(colorKeyDistance(255, 0, 0, 0, 255, 0) > 100);

approx(keyAlphaFromDistance(0, 0.34, 0.18), 0);
assert.ok(keyAlphaFromDistance(400, 0.34, 0.18) > 0.9);

approx(applyChoke(0.1, 0.18), 0);
assert.ok(applyChoke(0.5, 0.18) > 0.3);
approx(applyChoke(1, 0), 1);

{
  // Solid green 4×4 — auto-sample should land near green
  const w = 4;
  const h = 4;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 10;
    data[i + 1] = 200;
    data[i + 2] = 40;
    data[i + 3] = 255;
  }
  const [r, g, b] = autoSampleKeyColor(data, w, h);
  assert.equal(r, 10);
  assert.equal(g, 200);
  assert.equal(b, 40);
}

assert.equal(removeBgFingerprint(undefined), "");
assert.ok(
  removeBgFingerprint({
    enabled: true,
    color: { ...baseColor },
  }).startsWith("c:0,255,0"),
);
assert.equal(
  removeBgFingerprint({
    enabled: false,
    color: { ...baseColor },
  }),
  "",
);

{
  // Uniform blue backdrop + reddish subject → key near blue, tolerance below subject
  const estimated = estimateSmartKeyParams({
    backdropSamples: [
      [30, 80, 200],
      [28, 78, 198],
      [32, 82, 202],
      [29, 79, 199],
    ],
    subjectSamples: [
      [180, 90, 70],
      [170, 85, 65],
    ],
  });
  assert.ok(estimated.keyColor[2] > estimated.keyColor[0]);
  assert.ok(estimated.tolerance > 0.15 && estimated.tolerance < 0.55);
  assert.ok(estimated.softness > 0.08 && estimated.softness < 0.45);
}

{
  // Solid studio green frame — estimate should land near green
  const w = 32;
  const h = 32;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const center = x > 10 && x < 22 && y > 8 && y < 24;
      if (center) {
        data[i] = 200;
        data[i + 1] = 120;
        data[i + 2] = 90;
      } else {
        data[i] = 16;
        data[i + 1] = 185;
        data[i + 2] = 129;
      }
      data[i + 3] = 255;
    }
  }
  const estimated = estimateSmartKeyFromImageData(data, w, h);
  assert.ok(Math.abs(estimated.keyColor[0] - 16) < 8);
  assert.ok(Math.abs(estimated.keyColor[1] - 185) < 8);
  assert.ok(Math.abs(estimated.keyColor[2] - 129) < 8);
  assert.ok(estimated.tolerance >= 0.16);
}

console.log("removeBgColor.test.ts: ok");
