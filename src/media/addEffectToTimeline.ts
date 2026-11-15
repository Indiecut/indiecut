import { snapMs, snapThresholdMs } from "../engine/snap";
import { addClipToTrack, ensureTrackForRange } from "../engine/timelineOps";
import {
  findEffect,
  loadEffectManifest,
  type EffectManifestEntry,
} from "../effects/manifest";
import type { Clip } from "../project/types";
import { getEditorStore } from "../store/editorStore";

export const EFFECT_DRAG_MIME = "application/x-indiecut-effect";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

export async function addEffectToTimeline(
  effectId: string,
  targetTrackId?: string,
): Promise<Clip | null> {
  const manifest = await loadEffectManifest();
  const entry = findEffect(manifest, effectId);
  if (!entry) return null;
  return placeEffectEntry(entry, targetTrackId);
}

function placeEffectEntry(
  entry: EffectManifestEntry,
  targetTrackId?: string,
): Clip | null {
  const store = getEditorStore();
  const { project, magnetEnabled, timelinePxPerSec, commitTracks } = store;

  let tracks = project.tracks;
  let preferredTrackId: string | undefined;

  if (targetTrackId) {
    const candidate = tracks.find((t) => t.id === targetTrackId);
    if (candidate && !candidate.locked && candidate.type === "effect") {
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

  const ensured = ensureTrackForRange(tracks, "effect", startMs, durationMs, {
    preferredTrackId,
  });
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) return null;

  const clip: Clip = {
    id: newClipId(),
    kind: "effect",
    startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
    effect: {
      effectId: entry.id,
      intensity: { staticValue: 1, keyframes: [] },
    },
  };

  const next = addClipToTrack(tracks, track.id, clip);
  if (!next) return null;

  commitTracks(next, "Add effect", { clipId: clip.id, trackId: track.id });
  return clip;
}
