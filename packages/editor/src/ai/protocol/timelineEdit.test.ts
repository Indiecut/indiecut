import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyProject } from "../../project/createProject";
import type { Clip, ProjectDocument, Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import {
  commitMutationBatch,
  createMutationBatch,
} from "../tools/mutationBatch";
import { executeTimelineEdit } from "./timelineEdit";
import { inspectConfirmGate } from "../tools/confirmGate";
import "../catalog/domains";

function seedProject(tracks: Track[]): void {
  const base = createEmptyProject();
  const project: ProjectDocument = {
    ...base,
    tracks,
    playheadMs: 1500,
  };
  getEditorStore().setProject(project);
}

function textClip(partial: Partial<Clip> & { id: string }): Clip {
  return {
    kind: "text",
    startMs: 0,
    durationMs: 3000,
    inMs: 0,
    outMs: 3000,
    text: { content: "Hello", fontSize: 48, color: "#fff", align: "center" },
    ...partial,
  };
}

describe("timeline_edit protocol", () => {
  it("moves, trims, splits, deletes, and inserts text via MutationBatch", async () => {
    const track: Track = {
      id: "text1",
      type: "text",
      locked: false,
      hidden: false,
      clips: [
        textClip({ id: "c1", startMs: 0, durationMs: 4000, outMs: 4000 }),
        textClip({
          id: "c2",
          startMs: 5000,
          durationMs: 2000,
          outMs: 2000,
          text: { content: "Two", fontSize: 36, color: "#fff", align: "center" },
        }),
      ],
    };
    seedProject([track]);

    let batch = createMutationBatch();
    let result = await executeTimelineEdit(
      { action: "move", clipId: "c1", startMs: 1000 },
      batch,
    );
    assert.equal(result.ok, true);
    assert.equal(
      batch.tracks[0]!.clips.find((c) => c.id === "c1")!.startMs,
      1000,
    );
    commitMutationBatch(batch);

    batch = createMutationBatch();
    result = await executeTimelineEdit(
      { action: "trim", clipId: "c1", durationMs: 2000 },
      batch,
    );
    assert.equal(result.ok, true);
    assert.equal(
      batch.tracks[0]!.clips.find((c) => c.id === "c1")!.durationMs,
      2000,
    );
    commitMutationBatch(batch);

    batch = createMutationBatch();
    // c1 is at startMs=1000 duration=2000 after move+trim — split mid-clip.
    result = await executeTimelineEdit(
      { action: "split", clipId: "c1", atMs: 2000 },
      batch,
    );
    assert.equal(result.ok, true, result.summary);
    assert.equal(batch.tracks[0]!.clips.length, 3);
    commitMutationBatch(batch);

    batch = createMutationBatch();
    result = await executeTimelineEdit(
      { action: "delete", clipIds: ["c2"] },
      batch,
    );
    assert.equal(result.ok, true);
    assert.ok(!batch.tracks[0]!.clips.some((c) => c.id === "c2"));
    commitMutationBatch(batch);

    batch = createMutationBatch();
    result = await executeTimelineEdit(
      { action: "insertText", content: "New title", startMs: 9000 },
      batch,
    );
    assert.equal(result.ok, true);
    assert.ok(
      batch.tracks.some((t) =>
        t.clips.some((c) => c.text?.content === "New title"),
      ),
    );
  });

  it("confirm gate still fires for multi-delete", () => {
    const tracks: Track[] = [
      {
        id: "t1",
        type: "text",
        locked: false,
        hidden: false,
        clips: [
          textClip({ id: "a" }),
          textClip({ id: "b", startMs: 4000 }),
        ],
      },
    ];
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
  });
});
