import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAttachCheapComposite } from "./visionPolicy";

describe("shouldAttachCheapComposite", () => {
  it("off never attaches", () => {
    assert.equal(
      shouldAttachCheapComposite({
        mode: "off",
        userText: "what’s wrong with this frame",
        hasSelection: false,
      }),
      false,
    );
  });

  it("always attaches", () => {
    assert.equal(
      shouldAttachCheapComposite({
        mode: "always",
        userText: "hello",
        hasSelection: true,
      }),
      true,
    );
  });

  it("auto skips structural property asks with selection", () => {
    assert.equal(
      shouldAttachCheapComposite({
        mode: "auto",
        userText: "make the selected title bigger and white",
        hasSelection: true,
      }),
      false,
    );
  });

  it("auto attaches for visual asks", () => {
    assert.equal(
      shouldAttachCheapComposite({
        mode: "auto",
        userText: "what’s wrong with this frame",
        hasSelection: false,
      }),
      true,
    );
  });

  it("auto attaches when empty selection refers to this", () => {
    assert.equal(
      shouldAttachCheapComposite({
        mode: "auto",
        userText: "fix this up",
        hasSelection: false,
      }),
      true,
    );
  });
});
