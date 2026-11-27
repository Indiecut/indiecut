import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultAnimatableTransform } from "../../engine/animatable";
import { createEmptyProject } from "../../project/createProject";
import type { Clip, ProjectDocument, Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import {
  assemblePlannedContext,
  formatPlannedContextForPrompt,
  resolveTargetClipIds,
} from "./assemblePlannedContext";
import {
  ContextPlannerError,
  extractJsonObject,
  parseContextPlan,
  planContext,
  resolvePlannerModelId,
} from "./contextPlanner";
import type { ContextPlan } from "./contextPlannerTypes";

function seedProject(opts?: {
  playheadMs?: number;
  selected?: string[];
}): void {
  const textClip: Clip = {
    id: "t1",
    kind: "text",
    startMs: 1000,
    durationMs: 4000,
    inMs: 0,
    outMs: 4000,
    text: { content: "Hello", fontSize: 48, color: "#fff", align: "center" },
    transform: defaultAnimatableTransform({ x: 12, y: -40 }),
  };
  const videoClip: Clip = {
    id: "v1",
    kind: "video",
    startMs: 0,
    durationMs: 10_000,
    inMs: 0,
    outMs: 10_000,
    mediaId: "m1",
  };
  const tracks: Track[] = [
    {
      id: "video1",
      type: "video",
      locked: false,
      hidden: false,
      clips: [videoClip],
    },
    {
      id: "text1",
      type: "text",
      locked: false,
      hidden: false,
      clips: [textClip],
    },
  ];
  const base = createEmptyProject();
  const project: ProjectDocument = {
    ...base,
    width: 1920,
    height: 1080,
    playheadMs: opts?.playheadMs ?? 2500,
    tracks,
    mediaIndex: [
      {
        id: "m1",
        name: "A-roll.mp4",
        kind: "video",
        path: "media/m1.mp4",
        durationMs: 10_000,
      },
    ],
  };
  getEditorStore().setProject(project);
  getEditorStore().setSelectedClipIds(opts?.selected ?? []);
}

describe("resolvePlannerModelId", () => {
  it("downgrades sonnet to haiku", () => {
    assert.equal(resolvePlannerModelId("claude-sonnet-5-5"), "claude-haiku-5-5");
    assert.equal(resolvePlannerModelId("claude-haiku-5-5"), "claude-haiku-5-5");
  });
});

describe("extractJsonObject / parseContextPlan", () => {
  it("parses raw and fenced JSON", () => {
    const raw = parseContextPlan(
      extractJsonObject(
        '{"intent":"insert","target":"none","targetKind":null,"slices":["session"],"skimWindowMs":null,"wantVision":false}',
      ),
    );
    assert.ok(raw);
    assert.equal(raw!.intent, "insert");
    assert.equal(raw!.source, "ai");
    assert.deepEqual(raw!.slices, ["session"]);

    const fenced = parseContextPlan(
      extractJsonObject(
        'Sure:\n```json\n{"intent":"edit","target":"selection","targetKind":"text","slices":["session","target"],"skimWindowMs":null,"wantVision":false}\n```',
      ),
    );
    assert.ok(fenced);
    assert.equal(fenced!.target, "selection");
    assert.ok(fenced!.slices.includes("target"));
  });

  it("rejects invalid intent", () => {
    assert.equal(
      parseContextPlan({ intent: "nope", target: "none", slices: [] }),
      null,
    );
  });
});

describe("planContext fail-hard", () => {
  it("throws ContextPlannerError on empty text", async () => {
    seedProject();
    await assert.rejects(
      () =>
        planContext({
          apiKey: "test",
          model: "claude-sonnet-5-5",
          userText: "   ",
        }),
      (err: unknown) =>
        err instanceof ContextPlannerError &&
        /empty request/i.test(err.message),
    );
  });
});

describe("assemblePlannedContext", () => {
  it("insert plan formats session-only without skim", () => {
    seedProject({ playheadMs: 2500 });
    const plan: ContextPlan = {
      intent: "insert",
      target: "none",
      targetKind: null,
      slices: ["session"],
      skimWindowMs: null,
      wantVision: false,
      source: "ai",
    };
    const ctx = assemblePlannedContext({ plan, messages: [] });
    assert.equal(ctx.targets.length, 0);
    assert.equal(ctx.timelineSkim, null);
    const text = formatPlannedContextForPrompt(ctx);
    assert.match(text, /playhead 2500ms/);
    assert.doesNotMatch(text, /Timeline skim/);
  });

  it("edit selection includes transform for target", () => {
    seedProject({ selected: ["t1"], playheadMs: 2500 });
    const plan: ContextPlan = {
      intent: "edit",
      target: "selection",
      targetKind: "text",
      slices: ["session", "target"],
      skimWindowMs: null,
      wantVision: false,
      source: "ai",
    };
    const ids = resolveTargetClipIds(plan, 2500);
    assert.deepEqual(ids, ["t1"]);
    const ctx = assemblePlannedContext({ plan, messages: [] });
    assert.equal(ctx.targets.length, 1);
    assert.equal(ctx.targets[0]!.transform?.x, 12);
    assert.equal(ctx.targets[0]!.transform?.y, -40);
    const text = formatPlannedContextForPrompt(ctx);
    assert.match(text, /transform: x=12 y=-40/);
    assert.match(text, /id=t1/);
  });

  it("playhead_kind text resolves text under playhead", () => {
    seedProject({ selected: [], playheadMs: 2500 });
    const plan: ContextPlan = {
      intent: "edit",
      target: "playhead_kind",
      targetKind: "text",
      slices: ["session", "target"],
      skimWindowMs: null,
      wantVision: false,
      source: "ai",
    };
    assert.deepEqual(resolveTargetClipIds(plan, 2500), ["t1"]);
  });
});
