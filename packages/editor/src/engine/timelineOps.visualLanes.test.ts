import assert from "node:assert/strict";
import {
  clipCanMoveToTrack,
  creatableTypeForClipKind,
  ensureTrackForRange,
  isSharedVisualClipKind,
  isSharedVisualTrack,
  moveClip,
  pruneEmptyTracks,
  reorderTrack,
  trackCanReorder,
} from "./timelineOps";
import { createEmptyTrack } from "../project/createProject";
import type { Clip, Track } from "../project/types";
import { defaultAnimatableTransform } from "./animatable";

function clip(partial: Partial<Clip> & Pick<Clip, "id" | "kind">): Clip {
  return {
    startMs: 0,
    durationMs: 1000,
    inMs: 0,
    outMs: 1000,
    transform: defaultAnimatableTransform(),
    ...partial,
  };
}

function tracksFixture(): Track[] {
  return [
    {
      ...createEmptyTrack("text", "t_text"),
      clips: [clip({ id: "c_text", kind: "text" })],
    },
    {
      ...createEmptyTrack("sticker", "t_sticker"),
      clips: [clip({ id: "c_sticker", kind: "sticker", stickerId: "s1" })],
    },
    {
      ...createEmptyTrack("overlay", "t_overlay"),
      clips: [clip({ id: "c_image", kind: "image", mediaId: "m1" })],
    },
    {
      ...createEmptyTrack("video", "t_video"),
      clips: [clip({ id: "c_video", kind: "video", mediaId: "m2" })],
    },
    createEmptyTrack("audio", "t_audio"),
  ];
}

assert.equal(isSharedVisualTrack("text"), true);
assert.equal(isSharedVisualTrack("caption"), false);
assert.equal(isSharedVisualClipKind("sticker"), true);
assert.equal(isSharedVisualClipKind("audio"), false);
assert.equal(creatableTypeForClipKind("sticker"), "sticker");
assert.equal(creatableTypeForClipKind("video"), "overlay");
assert.equal(creatableTypeForClipKind("text"), "text");

{
  const tracks = tracksFixture();
  const textTrack = tracks[0]!;
  const stickerTrack = tracks[1]!;
  const overlayTrack = tracks[2]!;
  const videoTrack = tracks[3]!;
  const audioTrack = tracks[4]!;
  const textClip = textTrack.clips[0]!;
  const imageClip = overlayTrack.clips[0]!;
  const videoClip = videoTrack.clips[0]!;

  assert.equal(
    clipCanMoveToTrack(textClip, textTrack, overlayTrack),
    false,
    "text may not land on overlay",
  );
  assert.equal(
    clipCanMoveToTrack(imageClip, overlayTrack, textTrack),
    false,
    "image may not land on text lane",
  );
  assert.equal(
    clipCanMoveToTrack(textClip, textTrack, stickerTrack),
    false,
    "text may not land on sticker",
  );
  assert.equal(
    clipCanMoveToTrack(videoClip, videoTrack, overlayTrack),
    true,
    "video may move onto overlay",
  );
  assert.equal(
    clipCanMoveToTrack(imageClip, overlayTrack, videoTrack),
    true,
    "image may move onto video",
  );
  assert.equal(
    clipCanMoveToTrack(textClip, textTrack, audioTrack),
    false,
    "text may not move onto audio",
  );
}

{
  // Empty overlay: text aims at it → new text lane beside, not onto overlay.
  const tracks: Track[] = [
    {
      ...createEmptyTrack("text", "t_text"),
      clips: [clip({ id: "c_text", kind: "text" })],
    },
    createEmptyTrack("overlay", "t_overlay"),
    createEmptyTrack("video", "t_video"),
  ];
  const moved = moveClip({
    tracks,
    clipId: "c_text",
    startMs: 0,
    playheadMs: 0,
    magnetEnabled: false,
    pxPerSec: 64,
    targetTrackId: "t_overlay",
    intentionalLaneMove: true,
  });
  assert.ok(moved);
  const overlay = moved!.tracks.find((t) => t.id === "t_overlay");
  assert.equal(overlay?.clips.length, 0, "overlay stays empty");
  const host = moved!.tracks.find((t) => t.clips.some((c) => c.id === "c_text"));
  assert.ok(host);
  assert.equal(host!.type, "text");
}

