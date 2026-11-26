import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Track } from "../../project/types";
import { collectAffectedItems } from "./runChatTurn";

function textTrack(clipId: string, content: string): Track[] {
  return [
    {
      id: "v1",
      type: "video",
      locked: false,
      hidden: false,
      clips: [
        {
          id: clipId,
          kind: "text",
          startMs: 0,
          durationMs: 2000,
          inMs: 0,
          outMs: 2000,
          text: { content },
        },
      ],
    },
  ];
}

describe("collectAffectedItems", () => {
  it("appends on {clip_name} using text content", () => {
    const items = collectAffectedItems(
      [
        {
          result: {
            ok: true,
            mutated: true,
            summary: "Updated animation on clip_b",
            data: { clipId: "clip_b" },
          },
        },
      ],
      { tracks: textTrack("clip_b", "Welcome title") },
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]!.label, "Updated animation on Welcome title");
    assert.equal(items[0]!.clipId, "clip_b");
  });

  it("appends on {media name} for generated audio", () => {
    const tracks: Track[] = [
      {
        id: "a1",
        type: "audio",
        locked: false,
        hidden: false,
        clips: [
          {
            id: "clip_a",
            kind: "audio",
            mediaId: "media_vo",
            startMs: 0,
            durationMs: 1000,
            inMs: 0,
            outMs: 1000,
          },
        ],
      },
    ];
    const items = collectAffectedItems(
      [
        {
          result: {
            ok: true,
            mutated: true,
            summary: "Generated voiceover at playhead",
            data: {
              clipId: "clip_a",
              trackId: "a1",
            },
          },
        },
      ],
      {
        tracks,
        mediaNameById: new Map([["media_vo", "AI VO: Welcome back"]]),
      },
    );
    assert.deepEqual(items[0], {
      clipId: "clip_a",
      trackId: "a1",
      label: "Generated voiceover at playhead on AI VO: Welcome back",
    });
  });

  it("expands clipIds and rightClipId", () => {
    const items = collectAffectedItems([
      {
        result: {
          ok: true,
          mutated: true,
          summary: "Deleted 2 clips",
          data: { clipIds: ["c1", "c2"] },
        },
      },
      {
        result: {
          ok: true,
          mutated: true,
          summary: "Split at playhead",
          data: { clipId: "left", rightClipId: "right", trackId: "v1" },
        },
      },
    ]);
    assert.equal(items.length, 4);
    assert.equal(items[0]!.label, "Deleted 2 clips on c1");
    assert.equal(items[1]!.label, "Deleted 2 clips on c2");
    assert.equal(items[2]!.clipId, "left");
    assert.equal(items[3]!.clipId, "right");
  });

  it("falls back to beforeTracks for deleted clips", () => {
    const before = textTrack("gone", "Old title");
    const items = collectAffectedItems(
      [
        {
          result: {
            ok: true,
            mutated: true,
            summary: "Deleted gone",
            data: { clipIds: ["gone"] },
          },
        },
      ],
      { tracks: [], beforeTracks: before },
    );
    assert.equal(items[0]!.label, "Deleted gone on Old title");
  });

  it("skips non-mutating and failed results", () => {
    const items = collectAffectedItems([
      {
        result: {
          ok: true,
          mutated: false,
          summary: "Read selection",
          data: { clipId: "c1" },
        },
      },
      {
        result: {
          ok: false,
          mutated: true,
          summary: "Failed",
          data: { clipId: "c2" },
        },
      },
    ]);
    assert.equal(items.length, 0);
  });
});
