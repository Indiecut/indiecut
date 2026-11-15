import assert from "node:assert/strict";
import {
  alignmentOffsets,
  clampAlignmentOffsets,
  computeFittedRect,
  type FittedRect,
} from "./transform";
import type { ResolvedTransform } from "../engine/animatable";

const identity: ResolvedTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  uniformScale: true,
};

const frameW = 1920;
const frameH = 1080;

// Pillarbox contain: 9:16 source in 16:9 frame
const fitted = computeFittedRect(1080, 1920, frameW, frameH, "contain");
assert.ok(fitted);
assert.ok(fitted.drawW < frameW);

const left = alignmentOffsets(fitted, identity, frameW, frameH, "left");
const right = alignmentOffsets(fitted, identity, frameW, frameH, "right");
const center = alignmentOffsets(fitted, identity, frameW, frameH, "center");
assert.equal(center.x, 0);
assert.ok(left.x < 0);
assert.ok(right.x > 0);

// Left edge at 0 after left align
const halfScaledW = (fitted.drawW * 1) / 2;
assert.ok(Math.abs(frameW / 2 + left.x - halfScaledW) < 1e-6);

// Extreme offset is clamped so layer stays partially visible
const extreme = clampAlignmentOffsets(
  50000,
  0,
  fitted.drawW,
  fitted.drawH,
  frameW,
  frameH,
  1,
);
assert.ok(extreme.x < 50000);
const leftEdge = frameW / 2 + extreme.x - fitted.drawW / 2;
assert.ok(leftEdge <= frameW - 1 + 1e-6);

// Scaled-up layer left-align keeps left edge at 0
const zoomed: ResolvedTransform = { ...identity, scaleX: 3, scaleY: 3 };
const zoomLeft = alignmentOffsets(fitted, zoomed, frameW, frameH, "left");
const zoomHalf = (fitted.drawW * 3) / 2;
assert.ok(Math.abs(frameW / 2 + zoomLeft.x - zoomHalf) < 1e-6);

// Degenerate tiny content: clamp centers rather than NaN
const tiny: FittedRect = { drawW: 0.5, drawH: 0.5, dx: 0, dy: 0 };
const tinyAlign = alignmentOffsets(
  tiny,
  { ...identity, x: 9999, y: 9999 },
  frameW,
  frameH,
  "right",
  "bottom",
  8,
);
assert.ok(Number.isFinite(tinyAlign.x));
assert.ok(Number.isFinite(tinyAlign.y));

console.log("transform.test.ts: ok");
