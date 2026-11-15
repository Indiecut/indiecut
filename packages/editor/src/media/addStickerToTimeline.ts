import { defaultAnimatableTransform } from "../engine/animatable";
import { snapMs, snapThresholdMs } from "../engine/snap";
import { addClipToTrack, ensureTrackForRange } from "../engine/timelineOps";
import type { Clip } from "../project/types";
import { getEditorStore } from "../store/editorStore";
import {
  findSticker,
  loadStickerManifest,
  type StickerManifestEntry,
} from "../stickers/manifest";
import { defaultStickerStyle } from "../stickers/stickerStyle";

export const STICKER_DRAG_MIME = "application/x-indiecut-sticker";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Place a kinetic sticker on a sticker track at the playhead.
 * Overlapping ranges spill onto a new sticker track.
 */
export async function addStickerToTimeline(
  stickerId: string,
  targetTrackId?: string,
): Promise<Clip | null> {
  const manifest = await loadStickerManifest();
  const entry = findSticker(manifest, stickerId);
  if (!entry) return null;
  return placeStickerEntry(entry, targetTrackId);
}

function placeStickerEntry(
  entry: StickerManifestEntry,
  targetTrackId?: string,
): Clip | null {
  const store = getEditorStore();
  const { project, magnetEnabled, timelinePxPerSec, commitTracks } = store;

  let tracks = project.tracks;
  let preferredTrackId: string | undefined;

  if (targetTrackId) {
    const candidate = tracks.find((t) => t.id === targetTrackId);
    if (candidate && !candidate.locked && candidate.type === "sticker") {
      preferredTrackId = candidate.id;
    }
  }

  const durationMs = Math.max(entry.defaultDurationMs, 500);
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

  const ensured = ensureTrackForRange(tracks, "sticker", startMs, durationMs, {
    preferredTrackId,
  });
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) return null;

  const clip: Clip = {
    id: newClipId(),
    kind: "sticker",
    stickerId: entry.id,
    stickerStyle: defaultStickerStyle(),
    startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
    // Logical size is 256; scale 1 ≈ 256px on a 1080p stage.
    transform: defaultAnimatableTransform({ scaleX: 1, scaleY: 1 }),
    blendMode: "normal",
  };

  const next = addClipToTrack(tracks, track.id, clip);
  if (!next) return null;

  commitTracks(next, "Add sticker", { clipId: clip.id, trackId: track.id });
  return clip;
}
