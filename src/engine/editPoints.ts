/**
 * Edit-point helpers for attaching transitions between abutting/overlapping clips.
 * Transitions live on the incoming clip (not a separate track) and require two
 * continuous video/image clips on the same video/overlay track.
 */

import type { Clip, Track, TransitionParams } from "../project/types";

export const DEFAULT_TRANSITION_DURATION_MS = 500;

/** ~1 frame @ 30fps — abutting clips within this are treated as continuous. */
export const CONTINUITY_TOLERANCE_MS = 34;

export type ClipPair = {
  track: Track;
  outgoing: Clip;
  incoming: Clip;
};

export type AttachTransitionError =
  | "wrong_track"
  | "not_video_clip"
  | "locked"
  | "no_neighbor"
  | "gap"
  | "not_found";

export type AttachTransitionResult =
  | { ok: true; tracks: Track[]; incomingId: string; pair: ClipPair }
  | { ok: false; error: AttachTransitionError; message: string };

export type TransitionMarker = {
  trackId: string;
  incomingId: string;
  outgoingId: string;
  /** Transition window start (ms). */
  startMs: number;
  durationMs: number;
  presetId: string;
};

function clipEnd(c: Clip): number {
  return c.startMs + c.durationMs;
}

export function isVideoLikeTrack(track: Track): boolean {
  return track.type === "video" || track.type === "overlay";
}

export function isVideoLikeClip(clip: Clip): boolean {
  return clip.kind === "video" || clip.kind === "image";
}

/** True when A ends at/after B starts (abut or overlap) — no gap. */
export function clipsAreContinuous(
  outgoing: Clip,
  incoming: Clip,
  toleranceMs = CONTINUITY_TOLERANCE_MS,
): boolean {
  return clipEnd(outgoing) >= incoming.startMs - toleranceMs;
}

export function attachTransitionErrorMessage(
  error: AttachTransitionError,
): string {
  switch (error) {
    case "wrong_track":
      return "Transitions can only be added on a video track between two video clips.";
    case "not_video_clip":
      return "Transitions can only be applied to video clips — not audio, text, or other clip types.";
    case "locked":
      return "This track is locked. Unlock it before adding a transition.";
    case "no_neighbor":
      return "Transitions need two video clips on the same track. Add another clip next to this one.";
    case "gap":
      return "Transitions require continuous video clips with no gap between them.";
    case "not_found":
      return "No edit point found at or after the playhead. Move the playhead before a continuous video join, or select the incoming clip.";
  }
}

/** Find previous video/image neighbor on the same track (latest continuous clip). */
export function findOutgoingNeighbor(
  track: Track,
  incoming: Clip,
  toleranceMs = CONTINUITY_TOLERANCE_MS,
): Clip | null {
  let best: Clip | null = null;
  let bestEnd = -Infinity;
  for (const c of track.clips) {
    if (c.id === incoming.id) continue;
    if (!isVideoLikeClip(c)) continue;
    const end = clipEnd(c);
    // Must be continuous (no gap) and start before incoming.
    if (end < incoming.startMs - toleranceMs) continue;
    if (c.startMs >= incoming.startMs + incoming.durationMs) continue;
    if (end > bestEnd && c.startMs < incoming.startMs + toleranceMs) {
      best = c;
      bestEnd = end;
    }
  }
  return best;
}

/** Find next continuous video/image neighbor after an outgoing clip. */
export function findIncomingNeighbor(
  track: Track,
  outgoing: Clip,
  toleranceMs = CONTINUITY_TOLERANCE_MS,
): Clip | null {
  let best: Clip | null = null;
  let bestStart = Infinity;
  for (const c of track.clips) {
    if (c.id === outgoing.id) continue;
    if (!isVideoLikeClip(c)) continue;
    // Must start at/after outgoing (the right-hand clip of the cut).
    if (c.startMs < outgoing.startMs + toleranceMs) continue;
    if (!clipsAreContinuous(outgoing, c, toleranceMs)) continue;
    if (c.startMs < bestStart) {
      best = c;
      bestStart = c.startMs;
    }
  }
  return best;
}

