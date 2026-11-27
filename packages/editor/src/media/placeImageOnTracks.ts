import { defaultAnimatableTransform } from "../engine/animatable";
import { snapMs, snapThresholdMs } from "../engine/snap";
import {
  addClipToTrack,
  ensureVisualAvTrackForRange,
  isVisualAvTrack,
} from "../engine/timelineOps";
import type { Clip, RemoveBgParams, Track } from "../project/types";

/** Default still duration for AI-generated / edited images. */
export const AI_IMAGE_DURATION_MS = 3000;

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

export type PlaceImageOnTracksOpts = {
  tracks: Track[];
  assetId: string;
  targetTrackId?: string;
  /** Prefer an overlay lane (edits); falls back to visual AV placement. */
  preferOverlay?: boolean;
  startMs?: number;
  durationMs?: number;
  exactStart?: boolean;
  playheadMs: number;
  magnetEnabled: boolean;
  pxPerSec: number;
  transform?: Clip["transform"];
  /** Optional chroma remove-bg (e.g. AI sticker cutouts). */
  removeBg?: RemoveBgParams;
};

export type PlaceImageOnTracksResult = {
  tracks: Track[];
  clip: Clip;
  trackId: string;
};

/**
 * Pure placement of an image media asset onto a visual AV track.
 * Does not commit — callers apply via MutationBatch / commitTracks.
 */
export function placeImageOnTracks(
  opts: PlaceImageOnTracksOpts,
): PlaceImageOnTracksResult | null {
  let tracks = opts.tracks;
  let preferredTrackId: string | undefined;

  if (opts.targetTrackId) {
    const candidate = tracks.find((t) => t.id === opts.targetTrackId);
    if (candidate && !candidate.locked && isVisualAvTrack(candidate.type)) {
      preferredTrackId = candidate.id;
    }
  }

  if (!preferredTrackId && opts.preferOverlay) {
    const overlay = tracks.find((t) => t.type === "overlay" && !t.locked);
    if (overlay) preferredTrackId = overlay.id;
  }

  const durationMs = Math.max(1, Math.round(opts.durationMs ?? AI_IMAGE_DURATION_MS));
  let startMs =
    typeof opts.startMs === "number" && Number.isFinite(opts.startMs)
      ? opts.startMs
      : opts.playheadMs;
  if (opts.magnetEnabled && !opts.exactStart) {
    const edges: number[] = [0, opts.playheadMs];
    for (const t of tracks) {
      for (const c of t.clips) {
        edges.push(c.startMs, c.startMs + c.durationMs);
      }
    }
    startMs = snapMs(startMs, edges, snapThresholdMs(opts.pxPerSec));
  }
  startMs = Math.max(0, Math.round(startMs));

  const ensured = ensureVisualAvTrackForRange(tracks, startMs, durationMs, {
    preferredTrackId,
  });
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) return null;

  const clip: Clip = {
    id: newClipId(),
    kind: "image",
    mediaId: opts.assetId,
    startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
    transform: opts.transform ?? defaultAnimatableTransform(),
    blendMode: "normal",
    ...(opts.removeBg ? { removeBg: opts.removeBg } : {}),
  };

  const next = addClipToTrack(tracks, track.id, clip);
  if (!next) return null;

  return { tracks: next, clip, trackId: track.id };
}
