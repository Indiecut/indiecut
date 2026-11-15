import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import {
  addClipToTrack,
  ensureTrackForRange,
} from "../engine/timelineOps";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { Clip } from "../project/types";
import { findClip, getEditorStore } from "../store/editorStore";
import { toArrayBuffer, toUint8Array } from "./bytes";
import { adoptProjectMediaFile } from "./importMedia";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

function newAssetId(): string {
  return `media_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Extract audio from a video clip's media into a new AAC file under media/,
 * register it, and place an audio-lane clip aligned with the video clip.
 */
export async function extractAudioFromVideoClip(
  clipId: string,
): Promise<Clip | null> {
  const bridge = window.indiecut;
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }

  const store = getEditorStore();
  const { project, commitTracks } = store;
  const projectPath = project.projectPath;
  if (!projectPath) {
    throw new Error("Save or open a project before extracting audio");
  }

  const found = findClip(project.tracks, clipId);
  if (!found) throw new Error("Clip not found");
  const { clip } = found;
  if (clip.kind !== "video" && clip.kind !== "image") {
    throw new Error("Extract audio requires a video clip");
  }
  if (!clip.mediaId) throw new Error("Clip has no media");

  const asset = project.mediaIndex.find((m) => m.id === clip.mediaId);
  if (!asset) throw new Error("Media asset not found");
  if (asset.kind !== "video") throw new Error("Media is not video");
  if (asset.hasAudio === false) throw new Error("Video has no audio track");
  if (clip.muteAudio) throw new Error("Audio already extracted from this clip");

  const abs = resolveMediaAbsolutePath({
    projectPath,
    storedPath: asset.path,
  });
  const bytes = toUint8Array(await bridge.fs.readFile(abs));
  const blob = new Blob([toArrayBuffer(bytes)], {
    type: "video/mp4",
  });

  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });

  const trimStart = Math.max(0, clip.inMs) / 1000;
  const trimEnd = Math.max(trimStart + 0.05, clip.outMs / 1000);

  const conversion = await Conversion.init({
    input,
    output,
    video: { discard: true },
    audio: {
      codec: "aac",
      quality: new Quality("high"),
    },
    trim: { start: trimStart, end: trimEnd },
  });

  if (!conversion.isValid) {
    input.dispose();
    throw new Error(
      `Cannot extract audio: ${conversion.discardedTracks.map((t) => t.reason).join(", ") || "unsupported"}`,
    );
  }

  await conversion.execute();
  input.dispose();

  const outBuf = target.buffer;
  if (!outBuf || outBuf.byteLength === 0) {
    throw new Error("Extract produced empty audio");
  }

  const audioAssetId = newAssetId();
  const relPath = `media/${audioAssetId}.m4a`;
  await bridge.fs.writeProjectFile(
    projectPath,
    relPath,
    new Uint8Array(outBuf),
  );

  const adopted = await adoptProjectMediaFile(relPath);
  // Prefer a friendly name derived from the video.
  store.patchMediaAsset(adopted.id, {
    name: `${asset.name.replace(/\.[^.]+$/, "") || asset.name} (audio)`,
  });

  const durationMs = Math.max(
    100,
    adopted.durationMs || clip.durationMs || (clip.outMs - clip.inMs),
  );

  let tracks = store.project.tracks;
  const ensured = ensureTrackForRange(
    tracks,
    "audio",
    clip.startMs,
    durationMs,
    {},
  );
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) {
    throw new Error("No free audio track for extracted clip");
  }

  const placed: Clip = {
    id: newClipId(),
    kind: "audio",
    mediaId: adopted.id,
    startMs: clip.startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
  };

  const next = addClipToTrack(tracks, track.id, placed);
  if (!next) throw new Error("Failed to place extracted audio");

  // Silence the source video so preview/export aren't doubled.
  // Do not link — extracted audio stays independently movable.
  const muted = next.map((t) => ({
    ...t,
    clips: t.clips.map((c) =>
      c.id === clip.id ? { ...c, muteAudio: true } : c,
    ),
  }));

  commitTracks(muted, "Extract audio", {
    clipId: placed.id,
    trackId: track.id,
  });
  return placed;
}
