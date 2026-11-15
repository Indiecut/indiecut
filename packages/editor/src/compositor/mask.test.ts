import assert from "node:assert/strict";
import {
  combineMatteAlpha,
  sampleMaskAlpha,
  softstep,
} from "./mask";
import type { ResolvedClipMask } from "../project/types";

function approx(actual: number, expected: number, eps = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${expected}, got ${actual}`,
  );
}

approx(softstep(0, 1, -1), 0);
approx(softstep(0, 1, 2), 1);
approx(softstep(0, 1, 0.5), 0.5, 0.05);

approx(combineMatteAlpha(0.5, 0.5, "add"), 0.75);
approx(combineMatteAlpha(1, 0.4, "subtract"), 0.6);
approx(combineMatteAlpha(0.8, 0.5, "intersect"), 0.4);

const base = (
  partial: Partial<ResolvedClipMask> & Pick<ResolvedClipMask, "type">,
): ResolvedClipMask => ({
  id: "m1",
  invert: false,
  feather: 0,
  position: { x: 0, y: 0 },
  rotationDeg: 0,
  ...partial,
});

const circle = base({ type: "circle", size: { w: 200, h: 200 } });
assert.equal(sampleMaskAlpha(circle, 0, 0), 1);
assert.equal(sampleMaskAlpha(circle, 200, 0), 0);

const inv = base({ type: "circle", size: { w: 200, h: 200 }, invert: true });
assert.equal(sampleMaskAlpha(inv, 0, 0), 0);
assert.equal(sampleMaskAlpha(inv, 200, 0), 1);

const split = base({ type: "split" });
assert.equal(sampleMaskAlpha(split, 0, -10), 1);
assert.equal(sampleMaskAlpha(split, 0, 10), 0);

const strip = base({ type: "filmstrip", stripGap: 100 });
assert.equal(sampleMaskAlpha(strip, 0, 0), 1);
assert.equal(sampleMaskAlpha(strip, 0, 80), 0);

console.log("mask.test.ts: ok");
