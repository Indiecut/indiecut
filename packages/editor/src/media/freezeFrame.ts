import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import {
  defaultAnimatableTransform,
  evaluateClipOpacity,
  evaluateClipTransform,
  staticAnimatable,
} from "../engine/animatable";
import { sourceMsAtLocal } from "../engine/speedRemap";
import {
  canFreezeFrameAt,
  clipUnderPlayhead,
  findClipInTracks,
  freezeFrameAt,
} from "../engine/timelineOps";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { Clip } from "../project/types";
import { frameDurationMs, getEditorStore } from "../store/editorStore";
import { toArrayBuffer, toUint8Array } from "./bytes";
import { adoptProjectMediaFile } from "./importMedia";
import { getPlatform } from "@indiecut/platform";

/** Default still duration on the timeline (image remains freely resizable). */
export const FREEZE_FRAME_DURATION_MS = 1000;

function newAssetId(): string {
  return `media_${Math.random().toString(36).slice(2, 10)}`;
}

async function canvasToJpeg(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality = 0.92,
): Promise<ArrayBuffer> {
  // Snapshot out of the CanvasSink pool before async encode.
  const w = Math.max(1, canvas.width);
  const h = Math.max(1, canvas.height);
  const snapshot = new OffscreenCanvas(w, h);
  const ctx = snapshot.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable for freeze frame");
  ctx.drawImage(canvas, 0, 0, w, h);

  const blob = await snapshot.convertToBlob({
    type: "image/jpeg",
    quality,
  });
  return blob.arrayBuffer();
}

async function captureVideoFrameJpeg(args: {
  absolutePath: string;
  sourceMs: number;
}): Promise<{ jpeg: ArrayBuffer; width: number; height: number }> {
  const bridge = getPlatform();
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }

  const bytes = toUint8Array(await bridge.fs.readFile(args.absolutePath));
  const blob = new Blob([toArrayBuffer(bytes)], { type: "video/mp4" });
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });

  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track for freeze frame");

    const sink = new CanvasSink(track, { poolSize: 2 });
    const timestampSec = Math.max(0, args.sourceMs / 1000);
    const wrapped = await sink.getCanvas(timestampSec);
    if (!wrapped?.canvas) throw new Error("Could not decode freeze frame");

    const width = Math.max(1, wrapped.canvas.width);
    const height = Math.max(1, wrapped.canvas.height);
    const jpeg = await canvasToJpeg(wrapped.canvas);
    if (jpeg.byteLength === 0) throw new Error("Freeze frame encode failed");
    return { jpeg, width, height };
  } finally {
    await input.dispose();
  }
}

/**
 * Capture the frame under the playhead on a video clip, adopt it as an image
 * asset, split the clip, and ripple-insert a 1s still between the halves.
 */
export async function freezeFrameAtPlayhead(
  preferredClipId?: string | null,
): Promise<Clip | null> {
  const bridge = getPlatform();
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }

  const store = getEditorStore();
  const { project, commitTracks, selectClip } = store;
  const projectPath = project.projectPath;
  if (!projectPath) {
    throw new Error("Save or open a project before freezing a frame");
  }

  const minDur = frameDurationMs(project.fps);
  let clipId = preferredClipId ?? store.selectedClipId;
  if (!clipId) {
    const hit = clipUnderPlayhead(project.tracks, project.playheadMs);
    clipId = hit?.clip.id ?? null;
  }
  if (!clipId) throw new Error("Select a video clip to freeze");

  if (
    !canFreezeFrameAt({
      tracks: project.tracks,
      clipId,
      globalMs: project.playheadMs,
      minDurationMs: minDur,
    })
  ) {
    throw new Error("Move the playhead inside the video clip to freeze");
  }

  const found = findClipInTracks(project.tracks, clipId);
  if (!found) throw new Error("Clip not found");
  const { clip } = found;
  if (clip.kind !== "video") throw new Error("Freeze requires a video clip");
  if (!clip.mediaId) throw new Error("Clip has no media");

  const asset = project.mediaIndex.find((m) => m.id === clip.mediaId);
  if (!asset) throw new Error("Media asset not found");
  if (asset.kind !== "video") throw new Error("Media is not video");

  const localMs = project.playheadMs - clip.startMs;
  const sourceMs = sourceMsAtLocal(clip, localMs, project.fps);

  // Prefer master for full-resolution still; fall back to proxy if needed.
  const storedPath = asset.path;
  const abs = resolveMediaAbsolutePath({
    projectPath,
    storedPath,
  });

  const { jpeg, width, height } = await captureVideoFrameJpeg({
    absolutePath: abs,
    sourceMs,
  });

  const imageAssetId = newAssetId();
  const relPath = `media/${imageAssetId}.jpg`;
  await bridge.fs.writeProjectFile(
    projectPath,
    relPath,
    new Uint8Array(jpeg),
  );

  const adopted = await adoptProjectMediaFile(relPath);
  store.patchMediaAsset(adopted.id, {
    name: `${asset.name.replace(/\.[^.]+$/, "") || asset.name} (freeze)`,
    width: adopted.width || width,
    height: adopted.height || height,
  });

  const resolved = evaluateClipTransform(clip, localMs);
  const imageClipProps: Pick<Clip, "transform" | "blendMode" | "opacity"> = {
    transform: defaultAnimatableTransform({
      x: resolved.x,
      y: resolved.y,
      scaleX: resolved.scaleX,
      scaleY: resolved.scaleY,
      rotation: resolved.rotation,
      uniformScale: resolved.uniformScale,
    }),
    blendMode: clip.blendMode ?? "normal",
    opacity: staticAnimatable(evaluateClipOpacity(clip, localMs)),
  };

  // Re-read tracks in case adopt/persistence mutated store.
  const latest = getEditorStore().project;
  const result = freezeFrameAt({
    tracks: latest.tracks,
    clipId,
    globalMs: latest.playheadMs,
    minDurationMs: frameDurationMs(latest.fps),
    freezeDurationMs: FREEZE_FRAME_DURATION_MS,
    imageMediaId: adopted.id,
    imageClipProps,
  });
  if (!result) {
    throw new Error("Could not insert freeze frame on the timeline");
  }

  commitTracks(result.tracks, "Freeze frame", {
    clipId: result.freezeClipId,
  });
  selectClip(result.freezeClipId);
  return findClipInTracks(result.tracks, result.freezeClipId)?.clip ?? null;
}
