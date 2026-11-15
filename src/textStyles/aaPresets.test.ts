import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TextProps } from "../project/types";
import {
  aaPresetMatches,
  applyAaPreset,
  markStyleCustom,
  resolveActiveAaPresetId,
  touchesAaRecipe,
} from "./aaPresets";

const base: TextProps = {
  content: "Hello",
  fontFamily: "Inter, sans-serif",
  fontSize: 64,
  fontWeight: 700,
  align: "left",
  letterSpacing: 2,
  color: "#ffffff",
  strokeWidth: 0,
};

describe("applyAaPreset", () => {
  it("sets stylePresetId and Yellow Sub paint without wiping typography", () => {
    const next = applyAaPreset(base, "yellow-pop");
    assert.equal(next.stylePresetId, "yellow-pop");
    assert.equal(next.content, "Hello");
    assert.equal(next.fontFamily, "Inter, sans-serif");
    assert.equal(next.fontSize, 64);
    assert.equal(next.fontWeight, 700);
    assert.equal(next.align, "left");
    assert.equal(next.letterSpacing, 2);
    assert.equal(next.color, "#facc15");
    assert.equal(next.strokeWidth, 4);
    assert.equal(next.shadowOffsetX, 3);
    assert.equal(next.shadowOffsetY, 3);
    assert.equal(next.retro3DColor, null);
  });

  it("None clears leftover offsets after Yellow Sub", () => {
    const styled = applyAaPreset(base, "yellow-pop");
    const cleared = applyAaPreset(styled, "none");
    assert.equal(cleared.stylePresetId, "none");
    assert.equal(cleared.content, "Hello");
    assert.equal(cleared.fontSize, 64);
    assert.equal(cleared.color, "#ffffff");
    assert.equal(cleared.strokeWidth, 0);
    assert.equal(cleared.shadowBlur, 0);
    assert.equal(cleared.shadowOffsetX, 0);
    assert.equal(cleared.shadowOffsetY, 0);
    assert.equal(cleared.retro3DColor, null);
    assert.equal(cleared.gradient, null);
  });

  it("Ice Neon sets glow shadow", () => {
    const next = applyAaPreset(base, "cyan-ice");
    assert.equal(next.stylePresetId, "cyan-ice");
    assert.equal(next.color, "#38bdf8");
    assert.equal(next.shadowColor, "#0284c7");
    assert.equal(next.shadowBlur, 18);
  });

  it("Orange Toon sets retro3DColor", () => {
    const next = applyAaPreset(base, "orange-warm");
    assert.equal(next.retro3DColor, "#7c2d12");
  });
});

describe("markStyleCustom / resolveActiveAaPresetId", () => {
  it("marks diverge as custom and clears active tile", () => {
    const styled = applyAaPreset(base, "yellow-pop");
    const custom = markStyleCustom({ ...styled, color: "#ff0000" });
    assert.equal(custom.stylePresetId, "custom");
    assert.equal(resolveActiveAaPresetId(custom), null);
  });

  it("resolves active id from stylePresetId", () => {
    const styled = applyAaPreset(base, "soft-glow");
    assert.equal(resolveActiveAaPresetId(styled), "soft-glow");
  });

  it("falls back to recipe match when stylePresetId missing", () => {
    const styled = applyAaPreset(base, "outline-black");
    const { stylePresetId: _, ...without } = styled;
    assert.equal(resolveActiveAaPresetId(without), "outline-black");
    assert.ok(
      aaPresetMatches(without, {
        id: "outline-black",
        name: "Strong Stroke",
        patch: {
          color: "#ffffff",
          strokeColor: "#000000",
          strokeWidth: 4,
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          retro3DColor: null,
          gradient: null,
        },
      }),
    );
  });
});

describe("touchesAaRecipe", () => {
  it("detects recipe field edits", () => {
    assert.equal(touchesAaRecipe({ color: "#fff" }), true);
    assert.equal(touchesAaRecipe({ retro3DColor: null }), true);
    assert.equal(touchesAaRecipe({ fontSize: 40 }), false);
    assert.equal(touchesAaRecipe({ content: "x" }), false);
  });
});
