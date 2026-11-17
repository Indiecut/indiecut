import assert from "node:assert/strict";
import { pointInRotatedRect } from "./previewHitTest";

// Center of an unrotated box
assert.equal(pointInRotatedRect(100, 50, 100, 50, 40, 20, 0), true);

// Just inside / outside edges
assert.equal(pointInRotatedRect(119, 50, 100, 50, 40, 20, 0), true);
assert.equal(pointInRotatedRect(121, 50, 100, 50, 40, 20, 0), false);
assert.equal(pointInRotatedRect(100, 59, 100, 50, 40, 20, 0), true);
assert.equal(pointInRotatedRect(100, 61, 100, 50, 40, 20, 0), false);

// Outside corner of unrotated box
assert.equal(pointInRotatedRect(130, 70, 100, 50, 40, 20, 0), false);

// 90° rotation: former right edge becomes up/down in local space.
// Point at (100+10, 50) is inside unrotated; after 90° the box swaps axes
// (40×20 → local half 20×10 along screen axes when rotated 90°).
assert.equal(pointInRotatedRect(100, 50, 100, 50, 40, 20, 90), true);
// Along screen +X by 15: outside the rotated 20-tall half-extent? 
// After inverse -90°, (15,0) → (0,15); halfH=10 → outside.
assert.equal(pointInRotatedRect(115, 50, 100, 50, 40, 20, 90), false);
// Along screen +Y by 15: inverse maps toward local +X; halfW=20 → inside.
assert.equal(pointInRotatedRect(100, 65, 100, 50, 40, 20, 90), true);

// Degenerate size never hits
assert.equal(pointInRotatedRect(0, 0, 0, 0, 0, 10, 0), false);

console.log("previewHitTest: ok");
