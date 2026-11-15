import assert from "node:assert/strict";
import {
  blendChannel,
  blendModeToCompositeOperation,
  clamp01,
  needsPixelBlend,
  resolveOpacity,
} from "./blend";

function approx(actual: number, expected: number, eps = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${expected}, got ${actual}`,
  );
}

// Multiply / Screen / Linear burn (EDITOR_MATH.md)
approx(blendChannel("multiply", 0.5, 0.5), 0.25);
approx(blendChannel("multiply", 0, 0.7), 0);
approx(blendChannel("multiply", 1, 0.7), 0.7);
approx(blendChannel("screen", 0.5, 0.5), 0.75);
approx(blendChannel("linearBurn", 0.4, 0.4), 0); // 0.8 - 1 → 0
approx(blendChannel("linearBurn", 0.8, 0.7), 0.5);
approx(blendChannel("brighten", 0.2, 0.8), 0.8);
approx(blendChannel("darken", 0.2, 0.8), 0.2);
approx(blendChannel("hardLight", 0.25, 0.5), 0.25); // 2*0.25*0.5
approx(blendChannel("normal", 0.3, 0.9), 0.3);

assert.equal(blendModeToCompositeOperation("brighten"), "lighten");
assert.equal(blendModeToCompositeOperation("darken"), "darken");
assert.equal(blendModeToCompositeOperation("hardLight"), "hard-light");
assert.equal(needsPixelBlend("linearBurn"), true);
assert.equal(needsPixelBlend("multiply"), false);

assert.equal(resolveOpacity(undefined), 1);
assert.equal(resolveOpacity(0.5), 0.5);
assert.equal(resolveOpacity(2), 1);
assert.equal(resolveOpacity(-1), 0);
approx(clamp01(1.5), 1);

console.log("blend.test.ts: ok");