{
  // Dropping onto a busy overlay creates a spill lane beside it (above in array).
  const tracks: Track[] = [
    {
      ...createEmptyTrack("text", "t_text"),
      clips: [clip({ id: "c_text", kind: "text", startMs: 0, durationMs: 2000 })],
    },
    {
      ...createEmptyTrack("overlay", "t_overlay"),
      clips: [
        clip({
          id: "c_image",
          kind: "image",
          mediaId: "m1",
          startMs: 0,
          durationMs: 2000,
        }),
      ],
    },
    createEmptyTrack("video", "t_video"),
  ];
  const moved = moveClip({
    tracks,
    clipId: "c_text",
    startMs: 0,
    playheadMs: 0,
    magnetEnabled: false,
    pxPerSec: 64,
    targetTrackId: "t_overlay",
    intentionalLaneMove: true,
  });
  assert.ok(moved);
  assert.ok(moved!.usedSpillTrackId);
  const spill = moved!.tracks.find((t) => t.id === moved!.usedSpillTrackId);
  assert.ok(spill);
  assert.equal(spill!.type, "text");
  assert.ok(spill!.clips.some((c) => c.id === "c_text"));
  const overlayIdx = moved!.tracks.findIndex((t) => t.id === "t_overlay");
  const spillIdx = moved!.tracks.findIndex(
    (t) => t.id === moved!.usedSpillTrackId,
  );
  assert.ok(spillIdx < overlayIdx, "spill lane sits above aimed overlay");
}

{
  // Default sticker add (no aim): stay in sticker band — don’t dump onto free video.
  const tracks: Track[] = [
    createEmptyTrack("video", "t_video"),
    createEmptyTrack("audio", "t_audio"),
  ];
  const ensured = ensureTrackForRange(tracks, "sticker", 0, 1000);
  const created = ensured.tracks.find((t) => t.id === ensured.trackId);
  assert.equal(created?.type, "sticker");
  const videoIdx = ensured.tracks.findIndex((t) => t.id === "t_video");
  const stickerIdx = ensured.tracks.findIndex((t) => t.id === ensured.trackId);
  assert.ok(stickerIdx < videoIdx, "sticker band sits above video");
  assert.notEqual(ensured.trackId, "t_video");
}

{
  // Preferred overlay busy → create typed lane beside aim (not scavenge video).
  const tracks: Track[] = [
    createEmptyTrack("video", "t_video"),
    {
      ...createEmptyTrack("overlay", "t_overlay"),
      clips: [
        clip({
          id: "busy",
          kind: "image",
          mediaId: "m",
          startMs: 0,
          durationMs: 5000,
        }),
      ],
    },
  ];
  const ensured = ensureTrackForRange(tracks, "text", 0, 1000, {
    preferredTrackId: "t_overlay",
  });
  assert.notEqual(ensured.trackId, "t_overlay");
  assert.notEqual(ensured.trackId, "t_video");
  const created = ensured.tracks.find((t) => t.id === ensured.trackId);
  assert.equal(created?.type, "text");
  const overlayIdx = ensured.tracks.findIndex((t) => t.id === "t_overlay");
  const createdIdx = ensured.tracks.findIndex((t) => t.id === ensured.trackId);
  assert.ok(createdIdx < overlayIdx, "new text lane sits above preferred overlay");
}

{
  // Free sticker lane exists → reuse it instead of creating / using video.
  const tracks: Track[] = [
    createEmptyTrack("sticker", "t_sticker"),
    {
      ...createEmptyTrack("video", "t_video"),
      clips: [],
    },
  ];
  const ensured = ensureTrackForRange(tracks, "sticker", 0, 1000);
  assert.equal(ensured.trackId, "t_sticker");
}

