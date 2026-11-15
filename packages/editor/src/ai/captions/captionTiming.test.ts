import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CaptionProps } from "../../project/types";
import { splitCaptionProps } from "./captionTiming";

function caption(cues: CaptionProps["cues"], speed?: number): CaptionProps {
  return {
    cues,
    style: {
      fontFamily: "Inter, sans-serif",
      fontSize: 36,
      fontWeight: 700,
      color: "#fff",
      align: "center",
    },
    position: "bottom",
    offsetY: 0,
    ...(speed !== undefined ? { speed } : {}),
  };
}

describe("splitCaptionProps", () => {
  it("shifts right-half cues so the cut becomes local 0", () => {
    const doc = caption([
      { id: "a", startMs: 0, endMs: 1000, text: "one" },
      { id: "b", startMs: 1000, endMs: 2000, text: "two" },
      { id: "c", startMs: 2000, endMs: 3000, text: "three" },
    ]);
    const { left, right } = splitCaptionProps(doc, 1500);

    assert.equal(left.cues.length, 2);
    assert.equal(left.cues[0]!.text, "one");
    assert.equal(left.cues[1]!.text, "two");
    assert.equal(left.cues[1]!.endMs, 1500);

    assert.equal(right.cues.length, 2);
    assert.equal(right.cues[0]!.text, "two");
    assert.equal(right.cues[0]!.startMs, 0);
    assert.equal(right.cues[0]!.endMs, 500);
    assert.equal(right.cues[1]!.text, "three");
    assert.equal(right.cues[1]!.startMs, 500);
    assert.equal(right.cues[1]!.endMs, 1500);
  });

  it("uses content time when caption speed is not 1", () => {
    // speed 2× → 1000ms timeline maps to 2000ms content
    const doc = caption(
      [
        { id: "a", startMs: 0, endMs: 2000, text: "one" },
        { id: "b", startMs: 2000, endMs: 4000, text: "two" },
      ],
      2,
    );
    const { left, right } = splitCaptionProps(doc, 1000);

    assert.equal(left.cues.length, 1);
    assert.equal(left.cues[0]!.endMs, 2000);
    assert.equal(right.cues.length, 1);
    assert.equal(right.cues[0]!.text, "two");
    assert.equal(right.cues[0]!.startMs, 0);
    assert.equal(right.cues[0]!.endMs, 2000);
  });
});
