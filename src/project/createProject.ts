import { defaultAnimatableTransform } from "../engine/animatable";
import type { Clip, MediaAssetRef, ProjectDocument, Track } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyTrack(type: Track["type"], trackId?: string): Track {
  return {
    id: trackId ?? id("track"),
    type,
    locked: false,
    hidden: false,
    muted: false,
    solo: false,
    clips: [],
  };
}

function emptyOverlayTrack(trackId?: string): Track {
  return emptyTrack("overlay", trackId);
}

function emptyVideoTrack(trackId?: string): Track {
  return emptyTrack("video", trackId);
}

function emptyAudioTrack(trackId?: string): Track {
  return emptyTrack("audio", trackId);
}

function emptyTextTrack(trackId?: string): Track {
  return emptyTrack("text", trackId);
}

function emptyCaptionTrack(trackId?: string): Track {
  return emptyTrack("caption", trackId);
}

function emptyStickerTrack(trackId?: string): Track {
  return emptyTrack("sticker", trackId);
}

function emptyEffectTrack(trackId?: string): Track {
  return emptyTrack("effect", trackId);
}

function emptyFilterTrack(trackId?: string): Track {
  return emptyTrack("filter", trackId);
}

export type CreatableTrackType =
  | "overlay"
  | "audio"
  | "video"
  | "text"
  | "caption"
  | "sticker"
  | "effect"
  | "filter";

/** Append an empty track (UI + ensure helpers). */
export function createEmptyTrack(
  type: CreatableTrackType,
  trackId?: string,
): Track {
  if (type === "overlay") return emptyOverlayTrack(trackId);
  if (type === "audio") return emptyAudioTrack(trackId);
  if (type === "text") return emptyTextTrack(trackId);
  if (type === "caption") return emptyCaptionTrack(trackId);
  if (type === "sticker") return emptyStickerTrack(trackId);
  if (type === "effect") return emptyEffectTrack(trackId);
  if (type === "filter") return emptyFilterTrack(trackId);
  return emptyVideoTrack(trackId);
}

export function createEmptyProject(
  partial?: Partial<ProjectDocument>,
): ProjectDocument {
  const base: ProjectDocument = {
    version: 4,
    id: id("proj"),
    title: "Untitled",
    projectPath: "",
    fps: 30,
    width: 1920,
    height: 1080,
    resolutionMode: "adapted",
    aspectRatio: "16:9",
    colorSpace: "sdr_rec709",
    importMaterialMode: "copy_to_project",
    playheadMs: 0,
    // Seed only required A/V lanes — text/sticker/effect/filter/overlay
    // appear via ensureTrack when content is added; empty extras are pruned.
    tracks: [
      emptyVideoTrack(),
      emptyAudioTrack(),
    ],
    mediaIndex: [],
    updatedAt: nowIso(),
  };

  if (!partial) return base;

  return {
    ...base,
    ...partial,
    version: 4,
    tracks: partial.tracks ?? base.tracks,
    mediaIndex: partial.mediaIndex ?? base.mediaIndex,
  };
}

export function createDemoProject(): ProjectDocument {
  const videoTrackId = id("track");
  const audioTrackId = id("track");

  const mediaA: MediaAssetRef = {
    id: id("media"),
    kind: "video",
    name: "Demo Clip A",
    path: "media/demo-a.mp4",
    durationMs: 5000,
    width: 1920,
    height: 1080,
  };
  const mediaB: MediaAssetRef = {
    id: id("media"),
    kind: "video",
    name: "Demo Clip B",
    path: "media/demo-b.mp4",
    durationMs: 4000,
    width: 1920,
    height: 1080,
  };
  const mediaAudio: MediaAssetRef = {
    id: id("media"),
    kind: "audio",
    name: "Demo Music",
    path: "media/demo-music.mp3",
    durationMs: 10000,
  };

  const clipA: Clip = {
    id: id("clip"),
    kind: "video",
    mediaId: mediaA.id,
    startMs: 0,
    durationMs: 5000,
    inMs: 0,
    outMs: 5000,
    transform: defaultAnimatableTransform(),
    blendMode: "normal",
  };
  const clipB: Clip = {
    id: id("clip"),
    kind: "video",
    mediaId: mediaB.id,
    startMs: 5000,
    durationMs: 4000,
    inMs: 0,
    outMs: 4000,
    transform: defaultAnimatableTransform(),
    blendMode: "normal",
  };
  const clipAudio: Clip = {
    id: id("clip"),
    kind: "audio",
    mediaId: mediaAudio.id,
    startMs: 0,
    durationMs: 10000,
    inMs: 0,
    outMs: 10000,
  };

  return createEmptyProject({
    title: "Demo Project",
    mediaIndex: [mediaA, mediaB, mediaAudio],
    tracks: [
      {
        id: videoTrackId,
        type: "video",
        locked: false,
        hidden: false,
        muted: false,
        solo: false,
        clips: [clipA, clipB],
      },
      {
        id: audioTrackId,
        type: "audio",
        locked: false,
        hidden: false,
        muted: false,
        solo: false,
        clips: [clipAudio],
      },
    ],
  });
}