/** Timeline time of a continuous A→B edit (cut or overlap start). */
export function editPointMs(outgoing: Clip, incoming: Clip): number {
  const cutMs = Math.min(clipEnd(outgoing), incoming.startMs);
  const overlapStart = Math.max(outgoing.startMs, incoming.startMs);
  return clipEnd(outgoing) > incoming.startMs ? overlapStart : cutMs;
}

/**
 * Next continuous edit point at or after the playhead on video/overlay tracks.
 * Library “+” / apply targets the upcoming join, not a cut behind
 * the playhead. Skips pairs with a gap between them.
 */
export function findEditPointNearPlayhead(
  tracks: Track[],
  playheadMs: number,
  preferTrackId?: string,
): ClipPair | null {
  const ahead: { pair: ClipPair; dist: number }[] = [];

  for (const track of tracks) {
    if (!isVideoLikeTrack(track)) continue;
    if (track.locked) continue;
    if (preferTrackId && track.id !== preferTrackId) continue;

    const visual = track.clips
      .filter(isVideoLikeClip)
      .slice()
      .sort((a, b) => a.startMs - b.startMs);

    for (let i = 1; i < visual.length; i++) {
      const outgoing = visual[i - 1]!;
      const incoming = visual[i]!;
      if (!clipsAreContinuous(outgoing, incoming)) continue;

      const editMs = editPointMs(outgoing, incoming);
      // Allow a tiny past window so sitting exactly on a join still hits it.
      if (editMs < playheadMs - CONTINUITY_TOLERANCE_MS) continue;
      ahead.push({
        pair: { track, outgoing, incoming },
        dist: Math.max(0, editMs - playheadMs),
      });
    }
  }

  ahead.sort((a, b) => a.dist - b.dist);
  return ahead[0]?.pair ?? null;
}

/**
 * Resolve which incoming clip should receive a transition, with validation.
 */
export function resolveTransitionTarget(
  tracks: Track[],
  options: {
    playheadMs: number;
    selectedClipId?: string | null;
    /** When dropping onto a specific lane. */
    dropTrackId?: string | null;
  },
): AttachTransitionResult {
  const { playheadMs, selectedClipId, dropTrackId } = options;

  if (dropTrackId) {
    const track = tracks.find((t) => t.id === dropTrackId);
    if (!track) {
      return {
        ok: false,
        error: "not_found",
        message: attachTransitionErrorMessage("not_found"),
      };
    }
    if (!isVideoLikeTrack(track)) {
      return {
        ok: false,
        error: "wrong_track",
        message: attachTransitionErrorMessage("wrong_track"),
      };
    }
    if (track.locked) {
      return {
        ok: false,
        error: "locked",
        message: attachTransitionErrorMessage("locked"),
      };
    }
  }

  if (selectedClipId) {
    let found: { track: Track; clip: Clip } | null = null;
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) {
        found = { track, clip };
        break;
      }
    }
    if (found) {
      if (dropTrackId && found.track.id !== dropTrackId) {
        // Drop targeted a different lane — ignore selection for track check;
        // still use selection only if it lives on the drop track.
      } else if (!isVideoLikeTrack(found.track)) {
        return {
          ok: false,
          error: "wrong_track",
          message: attachTransitionErrorMessage("wrong_track"),
        };
      } else if (!isVideoLikeClip(found.clip)) {
        return {
          ok: false,
          error: "not_video_clip",
          message: attachTransitionErrorMessage("not_video_clip"),
        };
      } else if (found.track.locked) {
        return {
          ok: false,
          error: "locked",
          message: attachTransitionErrorMessage("locked"),
        };
      } else {
        const outgoing = findOutgoingNeighbor(found.track, found.clip);
        if (outgoing) {
          return {
            ok: true,
            tracks,
            incomingId: found.clip.id,
            pair: {
              track: found.track,
              outgoing,
              incoming: found.clip,
            },
          };
        }
        // Selected the left clip of a cut — use the next continuous neighbor.
        const incoming = findIncomingNeighbor(found.track, found.clip);
        if (incoming) {
          return {
            ok: true,
            tracks,
            incomingId: incoming.id,
            pair: {
              track: found.track,
              outgoing: found.clip,
              incoming,
            },
          };
        }
        // Distinguish gap vs missing neighbor.
        const earlier = found.track.clips
          .filter(
            (c) =>
              c.id !== found.clip.id &&
              isVideoLikeClip(c) &&
              c.startMs < found.clip.startMs,
          )
          .sort((a, b) => clipEnd(b) - clipEnd(a))[0];
        const later = found.track.clips
          .filter(
            (c) =>
              c.id !== found.clip.id &&
              isVideoLikeClip(c) &&
              c.startMs >= found.clip.startMs,
          )
          .sort((a, b) => a.startMs - b.startMs)[0];
        if (
          (earlier && !clipsAreContinuous(earlier, found.clip)) ||
          (later && !clipsAreContinuous(found.clip, later))
        ) {
          return {
            ok: false,
            error: "gap",
            message: attachTransitionErrorMessage("gap"),
          };
        }
        return {
          ok: false,
          error: "no_neighbor",
          message: attachTransitionErrorMessage("no_neighbor"),
        };
      }
    }
  }

  const pair = findEditPointNearPlayhead(
    tracks,
    playheadMs,
    dropTrackId ?? undefined,
  );
  if (!pair) {
    // If drop/selection pointed at a video track but pairs have gaps, say so.
    if (dropTrackId || selectedClipId) {
      const track =
        (dropTrackId && tracks.find((t) => t.id === dropTrackId)) ||
        tracks.find((t) => t.clips.some((c) => c.id === selectedClipId));
      if (track && isVideoLikeTrack(track)) {
        const visual = track.clips
          .filter(isVideoLikeClip)
          .slice()
          .sort((a, b) => a.startMs - b.startMs);
        for (let i = 1; i < visual.length; i++) {
          if (!clipsAreContinuous(visual[i - 1]!, visual[i]!)) {
            return {
              ok: false,
              error: "gap",
              message: attachTransitionErrorMessage("gap"),
            };
          }
        }
        if (visual.length < 2) {
          return {
            ok: false,
            error: "no_neighbor",
            message: attachTransitionErrorMessage("no_neighbor"),
          };
        }
      }
    }
    return {
      ok: false,
      error: "not_found",
      message: attachTransitionErrorMessage("not_found"),
    };
  }

  return {
    ok: true,
    tracks,
    incomingId: pair.incoming.id,
    pair,
  };
}

