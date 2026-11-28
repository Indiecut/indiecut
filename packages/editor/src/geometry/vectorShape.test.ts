import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClosedPath,
  ensureMinPoints,
  normalizePointCount,
  normalizeToUnitBox,
  pointsFingerprint,
  pointsToPathD,
  presetPoints,
  regularPolygon,
} from "./vectorShape";

describe("vectorShape", () => {
  it("builds preset polygons with at least 3 points", () => {
    for (const kind of [
      "circle",
      "rectangle",
      "roundedRect",
      "triangle",
      "diamond",
      "hexagon",
      "star",
      "heart",
      "arrow",
    ] as const) {
      const pts = presetPoints(kind);
      assert.ok(pts.length >= 3, kind);
    }
  });

  it("normalizes point count along perimeter", () => {
    const src = regularPolygon(4, 0.5);
    const out = normalizePointCount(src, 8);
    assert.equal(out.length, 8);
  });

  it("ensureMinPoints pads short arrays", () => {
    const out = ensureMinPoints([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    assert.equal(out.length, 3);
  });

  it("normalizeToUnitBox centers and scales", () => {
    const out = normalizeToUnitBox([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]);
    const xs = out.map((p) => p.x);
    const ys = out.map((p) => p.y);
    assert.ok(Math.min(...xs) >= -0.51);
    assert.ok(Math.max(...xs) <= 0.51);
    assert.ok(Math.min(...ys) >= -0.51);
    assert.ok(Math.max(...ys) <= 0.51);
  });

  it("buildClosedPath walks all vertices", () => {
    const cmds: string[] = [];
    const ctx = {
      beginPath() {
        cmds.push("begin");
      },
      moveTo(x: number, y: number) {
        cmds.push(`M${x},${y}`);
      },
      lineTo(x: number, y: number) {
        cmds.push(`L${x},${y}`);
      },
      closePath() {
        cmds.push("Z");
      },
    };
    buildClosedPath(ctx, presetPoints("diamond"), 100, 50);
    assert.equal(cmds[0], "begin");
    assert.equal(cmds[cmds.length - 1], "Z");
    assert.ok(cmds.length >= 5);
  });

  it("pointsFingerprint is stable", () => {
    const a = pointsFingerprint([
      { x: 0.1, y: -0.2 },
      { x: 0.3, y: 0.4 },
    ]);
    const b = pointsFingerprint([
      { x: 0.1, y: -0.2 },
      { x: 0.3, y: 0.4 },
    ]);
    assert.equal(a, b);
  });

  it("pointsToPathD emits closed SVG path in ±0.5 space", () => {
    const d = pointsToPathD([
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
      { x: 0, y: 0.5 },
    ]);
    assert.match(d, /^M-0\.5 -0\.5/);
    assert.ok(d.endsWith(" Z"));
    assert.ok(d.includes("L0.5 -0.5"));
  });
});
