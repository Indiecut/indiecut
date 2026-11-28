import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lineAdvanceHeight,
  readGlyphVertMetrics,
  resolveText,
} from "./rasterizeText";

function mockCtx(measure: (text: string) => Partial<TextMetrics>) {
  return {
    textBaseline: "alphabetic" as CanvasTextBaseline,
    measureText(text: string) {
      return measure(text) as TextMetrics;
    },
  };
}

describe("readGlyphVertMetrics", () => {
  it("measures with top baseline and sizes from ink extent", () => {
    const ctx = mockCtx((text) => {
      if (text.includes("gypq")) {
        // Top-baseline: almost all ink is in descent from the top point.
        return {
          actualBoundingBoxAscent: 0,
          actualBoundingBoxDescent: 55,
          fontBoundingBoxAscent: 2,
          fontBoundingBoxDescent: 56,
        };
      }
      return {
        actualBoundingBoxAscent: 0,
        actualBoundingBoxDescent: 40,
        fontBoundingBoxAscent: 0,
        fontBoundingBoxDescent: 0,
      };
    });
    const m = readGlyphVertMetrics(ctx, "HELLO", 48);
    assert.equal(ctx.textBaseline, "alphabetic"); // restored
    assert.ok(m.ascent + m.descent >= 55);
    assert.ok(m.descent >= 48 * 0.3);
  });

  it("never shrinks below heuristic floors", () => {
    const ctx = mockCtx(() => ({
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
    }));
    const m = readGlyphVertMetrics(ctx, "x", 40);
    assert.ok(m.ascent + m.descent >= 40 * 1.15);
  });
});

describe("lineAdvanceHeight", () => {
  it("does not shrink below real glyph bounds for tight lineHeight", () => {
    const t = resolveText(
      {
        content: "happy",
        fontSize: 36,
        lineHeight: 1.05,
        color: "#fff",
      },
      1,
    );
    const h = lineAdvanceHeight(t, 30, 14);
    assert.ok(h >= Math.ceil(30 + 14 + t.fontSize * 0.12));
  });
});
