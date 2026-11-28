import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeAudioOnTracks } from "./placeAudioOnTracks";
import type { Track } from "../project/types";

function emptyAudioTrack(id = "a1"): Track {
  return {
    id,
    type: "audio",
    locked: false,
    hidden: false,
    clips: [],
  };
}

describe("placeAudioOnTracks", () => {
  it("places an audio clip at playhead with given duration", () => {
    const placed = placeAudioOnTracks({
      tracks: [emptyAudioTrack()],
      assetId: "media_vo",
      durationMs: 2400,
      playheadMs: 1500,
      magnetEnabled: false,
      pxPerSec: 100,
    });
    assert.ok(placed);
    assert.equal(placed!.clip.kind, "audio");
    assert.equal(placed!.clip.mediaId, "media_vo");
    assert.equal(placed!.clip.startMs, 1500);
    assert.equal(placed!.clip.durationMs, 2400);
    assert.equal(placed!.trackId, "a1");
  });

  it("spills to a new audio track when preferred is occupied", () => {
    const tracks: Track[] = [
      {
        id: "a1",
        type: "audio",
        locked: false,
        hidden: false,
        clips: [
          {
            id: "c1",
            kind: "audio",
            mediaId: "m1",
            startMs: 0,
            durationMs: 5000,
            inMs: 0,
            outMs: 5000,
          },
        ],
      },
    ];
    const placed = placeAudioOnTracks({
      tracks,
      assetId: "media_vo",
      durationMs: 1000,
      playheadMs: 0,
      magnetEnabled: false,
      pxPerSec: 100,
      targetTrackId: "a1",
    });
    assert.ok(placed);
    assert.notEqual(placed!.trackId, "a1");
    assert.equal(placed!.clip.kind, "audio");
  });

  it("honors exactStart without magnet snap", () => {
    const placed = placeAudioOnTracks({
      tracks: [emptyAudioTrack()],
      assetId: "media_vo",
      durationMs: 1000,
      startMs: 333,
      exactStart: true,
      playheadMs: 0,
      magnetEnabled: true,
      pxPerSec: 100,
    });
    assert.ok(placed);
    assert.equal(placed!.clip.startMs, 333);
  });
});
