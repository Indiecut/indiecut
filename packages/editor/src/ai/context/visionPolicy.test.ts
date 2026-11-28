import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAttachCheapComposite } from "./visionPolicy";

describe("shouldAttachCheapComposite", () => {
  it("off never attaches", () => {
    assert.equal(
      shouldAttachCheapComposite({
        mode: "off",
        plannerWantVision: true,
      }),
      false,
    );
  });

  it("always attaches", () => {
    assert.equal(
      shouldAttachCheapComposite({
        mode: "always",
        plannerWantVision: false,
      }),
      true,
    );
  });

  it("auto follows planner wantVision only", () => {
    assert.equal(
      shouldAttachCheapComposite({
        mode: "auto",
        plannerWantVision: true,
      }),
      true,
    );
    assert.equal(
      shouldAttachCheapComposite({
        mode: "auto",
        plannerWantVision: false,
      }),
      false,
    );
  });
});
