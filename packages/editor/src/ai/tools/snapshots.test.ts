import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Track } from "../../project/types";
import { tracksEqual } from "./snapshots";

describe("tracksEqual", () => {
  it("compares track trees", () => {
    const a: Track[] = [
      {
        id: "t1",
        type: "video",
        locked: false,
        hidden: false,
        clips: [],
      },
    ];
    const b = structuredClone(a);
    assert.equal(tracksEqual(a, b), true);
    b[0]!.locked = true;
    assert.equal(tracksEqual(a, b), false);
  });
});