{
  // Preferred free video must not host a sticker — create sticker beside it.
  const tracks: Track[] = [
    createEmptyTrack("video", "t_video"),
    createEmptyTrack("audio", "t_audio"),
  ];
  const ensured = ensureTrackForRange(tracks, "sticker", 0, 1000, {
    preferredTrackId: "t_video",
  });
  assert.notEqual(ensured.trackId, "t_video");
  const created = ensured.tracks.find((t) => t.id === ensured.trackId);
  assert.equal(created?.type, "sticker");
}

{
  // Sticker aimed at video lane → spill/create sticker lane, never land on video.
  const tracks: Track[] = [
    {
      ...createEmptyTrack("sticker", "t_sticker"),
      clips: [
        clip({ id: "c_sticker", kind: "sticker", stickerId: "s1" }),
      ],
    },
    createEmptyTrack("video", "t_video"),
    createEmptyTrack("audio", "t_audio"),
  ];
  const moved = moveClip({
    tracks,
    clipId: "c_sticker",
    startMs: 0,
    playheadMs: 0,
    magnetEnabled: false,
    pxPerSec: 64,
    targetTrackId: "t_video",
    intentionalLaneMove: true,
  });
  assert.ok(moved);
  const video = moved!.tracks.find((t) => t.id === "t_video");
  assert.equal(video?.clips.length, 0);
  const host = moved!.tracks.find((t) =>
    t.clips.some((c) => c.id === "c_sticker"),
  );
  assert.ok(host);
  assert.equal(host!.type, "sticker");
}

{
  // Moving main content onto overlay must not leave an empty video husk.
  const tracks: Track[] = [
    {
      ...createEmptyTrack("overlay", "t_overlay"),
      clips: [
        clip({
          id: "c_image",
          kind: "image",
          mediaId: "m1",
          startMs: 0,
          durationMs: 2000,
        }),
      ],
    },
    createEmptyTrack("video", "t_video"),
    createEmptyTrack("audio", "t_audio"),
  ];
  const pruned = pruneEmptyTracks(tracks);
  assert.equal(
    pruned.some((t) => t.type === "video"),
    false,
    "empty video pruned when overlay still has visuals",
  );
  assert.ok(pruned.some((t) => t.id === "t_overlay"));
  assert.ok(pruned.some((t) => t.type === "audio"));
}

{
  // No visual content → keep one empty video seed (+ audio).
  const tracks: Track[] = [
    createEmptyTrack("video", "t_video"),
    createEmptyTrack("audio", "t_audio"),
  ];
  const pruned = pruneEmptyTracks(tracks);
  assert.equal(pruned.filter((t) => t.type === "video").length, 1);
  assert.equal(pruned.filter((t) => t.type === "audio").length, 1);
}

assert.equal(trackCanReorder("overlay"), true);
assert.equal(trackCanReorder("audio"), false);
assert.equal(trackCanReorder("caption"), false);

{
  const tracks = tracksFixture();
  // text(0) sticker(1) overlay(2) video(3) audio(4) → move video above text
  const moved = reorderTrack(tracks, "t_video", 0);
  assert.ok(moved);
  assert.deepEqual(
    moved!.map((t) => t.id),
    ["t_video", "t_text", "t_sticker", "t_overlay", "t_audio"],
  );
}

{
  const tracks = tracksFixture();
  // Cannot drop a visual into the audio band
  assert.equal(reorderTrack(tracks, "t_text", 4), null);
}

{
  const tracks: Track[] = [
    createEmptyTrack("caption", "t_cap"),
    createEmptyTrack("overlay", "t_overlay"),
    createEmptyTrack("video", "t_video"),
    createEmptyTrack("audio", "t_audio"),
  ];
  // Cannot move above captions
  assert.equal(reorderTrack(tracks, "t_video", 0), null);
  const moved = reorderTrack(tracks, "t_video", 1);
  assert.ok(moved);
  assert.deepEqual(
    moved!.map((t) => t.id),
    ["t_cap", "t_video", "t_overlay", "t_audio"],
  );
}

console.log("timelineOps.visualLanes.test.ts: ok");
