import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { progressTitleFromText } from "./progressTitle";

describe("progressTitleFromText", () => {
  it("uses the first sentence", () => {
    assert.equal(
      progressTitleFromText(
        "Adding a circle mask to the selected clip. Then I'll enable it.",
      ),
      "Adding a circle mask to the selected clip.",
    );
  });

  it("returns null for empty / tiny text", () => {
    assert.equal(progressTitleFromText(""), null);
    assert.equal(progressTitleFromText("ok"), null);
  });

  it("truncates long titles", () => {
    const long = "A".repeat(100);
    const title = progressTitleFromText(long, 40);
    assert.ok(title);
    assert.ok(title!.endsWith("…"));
    assert.ok(title!.length <= 40);
  });
});
