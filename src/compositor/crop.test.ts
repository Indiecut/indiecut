import assert from "node:assert/strict";
import {
  cropFingerprint,
  cropToSourcePixels,
  croppedUvToSourceUv,
  effectiveSourceSize,
  isFullCrop,
  normalizeCrop,
} from "./crop";

assert.equal(normalizeCrop(null), undefined);
assert.equal(normalizeCrop({ x: 0, y: 0, width: 1, height: 1 }), undefined);
assert.equal(normalizeCrop({ x: 0, y: 0, width: 0, height: 1 }), undefined);

const half = normalizeCrop({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
assert.ok(half);
assert.equal(half!.x, 0.25);
assert.equal(half!.width, 0.5);
assert.equal(isFullCrop(half), false);
assert.equal(isFullCrop(undefined), true);

// Overflow clamps into unit square
const overflow = normalizeCrop({ x: 0.8, y: 0.8, width: 0.5, height: 0.5 });
assert.ok(overflow);
assert.ok(overflow!.x + overflow!.width <= 1 + 1e-9);
assert.ok(overflow!.y + overflow!.height <= 1 + 1e-9);

const px = cropToSourcePixels(half, 200, 100);
assert.equal(px.sx, 50);
assert.equal(px.sy, 25);
assert.equal(px.sw, 100);
assert.equal(px.sh, 50);

const size = effectiveSourceSize(200, 100, half);
assert.equal(size.width, 100);
assert.equal(size.height, 50);

const uv = croppedUvToSourceUv(0.5, 0.5, half);
assert.ok(Math.abs(uv.u - 0.5) < 1e-9);
assert.ok(Math.abs(uv.v - 0.5) < 1e-9);

const uvCorner = croppedUvToSourceUv(0, 0, half);
assert.ok(Math.abs(uvCorner.u - 0.25) < 1e-9);
assert.ok(Math.abs(uvCorner.v - 0.25) < 1e-9);

assert.equal(cropFingerprint(undefined), "");
assert.ok(cropFingerprint(half).length > 0);

const fullPx = cropToSourcePixels(undefined, 200, 100);
assert.equal(fullPx.sx, 0);
assert.equal(fullPx.sy, 0);
assert.equal(fullPx.sw, 200);
assert.equal(fullPx.sh, 100);

console.log("crop.test.ts: ok");
