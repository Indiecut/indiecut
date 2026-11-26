import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyProject } from "../../project/createProject";
import type { Clip, ProjectDocument, Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import { findTool } from "./tools";
import {
  commitMutationBatch,
  createMutationBatch,
} from "../tools/mutationBatch";
import "../catalog/domains";

function seed(): void {
  const clip: Clip = {
    id: "c1",
    kind: "text",
    startMs: 0,
    durationMs: 3000,
    inMs: 0,
    outMs: 3000,
    text: { content: "Hi", fontSize: 40, color: "#fff", align: "center" },
  };
  const track: Track = {
    id: "text1",
    type: "text",
    locked: false,
    hidden: false,
    clips: [clip],
  };
  const base = createEmptyProject();
  const project: ProjectDocument = { ...base, tracks: [track] };
  getEditorStore().setProject(project);
  getEditorStore().setSelectedClipIds(["c1"]);
}

describe("protocol agent tool sequence", () => {
  it("list → describe → patch", async () => {
    seed();
    const list = findTool("capabilities_list")!;
    const describe = findTool("capability_describe")!;
    const patch = findTool("document_patch")!;

    const batch = createMutationBatch();
    const listed = await list.handler(
      { query: "transform" },
      { batch },
    );
    assert.equal(listed.ok, true);
    const caps = (listed.data as { capabilities: Array<{ id: string }> })
      .capabilities;
    assert.ok(caps.some((c) => c.id === "clip.transform"));

    const desc = await describe.handler(
      { id: "clip.transform" },
      { batch },
    );
    assert.equal(desc.ok, true);

    const patched = await patch.handler(
      {
        ops: [
          {
            op: "set",
            target: "clip",
            clipId: "c1",
            path: "transform.y",
            value: -40,
          },
        ],
      },
      { batch },
    );
    assert.equal(patched.ok, true);
    assert.equal(patched.mutated, true);
    commitMutationBatch(batch);
    const live = getEditorStore().project.tracks[0]!.clips[0]!;
    assert.equal(live.transform?.y.staticValue, -40);
  });
});
