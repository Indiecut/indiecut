import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultAnimatableTransform } from "../../engine/animatable";
import { createEmptyProject } from "../../project/createProject";
import type { Clip, ProjectDocument, Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import {
  commitMutationBatch,
  createMutationBatch,
} from "../tools/mutationBatch";
import { executeDocumentPatch } from "./documentPatch";
import "../catalog/domains";

function seed(tracks: Track[]): void {
  const base = createEmptyProject();
  const project: ProjectDocument = { ...base, tracks, playheadMs: 0 };
  getEditorStore().setProject(project);
  getEditorStore().setSelectedClipIds(["c1"]);
}

function textClip(): Clip {
  return {
    id: "c1",
    kind: "text",
    startMs: 0,
    durationMs: 3000,
    inMs: 0,
    outMs: 3000,
    transform: defaultAnimatableTransform(),
    text: { content: "Hello", fontSize: 48, color: "#fff", align: "center" },
  };
}

describe("document_patch", () => {
  it("sets text color and transform statically", () => {
    seed([
      {
        id: "text1",
        type: "text",
        locked: false,
        hidden: false,
        clips: [textClip()],
      },
    ]);
    const batch = createMutationBatch();
    const result = executeDocumentPatch(
      {
        ops: [
          {
            op: "set",
            target: "clip",
            clipId: "c1",
            path: "text.color",
            value: "#F3E3C3",
          },
          {
            op: "set",
            target: "clip",
            clipId: "c1",
            path: "transform.x",
            value: 120,
          },
        ],
      },
      batch,
    );
    assert.equal(result.ok, true);
    const clip = batch.tracks[0]!.clips[0]!;
    assert.equal(clip.text?.color, "#F3E3C3");
    assert.equal(clip.transform?.x.staticValue, 120);
    commitMutationBatch(batch);
  });

  it("sets text.runs and syncs content", () => {
    seed([
      {
        id: "text1",
        type: "text",
        locked: false,
        hidden: false,
        clips: [textClip()],
      },
    ]);
    const batch = createMutationBatch();
    const result = executeDocumentPatch(
      {
        ops: [
          {
            op: "set",
            target: "clip",
            clipId: "c1",
            path: "text.runs",
            value: [
              {
                text: "NEW ",
                style: { fontWeight: 900, highlight: "#facc15", color: "#0f172a" },
              },
              {
                text: "DROP",
                style: {
                  fontWeight: 900,
                  gradient: "linear-gradient(90deg, #f59e0b 0%, #ec4899 100%)",
                },
              },
            ],
          },
        ],
      },
      batch,
    );
    assert.equal(result.ok, true);
    const clip = batch.tracks[0]!.clips[0]!;
    assert.equal(clip.text?.content, "NEW DROP");
    assert.equal(clip.text?.runs?.length, 2);
    assert.equal(clip.text?.runs?.[0]?.style?.highlight, "#facc15");
    assert.match(clip.text?.runs?.[1]?.style?.gradient ?? "", /linear-gradient/);
  });

  it("rejects unknown paths with capability hint", () => {
    seed([
      {
        id: "text1",
        type: "text",
        locked: false,
        hidden: false,
        clips: [textClip()],
      },
    ]);
    const batch = createMutationBatch();
    const result = executeDocumentPatch(
      {
        ops: [
          {
            op: "set",
            target: "clip",
            clipId: "c1",
            path: "notAReal.path",
            value: 1,
          },
        ],
      },
      batch,
    );
    assert.equal(result.ok, false);
    assert.match(result.summary, /Unknown path|Unhandled path/i);
  });

  it("sets keyframes via keyframe.set", () => {
    seed([
      {
        id: "text1",
        type: "text",
        locked: false,
        hidden: false,
        clips: [textClip()],
      },
    ]);
    const batch = createMutationBatch();
    // First create a keyed property by setting a keyframe
    const result = executeDocumentPatch(
      {
        ops: [
          {
            op: "keyframe.set",
            target: "clip",
            clipId: "c1",
            animPath: "transform.x",
            timeOffsetMs: 0,
            value: 0,
          },
          {
            op: "keyframe.set",
            target: "clip",
            clipId: "c1",
            animPath: "transform.x",
            timeOffsetMs: 1000,
            value: 200,
          },
        ],
      },
      batch,
    );
    assert.equal(result.ok, true);
    const prop = batch.tracks[0]!.clips[0]!.transform!.x;
    assert.ok(prop);
    assert.equal(prop.keyframes.length, 2);
    assert.equal(prop.keyframes[1]!.value, 200);
  });

  it("normalizes bare-number mask payloads from AI", () => {
    seed([
      {
        id: "v1",
        type: "video",
        locked: false,
        hidden: false,
        clips: [
          {
            id: "c1",
            kind: "video",
            mediaId: "m1",
            startMs: 0,
            durationMs: 3000,
            inMs: 0,
            outMs: 3000,
          },
        ],
      },
    ]);
    const batch = createMutationBatch();
    const result = executeDocumentPatch(
      {
        ops: [
          {
            op: "set",
            target: "clip",
            clipId: "c1",
            path: "masks",
            value: [
              {
                type: "circle",
                invert: false,
                feather: 12,
                position: { x: 10, y: -20 },
                rotationDeg: 15,
                size: { w: 500, h: 400 },
              },
            ],
          },
        ],
      },
      batch,
    );
    assert.equal(result.ok, true);
    const clip = batch.tracks[0]!.clips[0]!;
    assert.equal(clip.masksEnabled, true);
    assert.equal(clip.masks?.length, 1);
    const mask = clip.masks![0]!;
    assert.equal(mask.type, "circle");
    assert.equal(typeof mask.feather, "object");
    assert.equal(mask.feather.staticValue, 12);
    assert.equal(mask.position.x.staticValue, 10);
    assert.equal(mask.position.y.staticValue, -20);
    assert.equal(mask.rotationDeg.staticValue, 15);
    assert.equal(mask.size?.w.staticValue, 500);
    assert.ok(mask.id);
  });

  it("patches project playhead and selection", () => {
    seed([
      {
        id: "text1",
        type: "text",
        locked: false,
        hidden: false,
        clips: [textClip()],
      },
    ]);
    const batch = createMutationBatch();
    const result = executeDocumentPatch(
      {
        ops: [
          { op: "set", target: "project", path: "playheadMs", value: 2500 },
          {
            op: "set",
            target: "session",
            path: "selection",
            value: ["c1"],
          },
        ],
      },
      batch,
    );
    assert.equal(result.ok, true);
    assert.equal(batch.projectPatch.playheadMs, 2500);
    assert.deepEqual(batch.selectionClipIds, ["c1"]);
    commitMutationBatch(batch);
    assert.equal(getEditorStore().project.playheadMs, 2500);
  });
});
