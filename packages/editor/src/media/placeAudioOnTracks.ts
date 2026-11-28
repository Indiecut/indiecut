import { snapMs, snapThresholdMs } from "../engine/snap";
import { addClipToTrack, ensureTrackForRange } from "../engine/timelineOps";
import type { Clip, Track } from "../project/types";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

export type PlaceAudioOnTracksOpts = {
  tracks: Track[];
  assetId: string;
  targetTrackId?: string;
  startMs?: number;
  durationMs: number;
  exactStart?: boolean;
  playheadMs: number;
  magnetEnabled: boolean;
  pxPerSec: number;
};

export type PlaceAudioOnTracksResult = {
  tracks: Track[];
  clip: Clip;
  trackId: string;
};

/**
 * Pure placement of an audio media asset onto an audio track.
 * Does not commit — callers apply via MutationBatch / commitTracks.
 */
export function placeAudioOnTracks(
  opts: PlaceAudioOnTracksOpts,
): PlaceAudioOnTracksResult | null {
  let tracks = opts.tracks;
  let preferredTrackId: string | undefined;

  if (opts.targetTrackId) {
    const candidate = tracks.find((t) => t.id === opts.targetTrackId);
    if (candidate && !candidate.locked && candidate.type === "audio") {
      preferredTrackId = candidate.id;
    }
  }

  const durationMs = Math.max(1, Math.round(opts.durationMs));
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

  const ensured = ensureTrackForRange(tracks, "audio", startMs, durationMs, {
    preferredTrackId,
  });
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) return null;

  const clip: Clip = {
    id: newClipId(),
    kind: "audio",
    mediaId: opts.assetId,
    startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
  };

  const next = addClipToTrack(tracks, track.id, clip);
  if (!next) return null;

  return { tracks: next, clip, trackId: track.id };
}