/**
 * Attach a transition to the incoming clip, creating a durationMs overlap
 * by pulling B.startMs left onto A. Not a separate track.
 */
export function attachTransition(
  tracks: Track[],
  incomingClipId: string,
  params: TransitionParams,
): Track[] | null {
  const result = applyTransition(tracks, incomingClipId, params);
  return result.ok ? result.tracks : null;
}

export function applyTransition(
  tracks: Track[],
  incomingClipId: string,
  params: TransitionParams,
): AttachTransitionResult {
  let trackIndex = -1;
  let incoming: Clip | null = null;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    const c = t.clips.find((x) => x.id === incomingClipId);
    if (c) {
      trackIndex = i;
      incoming = c;
      break;
    }
  }
  if (trackIndex < 0 || !incoming) {
    return {
      ok: false,
      error: "not_found",
      message: attachTransitionErrorMessage("not_found"),
    };
  }
  const track = tracks[trackIndex]!;
  if (!isVideoLikeTrack(track)) {
    return {
      ok: false,
      error: "wrong_track",
      message: attachTransitionErrorMessage("wrong_track"),
    };
  }
  if (track.locked) {
    return {
      ok: false,
      error: "locked",
      message: attachTransitionErrorMessage("locked"),
    };
  }
  if (!isVideoLikeClip(incoming)) {
    return {
      ok: false,
      error: "not_video_clip",
      message: attachTransitionErrorMessage("not_video_clip"),
    };
  }

  const earlier = track.clips
    .filter(
      (c) =>
        c.id !== incoming!.id &&
        isVideoLikeClip(c) &&
        c.startMs < incoming!.startMs + CONTINUITY_TOLERANCE_MS,
    )
    .sort((a, b) => clipEnd(b) - clipEnd(a))[0];

  if (!earlier) {
    return {
      ok: false,
      error: "no_neighbor",
      message: attachTransitionErrorMessage("no_neighbor"),
    };
  }
  if (!clipsAreContinuous(earlier, incoming)) {
    return {
      ok: false,
      error: "gap",
      message: attachTransitionErrorMessage("gap"),
    };
  }

  const outgoing = earlier;
  const durationMs = Math.max(
    50,
    params.durationMs || DEFAULT_TRANSITION_DURATION_MS,
  );
  const outEnd = clipEnd(outgoing);
  // Pull incoming start left to create/ensure overlap of durationMs
  let newStart = outEnd - durationMs;
  newStart = Math.max(outgoing.startMs + 50, newStart);
  newStart = Math.max(0, newStart);

  const nextIncoming: Clip = {
    ...incoming,
    startMs: newStart,
    transition: {
      presetId: params.presetId,
      durationMs,
      category: params.category,
      direction: params.direction,
      intensity: params.intensity ?? 1,
    },
  };

  const nextTracks = tracks.map((t, i) => {
    if (i !== trackIndex) return t;
    return {
      ...t,
      clips: t.clips.map((c) =>
        c.id === incomingClipId ? nextIncoming : c,
      ),
    };
  });

  return {
    ok: true,
    tracks: nextTracks,
    incomingId: incomingClipId,
    pair: { track, outgoing, incoming: nextIncoming },
  };
}

