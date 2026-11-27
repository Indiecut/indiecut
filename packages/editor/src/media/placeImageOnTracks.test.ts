import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_IMAGE_DURATION_MS,
  placeImageOnTracks,
} from "./placeImageOnTracks";
import type { Track } from "../project/types";

function emptyVideoTrack(id = "v1"): Track {
  return {
    id,
    type: "video",
    locked: false,
    hidden: false,
    clips: [],
  };
}

describe("placeImageOnTracks", () => {
  it("places an image clip at playhead with default duration", () => {
    const placed = placeImageOnTracks({
      tracks: [emptyVideoTrack()],
      assetId: "media_abc",
      playheadMs: 1500,
      magnetEnabled: false,
      pxPerSec: 100,
    });
    assert.ok(placed);
    assert.equal(placed!.clip.kind, "image");
    assert.equal(placed!.clip.mediaId, "media_abc");
    assert.equal(placed!.clip.startMs, 1500);
    assert.equal(placed!.clip.durationMs, AI_IMAGE_DURATION_MS);
  });

  it("prefers an overlay lane when requested", () => {
    const tracks: Track[] = [
      emptyVideoTrack("v1"),
      { id: "o1", type: "overlay", locked: false, hidden: false, clips: [] },
    ];
    const placed = placeImageOnTracks({
      tracks,
      assetId: "media_abc",
      preferOverlay: true,
      playheadMs: 0,
      magnetEnabled: false,
      pxPerSec: 100,
    });
    assert.ok(placed);
    assert.equal(placed!.trackId, "o1");
  });

  it("attaches removeBg when provided (sticker cutouts)", () => {
    const placed = placeImageOnTracks({
      tracks: [emptyVideoTrack()],
      assetId: "media_abc",
      playheadMs: 0,
      magnetEnabled: false,
      pxPerSec: 100,
      removeBg: {
        enabled: true,
        color: {
          keyColor: [16, 185, 129],
          tolerance: 0.34,
          softness: 0.18,
          spill: 0.72,
          choke: 0.18,
        },
      },
    });
    assert.ok(placed);
    assert.equal(placed!.clip.removeBg?.enabled, true);
    assert.deepEqual(placed!.clip.removeBg?.color.keyColor, [16, 185, 129]);
  });
});
