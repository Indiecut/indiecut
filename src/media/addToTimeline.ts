import { defaultAnimatableTransform } from "../engine/animatable";
import { snapMs, snapThresholdMs } from "../engine/snap";
import {
  addClipToTrack,
  ensureTrackForRange,
  ensureVisualAvTrackForRange,
} from "../engine/timelineOps";
import type { Clip, ClipKind, MediaAssetRef, Track } from "../project/types";
import { getEditorStore } from "../store/editorStore";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

function clipKindFor(asset: MediaAssetRef): ClipKind {
  if (asset.kind === "audio") return "audio";
  if (asset.kind === "image") return "image";
  return "video";
}

function trackAcceptsAsset(track: Track, asset: MediaAssetRef): boolean {
  if (asset.kind === "audio") return track.type === "audio";
  // video / image → video or overlay
  return track.type === "video" || track.type === "overlay";
}

/**
 * Place a media asset on a track at the playhead.
 * Optional `targetTrackId` places onto that lane when type-compatible and free;
 * Overlapping ranges spill onto a new track.
 * Video sound stays on the video clip (no auto-split to an audio lane).
 */
export function addMediaToTimeline(
  assetId: string,
  targetTrackId?: string,
): Clip | null {
  const store = getEditorStore();
  const { project, magnetEnabled, timelinePxPerSec, commitTracks } = store;
  const asset = project.mediaIndex.find((m) => m.id === assetId);
  if (!asset || asset.importStatus === "processing") return null;
  if (asset.importStatus === "error") return null;

  let tracks = project.tracks;
  let preferredTrackId: string | undefined;

  if (targetTrackId) {
    const candidate = tracks.find((t) => t.id === targetTrackId);
    if (candidate && !candidate.locked && trackAcceptsAsset(candidate, asset)) {
      preferredTrackId = candidate.id;
    }
  }

  const durationMs = Math.max(asset.durationMs, 1000);
  let startMs = project.playheadMs;
  if (magnetEnabled) {
    const edges: number[] = [0, project.playheadMs];
    for (const t of tracks) {
      for (const c of t.clips) {
        edges.push(c.startMs, c.startMs + c.durationMs);
      }
    }
    startMs = snapMs(startMs, edges, snapThresholdMs(timelinePxPerSec));
  }
  startMs = Math.max(0, startMs);

  const ensured =
    asset.kind === "audio"
      ? ensureTrackForRange(tracks, "audio", startMs, durationMs, {
          preferredTrackId,
        })
      : ensureVisualAvTrackForRange(tracks, startMs, durationMs, {
          preferredTrackId,
        });
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) return null;

  const kind = clipKindFor(asset);
  const placed: Clip = {
    id: newClipId(),
    kind,
    mediaId: asset.id,
    startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
    ...(kind === "video" || kind === "image"
      ? {
          transform: defaultAnimatableTransform(),
          blendMode: "normal" as const,
        }
      : {}),
  };

  const next = addClipToTrack(tracks, track.id, placed);
  if (!next) return null;

  commitTracks(next, "Add clip", { clipId: placed.id, trackId: track.id });
  return placed;
}

export const MEDIA_DRAG_MIME = "application/x-indiecut-media";
