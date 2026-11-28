import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Track } from "../../project/types";
import { inspectConfirmGate } from "./confirmGate";
import "../catalog/domains";

function makeTrack(clips: Array<{ id: string; durationMs: number }>): Track[] {
  return [
    {
      id: "t1",
      type: "video",
      locked: false,
      hidden: false,
      clips: clips.map((c) => ({
        id: c.id,
        kind: "video" as const,
        startMs: 0,
        durationMs: c.durationMs,
        inMs: 0,
        outMs: c.durationMs,
      })),
    },
  ];
}

describe("inspectConfirmGate", () => {
  it("gates multi-clip delete via timeline_edit", () => {
    const tracks = makeTrack([
      { id: "a", durationMs: 1000 },
      { id: "b", durationMs: 1000 },
    ]);
    const plan = inspectConfirmGate(
      [
        {
          id: "1",
          name: "timeline_edit",
          input: { action: "delete", clipIds: ["a", "b"] },
        },
      ],
      tracks,
    );
    assert.ok(plan);
    assert.match(plan.summary, /Delete 2/);
    assert.equal(plan.toolUses.length, 1);
  });

  it("does not gate single-clip delete", () => {
    const tracks = makeTrack([{ id: "a", durationMs: 1000 }]);
    const plan = inspectConfirmGate(
      [
        {
          id: "1",
          name: "timeline_edit",
          input: { action: "delete", clipIds: ["a"] },
        },
      ],
      tracks,
    );
    assert.equal(plan, null);
  });

  it("gates large-range trim (>50% or >10s)", () => {
    const tracks = makeTrack([{ id: "a", durationMs: 20_000 }]);
    const plan = inspectConfirmGate(
      [
        {
          id: "1",
          name: "timeline_edit",
          input: { action: "trim", clipId: "a", durationMs: 2000 },
        },
      ],
      tracks,
    );
    assert.ok(plan);
    assert.match(plan.summary, /Large trim/i);
  });

  it("does not gate small trim", () => {
    const tracks = makeTrack([{ id: "a", durationMs: 5000 }]);
    const plan = inspectConfirmGate(
      [
        {
          id: "1",
          name: "timeline_edit",
          input: { action: "trim", clipId: "a", durationMs: 4500 },
        },
      ],
      tracks,
    );
    assert.equal(plan, null);
  });

  it("gates project resolutionMode patch", () => {
    const plan = inspectConfirmGate(
      [
        {
          id: "1",
          name: "document_patch",
          input: {
            ops: [
              {
                op: "set",
                target: "project",
                path: "resolutionMode",
                value: "1080p",
              },
            ],
          },
        },
      ],
      [],
    );
    assert.ok(plan);
    assert.match(plan.summary, /resolutionMode/);
  });
});