/**
 * Resize an existing transition: update duration and keep B overlapped onto A.
 */
export function resizeTransitionDuration(
  tracks: Track[],
  incomingClipId: string,
  durationMs: number,
): Track[] | null {
  let trackIndex = -1;
  let incoming: Clip | null = null;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]!;
    const c = t.clips.find((x) => x.id === incomingClipId);
    if (c) {
      trackIndex = i;
      incoming = c;
      break;
    }
  }
  if (trackIndex < 0 || !incoming?.transition) return null;
  const track = tracks[trackIndex]!;
  if (track.locked) return null;
  const outgoing = findOutgoingNeighbor(track, incoming);
  if (!outgoing) return null;

  const nextDur = Math.max(50, Math.min(5000, Math.round(durationMs)));
  const outEnd = clipEnd(outgoing);
  let newStart = outEnd - nextDur;
  newStart = Math.max(outgoing.startMs + 50, newStart);
  newStart = Math.max(0, newStart);

  const nextIncoming: Clip = {
    ...incoming,
    startMs: newStart,
    transition: {
      ...incoming.transition,
      durationMs: nextDur,
    },
  };

  return tracks.map((t, i) => {
    if (i !== trackIndex) return t;
    return {
      ...t,
      clips: t.clips.map((c) =>
        c.id === incomingClipId ? nextIncoming : c,
      ),
    };
  });
}

/** Progress 0–1 if globalMs is inside the incoming clip's transition window. */
export function transitionProgressAt(
  incoming: Clip,
  globalMs: number,
): number | null {
  const tr = incoming.transition;
  if (!tr?.presetId) return null;
  const dur = Math.max(1, tr.durationMs);
  const start = incoming.startMs;
  const end = start + dur;
  if (globalMs < start || globalMs >= end) return null;
  if (globalMs >= start + incoming.durationMs) return null;
  return (globalMs - start) / dur;
}

/**
 * Whether outgoing still covers globalMs during the transition overlap.
 */
export function outgoingCoversTransition(
  outgoing: Clip,
  incoming: Clip,
  globalMs: number,
): boolean {
  const tr = incoming.transition;
  if (!tr) return false;
  const windowEnd = incoming.startMs + tr.durationMs;
  if (globalMs < incoming.startMs || globalMs >= windowEnd) return false;
  return globalMs >= outgoing.startMs && globalMs < clipEnd(outgoing);
}

/** Inline markers for timeline overlays (not separate tracks). */
export function listTransitionMarkers(tracks: Track[]): TransitionMarker[] {
  const markers: TransitionMarker[] = [];
  for (const track of tracks) {
    if (!isVideoLikeTrack(track)) continue;
    for (const clip of track.clips) {
      if (!clip.transition?.presetId) continue;
      if (!isVideoLikeClip(clip)) continue;
      const outgoing = findOutgoingNeighbor(track, clip);
      if (!outgoing) continue;
      markers.push({
        trackId: track.id,
        incomingId: clip.id,
        outgoingId: outgoing.id,
        startMs: clip.startMs,
        durationMs: clip.transition.durationMs,
        presetId: clip.transition.presetId,
      });
    }
  }
  return markers;
}
