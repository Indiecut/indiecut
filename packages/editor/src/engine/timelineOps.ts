import { splitCaptionProps } from "../ai/captions/captionTiming";
import type { Clip, SpeedCurve, Track, TrackType } from "../project/types";
import {
  createEmptyTrack,
  type CreatableTrackType,
} from "../project/createProject";
import {
  clampClipAnimatables,
  defaultAnimatableTransform,
  shiftClampClipAnimatables,
  splitRightClipAnimatables,
} from "./animatable";
import {
  collectEdgeTargets,
  pickSnappedStartMs,
  snapMsWithGuide,
  snapThresholdMs,
} from "./snap";
import {
  resolveSpeedCurve,
  timelineDurationForSpeed,
} from "./speedRemap";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneTracks(tracks: Track[]): Track[] {
  return structuredClone(tracks);
}

function mapTrack(
  tracks: Track[],
  trackId: string,
  fn: (track: Track) => Track,
): Track[] {
  return tracks.map((t) => (t.id === trackId ? fn(t) : t));
}

function replaceClipOnTrack(
  tracks: Track[],
  trackId: string,
  clipId: string,
  nextClip: Clip,
): Track[] {
  return mapTrack(tracks, trackId, (track) => ({
    ...track,
    clips: track.clips.map((c) => (c.id === clipId ? nextClip : c)),
  }));
}

function removeClipFromTrack(
  tracks: Track[],
  trackId: string,
  clipId: string,
): Track[] {
  return mapTrack(tracks, trackId, (track) => ({
    ...track,
    clips: track.clips.filter((c) => c.id !== clipId),
  }));
}

/** Visual lanes that can host video/image clips. */
export function isVisualAvTrack(type: TrackType): boolean {
  return type === "video" || type === "overlay";
}

/**
 * Visual lanes that share the stack / header-reorder family.
 * Clips stay type-locked within this family (see `trackAcceptsClipKind`);
 * captions, effects, filters, and audio stay in their own typed bands.
 */
export function isSharedVisualTrack(type: TrackType): boolean {
  return (
    type === "video" ||
    type === "overlay" ||
    type === "text" ||
    type === "sticker"
  );
}

/** Clip kinds eligible for visual-lane spill-beside (still type-locked). */
export function isSharedVisualClipKind(kind: Clip["kind"]): boolean {
  return (
    kind === "video" ||
    kind === "image" ||
    kind === "text" ||
    kind === "sticker"
  );
}

/**
 * Whether a lane may host this clip kind.
 * video/image ↔ video|overlay; text→text; sticker→sticker; others same-type only.
 */
export function trackAcceptsClipKind(
  trackType: TrackType,
  clipKind: Clip["kind"],
): boolean {
  if (clipKind === "video" || clipKind === "image") {
    return trackType === "video" || trackType === "overlay";
  }
  if (clipKind === "text") return trackType === "text";
  if (clipKind === "sticker") return trackType === "sticker";
  if (clipKind === "caption") return trackType === "caption";
  if (clipKind === "effect") return trackType === "effect";
  if (clipKind === "filter") return trackType === "filter";
  if (clipKind === "audio") return trackType === "audio";
  return false;
}

/** New spill / placement lane type from clip kind (not from the aimed track). */
export function creatableTypeForClipKind(
  kind: Clip["kind"],
): CreatableTrackType {
  if (kind === "text") return "text";
  if (kind === "sticker") return "sticker";
  if (kind === "caption") return "caption";
  if (kind === "effect") return "effect";
  if (kind === "filter") return "filter";
  if (kind === "audio") return "audio";
  // video / image → new AV spill lanes sit above main video as overlay.
  return "overlay";
}

/** Header drag-reorder is only for freely stackable visual lanes. */
export function trackCanReorder(type: TrackType): boolean {
  return isSharedVisualTrack(type);
}

/**
 * Move a shared-visual track to `toIndex` in the resulting array.
 * Captions stay above; audio stays below. Returns null if invalid or a no-op.
 */
export function reorderTrack(
  tracks: Track[],
  trackId: string,
  toIndex: number,
): Track[] | null {
  const from = tracks.findIndex((t) => t.id === trackId);
  if (from < 0) return null;
  const track = tracks[from]!;
  if (!trackCanReorder(track.type)) return null;

  const without = [...tracks.slice(0, from), ...tracks.slice(from + 1)];
  const clamped = Math.max(0, Math.min(toIndex, without.length));
  if (clamped === from) return null;

  const next = [
    ...without.slice(0, clamped),
    track,
    ...without.slice(clamped),
  ];

  // Captions stay a leading prefix; audio stays a trailing suffix.
  for (let i = 1; i < next.length; i++) {
    if (next[i]!.type === "caption" && next[i - 1]!.type !== "caption") {
      return null;
    }
  }
  for (let i = 0; i < next.length - 1; i++) {
    if (next[i]!.type === "audio" && next[i + 1]!.type !== "audio") {
      return null;
    }
  }

  return next;
}

export function anyTrackSoloed(tracks: Track[]): boolean {
  return tracks.some((t) => Boolean(t.solo));
}

/** Whether a track contributes to the video stack / audible set under solo rules. */
export function trackContributes(track: Track, soloActive: boolean): boolean {
  if (soloActive && !track.solo) return false;
  return true;
}

/** Insert `created` immediately before `adjacentToId` (fallback: type-stack insert). */
function insertTrackBefore(
  tracks: Track[],
  created: Track,
  adjacentToId: string,
): Track[] {
  const idx = tracks.findIndex((t) => t.id === adjacentToId);
  if (idx < 0) return insertTrackByType(tracks, created);
  return [...tracks.slice(0, idx), created, ...tracks.slice(idx)];
}

/**
 * Insert a track at stack position:
 * text → sticker → effect → filter → overlay → video → audio.
 */
function insertTrackByType(tracks: Track[], created: Track): Track[] {
  const type = created.type;
  if (type === "caption") {
    return [created, ...tracks];
  }
  if (type === "text") {
    const captionEnd = tracks.findIndex((t) => t.type !== "caption");
    const idx = captionEnd < 0 ? tracks.length : captionEnd;
    return [...tracks.slice(0, idx), created, ...tracks.slice(idx)];
  }
  if (type === "sticker") {
    const textEnd = tracks.findIndex(
      (t) => t.type !== "caption" && t.type !== "text",
    );
    const idx = textEnd < 0 ? tracks.length : textEnd;
    return [...tracks.slice(0, idx), created, ...tracks.slice(idx)];
  }
  if (type === "effect") {
    const after = new Set(["caption", "text", "sticker"]);
    let idx = 0;
    while (idx < tracks.length && after.has(tracks[idx]!.type)) idx++;
    return [...tracks.slice(0, idx), created, ...tracks.slice(idx)];
  }
  if (type === "filter") {
    const after = new Set(["caption", "text", "sticker", "effect"]);
    let idx = 0;
    while (idx < tracks.length && after.has(tracks[idx]!.type)) idx++;
    return [...tracks.slice(0, idx), created, ...tracks.slice(idx)];
  }
  if (type === "overlay") {
    const videoIdx = tracks.findIndex((t) => t.type === "video");
    if (videoIdx >= 0) {
      return [
        ...tracks.slice(0, videoIdx),
        created,
        ...tracks.slice(videoIdx),
      ];
    }
    return [created, ...tracks];
  }
  if (type === "audio") {
    return [...tracks, created];
  }
  // video: insert after last overlay/sticker/text/effect/filter group, before first audio
  const audioIdx = tracks.findIndex((t) => t.type === "audio");
  if (audioIdx >= 0) {
    return [
      ...tracks.slice(0, audioIdx),
      created,
      ...tracks.slice(audioIdx),
    ];
  }
  return [...tracks, created];
}

/** Ensure at least one unlocked track of the given type exists; append if missing. */
export function ensureTrack(
  tracks: Track[],
  type: CreatableTrackType,
): { tracks: Track[]; trackId: string } {
  const existing = tracks.find((t) => t.type === type && !t.locked);
  if (existing) return { tracks, trackId: existing.id };
  const created = createEmptyTrack(type);
  return {
    tracks: insertTrackByType(tracks, created),
    trackId: created.id,
  };
}

/** True when two timeline ranges overlap (abutting edges are allowed). */
export function rangesOverlap(
  aStartMs: number,
  aDurationMs: number,
  bStartMs: number,
  bDurationMs: number,
): boolean {
  const aEnd = aStartMs + aDurationMs;
  const bEnd = bStartMs + bDurationMs;
  return aStartMs < bEnd && bStartMs < aEnd;
}

/** Whether a track can host [startMs, startMs+durationMs) without overlapping other clips. */
export function trackRangeIsFree(
  track: Track,
  startMs: number,
  durationMs: number,
  excludeClipId?: string | null,
): boolean {
  if (track.locked) return false;
  for (const c of track.clips) {
    if (excludeClipId && c.id === excludeClipId) continue;
    if (rangesOverlap(startMs, durationMs, c.startMs, c.durationMs)) {
      return false;
    }
  }
  return true;
}

/**
 * Reuse an unlocked track of `type` with free space at the range,
 * or insert a new track when every existing lane would overlap.
 */
/**
 * Find a free lane of `type`, or create one.
 * Preferred is used only when it matches `type` and is free; otherwise any free
 * same-type lane wins. New lanes insert beside preferred when present.
 */
export function ensureTrackForRange(
  tracks: Track[],
  type: CreatableTrackType,
  startMs: number,
  durationMs: number,
  opts?: {
    preferredTrackId?: string;
    excludeClipId?: string | null;
  },
): { tracks: Track[]; trackId: string } {
  const preferredId = opts?.preferredTrackId;
  const exclude = opts?.excludeClipId;

  if (preferredId) {
    const preferred = tracks.find((t) => t.id === preferredId);
    if (
      preferred &&
      preferred.type === type &&
      trackRangeIsFree(preferred, startMs, durationMs, exclude)
    ) {
      return { tracks, trackId: preferred.id };
    }
  }

  for (const t of tracks) {
    if (t.type !== type) continue;
    if (preferredId && t.id === preferredId) continue;
    if (trackRangeIsFree(t, startMs, durationMs, exclude)) {
      return { tracks, trackId: t.id };
    }
  }

  const created = createEmptyTrack(type);
  if (preferredId && tracks.some((t) => t.id === preferredId)) {
    return {
      tracks: insertTrackBefore(tracks, created, preferredId),
      trackId: created.id,
    };
  }
  return {
    tracks: insertTrackByType(tracks, created),
    trackId: created.id,
  };
}

/**
 * Video / image placement: prefer the aimed video/overlay lane,
 * then free video/overlay, else create an overlay above the main video.
 */
export function ensureVisualAvTrackForRange(
  tracks: Track[],
  startMs: number,
  durationMs: number,
  opts?: {
    preferredTrackId?: string;
    excludeClipId?: string | null;
  },
): { tracks: Track[]; trackId: string } {
  const preferredId = opts?.preferredTrackId;
  const exclude = opts?.excludeClipId;

  if (preferredId) {
    const preferred = tracks.find((t) => t.id === preferredId);
    if (
      preferred &&
      isVisualAvTrack(preferred.type) &&
      trackRangeIsFree(preferred, startMs, durationMs, exclude)
    ) {
      return { tracks, trackId: preferred.id };
    }
  }

  for (const type of ["video", "overlay"] as const) {
    for (const t of tracks) {
      if (t.type !== type) continue;
      if (preferredId && t.id === preferredId) continue;
      if (trackRangeIsFree(t, startMs, durationMs, exclude)) {
        return { tracks, trackId: t.id };
      }
    }
  }

  if (preferredId && tracks.some((t) => t.id === preferredId)) {
    const created = createEmptyTrack("overlay");
    return {
      tracks: insertTrackBefore(tracks, created, preferredId),
      trackId: created.id,
    };
  }

  const hasVideo = tracks.some((t) => t.type === "video");
  const created = createEmptyTrack(hasVideo ? "overlay" : "video");
  return {
    tracks: insertTrackByType(tracks, created),
    trackId: created.id,
  };
}

/** Nearest clip end on the left of `startMs` (same track), or 0. */
function neighborLimitLeft(
  track: Track,
  clipId: string,
  startMs: number,
): number {
  let limit = 0;
  for (const c of track.clips) {
    if (c.id === clipId) continue;
    const end = c.startMs + c.durationMs;
    if (end <= startMs + 0.5 && end > limit) limit = end;
  }
  return limit;
}

/** Nearest clip start on the right of the clip end, or Infinity. */
function neighborLimitRight(
  track: Track,
  clipId: string,
  endMs: number,
): number {
  let limit = Number.POSITIVE_INFINITY;
  for (const c of track.clips) {
    if (c.id === clipId) continue;
    if (c.startMs >= endMs - 0.5 && c.startMs < limit) limit = c.startMs;
  }
  return limit;
}

/**
 * Push clips on `trackId` that start at/after `fromMs` by `deltaMs`, and shift
 * each moved clip's linked partner by the same amount (keeps freeze A/V sync).
 */
function ripplePushLaterClips(args: {
  tracks: Track[];
  trackId: string;
  fromMs: number;
  deltaMs: number;
  excludeClipId: string;
}): Track[] {
  if (args.deltaMs <= 0) return args.tracks;
  const track = args.tracks.find((t) => t.id === args.trackId);
  if (!track || track.locked) return args.tracks;

  const toShift = track.clips.filter(
    (c) =>
      c.id !== args.excludeClipId && c.startMs >= args.fromMs - 0.5,
  );
  if (toShift.length === 0) return args.tracks;

  let tracks = mapTrack(args.tracks, args.trackId, (t) => ({
    ...t,
    clips: t.clips.map((c) =>
      c.id !== args.excludeClipId && c.startMs >= args.fromMs - 0.5
        ? { ...c, startMs: c.startMs + args.deltaMs }
        : c,
    ),
  }));

  for (const c of toShift) {
    if (!c.linkedClipId) continue;
    const partner = findClipInTracks(tracks, c.linkedClipId);
    if (!partner || partner.track.locked) continue;
    tracks = replaceClipOnTrack(tracks, partner.track.id, partner.clip.id, {
      ...partner.clip,
      startMs: partner.clip.startMs + args.deltaMs,
    });
  }

  return tracks;
}

export function appendTrack(
  tracks: Track[],
  type:
    | "overlay"
    | "audio"
    | "text"
    | "caption"
    | "sticker"
    | "effect"
    | "filter",
): Track[] {
  const created = createEmptyTrack(type);
  if (
    type === "caption" ||
    type === "text" ||
    type === "sticker" ||
    type === "effect" ||
    type === "filter" ||
    type === "overlay"
  ) {
    return insertTrackByType(tracks, created);
  }
  return [...tracks, created];
}

/**
 * Drop empty lanes automatically.
 * Keep one empty audio always (when no audio content).
 * Keep one empty video only when no shared-visual content remains — otherwise
 * moving the main clip onto an overlay left a dead empty video under it.
 */
export function pruneEmptyTracks(tracks: Track[]): Track[] {
  const hasNonEmptyVideo = tracks.some(
    (t) => t.type === "video" && t.clips.length > 0,
  );
  const hasNonEmptySharedVisual = tracks.some(
    (t) => isSharedVisualTrack(t.type) && t.clips.length > 0,
  );
  const hasNonEmptyAudio = tracks.some(
    (t) => t.type === "audio" && t.clips.length > 0,
  );
  let keptEmptyVideo = false;
  let keptEmptyAudio = false;

  return tracks.filter((t) => {
    if (t.clips.length > 0) return true;

    if (t.type === "video") {
      if (hasNonEmptyVideo) return false;
      // Overlay/text/sticker (or another video) still has clips — drop the husk.
      if (hasNonEmptySharedVisual) return false;
      if (keptEmptyVideo) return false;
      keptEmptyVideo = true;
      return true;
    }
    if (t.type === "audio") {
      if (hasNonEmptyAudio) return false;
      if (keptEmptyAudio) return false;
      keptEmptyAudio = true;
      return true;
    }

    // overlay / text / sticker / effect / filter — remove when empty
    return false;
  });
}

/** Copy timing fields from source onto linked partner (keep partner id/kind/media). */
function syncLinkedTiming(partner: Clip, source: Clip): Clip {
  return {
    ...partner,
    startMs: source.startMs,
    durationMs: source.durationMs,
    inMs: source.inMs,
    outMs: source.outMs,
  };
}

export function findClipInTracks(
  tracks: Track[],
  clipId: string,
): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } | null {
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti]!;
    const clipIndex = track.clips.findIndex((c) => c.id === clipId);
    if (clipIndex >= 0) {
      return { track, clip: track.clips[clipIndex]!, trackIndex: ti, clipIndex };
    }
  }
  return null;
}

/** Clip under playhead on any track (prefer selected track / video). */
export function clipUnderPlayhead(
  tracks: Track[],
  playheadMs: number,
  preferredClipId?: string | null,
): { track: Track; clip: Clip } | null {
  if (preferredClipId) {
    const found = findClipInTracks(tracks, preferredClipId);
    if (
      found &&
      playheadMs >= found.clip.startMs &&
      playheadMs < found.clip.startMs + found.clip.durationMs
    ) {
      return { track: found.track, clip: found.clip };
    }
  }
  for (const track of tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      if (
        playheadMs >= clip.startMs &&
        playheadMs < clip.startMs + clip.durationMs
      ) {
        return { track, clip };
      }
    }
  }
  return null;
}

/** Edges of all clips except `excludeClipId` (cross-track for magnet). */
export function allOtherEdges(
  tracks: Track[],
  excludeClipId: string,
): number[] {
  const edges: number[] = [];
  for (const track of tracks) {
    for (const c of track.clips) {
      if (c.id === excludeClipId) continue;
      edges.push(c.startMs, c.startMs + c.durationMs);
    }
  }
  return edges;
}

export type MoveClipResult = {
  tracks: Track[];
  /** Timeline ms of the active snap guide, if any */
  snapGuideMs: number | null;
  /** Spill lane created/reused for an intentional cross-lane drag (stable across frames). */
  usedSpillTrackId?: string;
};

/** Whether a clip may be moved onto a destination track (type rules). */
export function clipCanMoveToTrack(
  clip: Clip,
  from: Track,
  to: Track,
): boolean {
  if (to.locked) return false;
  // Type-locked lanes: never land a clip on a foreign track type.
  // (Cross-type aim creates/reuses a same-type spill beside the target instead.)
  if (!trackAcceptsClipKind(from.type, clip.kind)) return false;
  return trackAcceptsClipKind(to.type, clip.kind);
}

function ensureSpillTrackBeside(
  tracks: Track[],
  besideTrackId: string,
  type: CreatableTrackType,
  spillTrackId?: string,
): { tracks: Track[]; trackId: string } {
  if (spillTrackId) {
    const existing = tracks.find((t) => t.id === spillTrackId);
    if (existing) return { tracks, trackId: existing.id };
  }
  const created = createEmptyTrack(type, spillTrackId);
  return {
    tracks: insertTrackBefore(tracks, created, besideTrackId),
    trackId: created.id,
  };
}

export function moveClip(args: {
  tracks: Track[];
  clipId: string;
  startMs: number;
  playheadMs: number;
  magnetEnabled: boolean;
  pxPerSec: number;
  /** Optional cross-track aim (same-type land, or spill same-type beside). */
  targetTrackId?: string;
  /**
   * When aiming at another lane: land if compatible + free; if busy or wrong
   * type, create/reuse a same-type spill beside it (live cross-lane drag).
   */
  intentionalLaneMove?: boolean;
  /** Stable id for a spill lane reused across live drag frames. */
  spillTrackId?: string;
  /** Track the spill lane should sit beside (live drag). */
  spillBesideTrackId?: string;
  /** Extra multi-selected peers: same time delta, stay on their tracks. */
  peerClipIds?: string[];
}): MoveClipResult | null {
  const found = findClipInTracks(args.tracks, args.clipId);
  if (!found || found.track.locked) return null;

  let startMs = Math.max(0, args.startMs);
  let snapGuideMs: number | null = null;
  let usedSpillTrackId: string | undefined;

  if (args.magnetEnabled) {
    const threshold = snapThresholdMs(args.pxPerSec);
    const targets = collectEdgeTargets({
      playheadMs: args.playheadMs,
      clipEdges: allOtherEdges(args.tracks, args.clipId),
    });
    const picked = pickSnappedStartMs({
      startMs,
      durationMs: found.clip.durationMs,
      targets,
      thresholdMs: threshold,
    });
    startMs = picked.startMs;
    snapGuideMs = picked.snappedTo;
  }

  let tracks = args.tracks;
  let targetTrackId = found.track.id;

  if (args.targetTrackId && args.targetTrackId !== found.track.id) {
    // Live spill lane from a prior frame — inject if missing, then place on it.
    if (args.spillTrackId && args.targetTrackId === args.spillTrackId) {
      const spillType = creatableTypeForClipKind(found.clip.kind);
      const besideId =
        args.spillBesideTrackId &&
        tracks.some((t) => t.id === args.spillBesideTrackId)
          ? args.spillBesideTrackId
          : found.track.id;
      const spill = ensureSpillTrackBeside(
        tracks,
        besideId,
        spillType,
        args.spillTrackId,
      );
      tracks = spill.tracks;
      targetTrackId = spill.trackId;
      usedSpillTrackId = spill.trackId;
    } else {
      const target = tracks.find((t) => t.id === args.targetTrackId);
      if (target && clipCanMoveToTrack(found.clip, found.track, target)) {
        targetTrackId = target.id;
      } else if (
        target &&
        args.intentionalLaneMove &&
        isSharedVisualClipKind(found.clip.kind) &&
        isSharedVisualTrack(target.type)
      ) {
        // Wrong-type aim: other free same-type lane, else create beside the aim.
        // Never treat the origin lane as a free scavenger target (exclude would
        // make a no-op look like a successful cross-lane move).
        const spillType = creatableTypeForClipKind(found.clip.kind);
        const duration = found.clip.durationMs;
        let freeSameType: Track | undefined;
        for (const t of tracks) {
          if (!trackAcceptsClipKind(t.type, found.clip.kind)) continue;
          if (t.id === found.track.id) continue;
          if (trackRangeIsFree(t, startMs, duration, found.clip.id)) {
            freeSameType = t;
            break;
          }
        }
        if (freeSameType) {
          targetTrackId = freeSameType.id;
        } else {
          const spill = ensureSpillTrackBeside(
            tracks,
            target.id,
            spillType,
            args.spillTrackId,
          );
          tracks = spill.tracks;
          targetTrackId = spill.trackId;
          usedSpillTrackId = spill.trackId;
        }
      }
    }
  }

  const durationMs = found.clip.durationMs;
  let intended = tracks.find((t) => t.id === targetTrackId) ?? found.track;

  // Never overlap — spill onto a free lane or create a new track.
  if (!trackRangeIsFree(intended, startMs, durationMs, found.clip.id)) {
    const crossLane =
      Boolean(args.intentionalLaneMove) &&
      Boolean(args.targetTrackId) &&
      args.targetTrackId !== found.track.id &&
      targetTrackId !== found.track.id;

    if (crossLane) {
      // Aiming at a busy compatible lane: open a stable spill beside it.
      const besideId = targetTrackId;
      const spillType = creatableTypeForClipKind(found.clip.kind);
      const spill = ensureSpillTrackBeside(
        tracks,
        besideId,
        spillType,
        args.spillTrackId,
      );
      tracks = spill.tracks;
      targetTrackId = spill.trackId;
      usedSpillTrackId = spill.trackId;
      intended = tracks.find((t) => t.id === targetTrackId) ?? intended;
    } else {
      const isAv =
        found.clip.kind === "video" || found.clip.kind === "image";
      const ensured = isAv
        ? ensureVisualAvTrackForRange(tracks, startMs, durationMs, {
            preferredTrackId: targetTrackId,
            excludeClipId: found.clip.id,
          })
        : ensureTrackForRange(
            tracks,
            creatableTypeForClipKind(found.clip.kind),
            startMs,
            durationMs,
            {
              preferredTrackId: targetTrackId,
              excludeClipId: found.clip.id,
            },
          );
      tracks = ensured.tracks;
      targetTrackId = ensured.trackId;
      if (args.spillTrackId && targetTrackId === args.spillTrackId) {
        usedSpillTrackId = args.spillTrackId;
      } else if (!args.tracks.some((t) => t.id === targetTrackId)) {
        usedSpillTrackId = targetTrackId;
      }
    }
  }

  const sameTrack = targetTrackId === found.track.id;
  if (sameTrack && startMs === found.clip.startMs) {
    return { tracks: args.tracks, snapGuideMs };
  }

  const moved: Clip = { ...found.clip, startMs };
  const deltaMs = startMs - found.clip.startMs;

  if (sameTrack) {
    tracks = replaceClipOnTrack(tracks, found.track.id, moved.id, moved);
  } else {
    tracks = removeClipFromTrack(tracks, found.track.id, moved.id);
    tracks = mapTrack(tracks, targetTrackId, (track) => ({
      ...track,
      clips: [...track.clips, moved],
    }));
  }

  // Soft group — move peers with the same groupId by the same delta.
  if (moved.groupId && deltaMs !== 0) {
    const gid = moved.groupId;
    tracks = tracks.map((t) => {
      if (t.locked) return t;
      return {
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === moved.id) return c;
          if (c.groupId !== gid) return c;
          return { ...c, startMs: Math.max(0, c.startMs + deltaMs) };
        }),
      };
    });
  }

  // Multi-select — shift other selected clips by the same delta (same tracks).
  if (args.peerClipIds && args.peerClipIds.length > 0 && deltaMs !== 0) {
    const peers = new Set(
      args.peerClipIds.filter((id) => id !== moved.id && id !== moved.linkedClipId),
    );
    if (peers.size > 0) {
      tracks = tracks.map((t) => {
        if (t.locked) return t;
        return {
          ...t,
          clips: t.clips.map((c) => {
            if (!peers.has(c.id)) return c;
            return { ...c, startMs: Math.max(0, c.startMs + deltaMs) };
          }),
        };
      });
    }
  }

  // Sync linked partner timing; spill to a free lane if that would overlap.
  if (moved.linkedClipId) {
    const partner = findClipInTracks(tracks, moved.linkedClipId);
    if (partner && !partner.track.locked) {
      const synced = syncLinkedTiming(partner.clip, moved);
      if (
        trackRangeIsFree(
          partner.track,
          synced.startMs,
          synced.durationMs,
          partner.clip.id,
        )
      ) {
        tracks = replaceClipOnTrack(
          tracks,
          partner.track.id,
          partner.clip.id,
          synced,
        );
      } else if (
        partner.track.type === "audio" ||
        isVisualAvTrack(partner.track.type)
      ) {
        const spill =
          partner.track.type === "audio"
            ? ensureTrackForRange(
                tracks,
                "audio",
                synced.startMs,
                synced.durationMs,
                { excludeClipId: partner.clip.id },
              )
            : ensureVisualAvTrackForRange(
                tracks,
                synced.startMs,
                synced.durationMs,
                { excludeClipId: partner.clip.id },
              );
        tracks = removeClipFromTrack(
          spill.tracks,
          partner.track.id,
          partner.clip.id,
        );
        tracks = mapTrack(tracks, spill.trackId, (track) => ({
          ...track,
          clips: [...track.clips, synced],
        }));
      } else {
        tracks = replaceClipOnTrack(
          tracks,
          partner.track.id,
          partner.clip.id,
          synced,
        );
      }
    }
  }

  return { tracks, snapGuideMs, usedSpillTrackId };
}

/**
 * Clips with no finite source window — duration is freely editable.
 * Images are stills (import stamps a default length only); video/audio stay media-capped.
 */
export function isFreelyResizableClip(kind: Clip["kind"]): boolean {
  return (
    kind === "text" ||
    kind === "caption" ||
    kind === "sticker" ||
    kind === "effect" ||
    kind === "filter" ||
    kind === "image"
  );
}

/** Source media length for a clip (falls back to current out when unknown). */
export function clipMediaDurationMs(
  clip: Clip,
  mediaDurationMs?: number | null,
): number {
  if (
    typeof mediaDurationMs === "number" &&
    Number.isFinite(mediaDurationMs) &&
    mediaDurationMs > 0
  ) {
    return mediaDurationMs;
  }
  return Math.max(clip.outMs, clip.inMs + clip.durationMs, 1);
}

/** Whether the left edge can grow outward (reveal more media / free resize). */
export function canExtendClipLeft(
  clip: Clip,
  _mediaDurationMs?: number | null,
): boolean {
  if (isFreelyResizableClip(clip.kind)) return true;
  return clip.inMs > 0.5;
}

/** Whether the right edge can grow outward. */
export function canExtendClipRight(
  clip: Clip,
  mediaDurationMs?: number | null,
): boolean {
  if (isFreelyResizableClip(clip.kind)) return true;
  const mediaDur = clipMediaDurationMs(clip, mediaDurationMs);
  return clip.outMs < mediaDur - 0.5;
}

export type TrimClipResult = {
  tracks: Track[];
  /** Timeline ms of the active magnet snap guide, if any */
  snapGuideMs: number | null;
};

export function trimClipEdge(args: {
  tracks: Track[];
  clipId: string;
  edge: "left" | "right";
  globalMs: number;
  playheadMs: number;
  magnetEnabled: boolean;
  pxPerSec: number;
  minDurationMs: number;
  /** Full source media duration — caps extend for video/audio only. */
  mediaDurationMs?: number | null;
}): TrimClipResult | null {
  const found = findClipInTracks(args.tracks, args.clipId);
  if (!found || found.track.locked) return null;

  const { clip } = found;
  const freeResize = isFreelyResizableClip(clip.kind);
  const mediaDur = clipMediaDurationMs(clip, args.mediaDurationMs);
  const minDur = Math.max(1, args.minDurationMs);
  let globalMs = Math.max(0, args.globalMs);
  let snapGuideMs: number | null = null;

  if (args.magnetEnabled) {
    const threshold = snapThresholdMs(args.pxPerSec);
    const targets = collectEdgeTargets({
      playheadMs: args.playheadMs,
      clipEdges: allOtherEdges(args.tracks, args.clipId),
    });
    const snapped = snapMsWithGuide(globalMs, targets, threshold);
    globalMs = snapped.ms;
    snapGuideMs = snapped.snappedTo;
  }

  // Trim stops at neighboring clips — never create overlaps
  // (except freely-resizable right-edge extend, which ripple-pushes later clips).
  const leftLimit = neighborLimitLeft(found.track, clip.id, clip.startMs);
  const rightLimit = neighborLimitRight(
    found.track,
    clip.id,
    clip.startMs + clip.durationMs,
  );

  let workingTracks = args.tracks;
  let next: Clip;
  if (args.edge === "left") {
    const endMs = clip.startMs + clip.durationMs;
    let newStart = Math.max(
      leftLimit,
      Math.max(0, Math.min(globalMs, endMs - minDur)),
    );
    if (freeResize) {
      const durationMs = endMs - newStart;
      next = {
        ...clip,
        startMs: newStart,
        durationMs,
        inMs: 0,
        outMs: durationMs,
      };
    } else {
      const delta = newStart - clip.startMs;
      let newIn = clip.inMs + delta;
      // Can't reveal media before source start
      if (newIn < 0) {
        newStart -= newIn;
        newIn = 0;
      }
      if (newStart < leftLimit) {
        const shift = leftLimit - newStart;
        newStart = leftLimit;
        newIn += shift;
      }
      if (newIn >= clip.outMs - minDur) {
        return { tracks: args.tracks, snapGuideMs };
      }
      next = {
        ...clip,
        startMs: newStart,
        durationMs: endMs - newStart,
        inMs: newIn,
        outMs: clip.outMs,
      };
    }
  } else if (freeResize) {
    const oldEnd = clip.startMs + clip.durationMs;
    const desiredEnd = Math.max(globalMs, clip.startMs + minDur);
    // Fill any gap first; only the overlap past the next clip ripples later clips.
    if (
      desiredEnd > oldEnd &&
      Number.isFinite(rightLimit) &&
      desiredEnd > rightLimit
    ) {
      workingTracks = ripplePushLaterClips({
        tracks: workingTracks,
        trackId: found.track.id,
        fromMs: oldEnd,
        deltaMs: desiredEnd - rightLimit,
        excludeClipId: clip.id,
      });
    }
    const newEnd =
      desiredEnd > oldEnd
        ? desiredEnd
        : Math.min(rightLimit, desiredEnd);
    const durationMs = newEnd - clip.startMs;
    next = {
      ...clip,
      durationMs,
      inMs: 0,
      outMs: durationMs,
    };
  } else {
    const newEnd = Math.min(
      rightLimit,
      Math.max(globalMs, clip.startMs + minDur),
    );
    const newDuration = newEnd - clip.startMs;
    const newOut = clip.inMs + newDuration;
    // Extend only up to the end of source media
    const clampedOut = Math.min(Math.max(newOut, clip.inMs + minDur), mediaDur);
    const durationMs = Math.max(minDur, clampedOut - clip.inMs);
    next = {
      ...clip,
      durationMs,
      outMs: clip.inMs + durationMs,
    };
  }

  if (
    next.startMs === clip.startMs &&
    next.durationMs === clip.durationMs &&
    next.inMs === clip.inMs &&
    next.outMs === clip.outMs
  ) {
    return { tracks: workingTracks, snapGuideMs };
  }

  // Retarget property keyframes to the new clip-local window.
  const startDelta = next.startMs - clip.startMs;
  if (startDelta !== 0) {
    next = shiftClampClipAnimatables(next, -startDelta, next.durationMs);
  } else {
    next = clampClipAnimatables(next, next.durationMs);
  }

  let tracks = replaceClipOnTrack(workingTracks, found.track.id, next.id, next);

  if (next.linkedClipId) {
    const partner = findClipInTracks(tracks, next.linkedClipId);
    if (partner && !partner.track.locked) {
      const synced = syncLinkedTiming(partner.clip, next);
      if (
        trackRangeIsFree(
          partner.track,
          synced.startMs,
          synced.durationMs,
          partner.clip.id,
        )
      ) {
        tracks = replaceClipOnTrack(
          tracks,
          partner.track.id,
          partner.clip.id,
          synced,
        );
      } else if (
        partner.track.type === "audio" ||
        isVisualAvTrack(partner.track.type)
      ) {
        const spill =
          partner.track.type === "audio"
            ? ensureTrackForRange(
                tracks,
                "audio",
                synced.startMs,
                synced.durationMs,
                { excludeClipId: partner.clip.id },
              )
            : ensureVisualAvTrackForRange(
                tracks,
                synced.startMs,
                synced.durationMs,
                { excludeClipId: partner.clip.id },
              );
        tracks = removeClipFromTrack(
          spill.tracks,
          partner.track.id,
          partner.clip.id,
        );
        tracks = mapTrack(tracks, spill.trackId, (track) => ({
          ...track,
          clips: [...track.clips, synced],
        }));
      } else {
        tracks = replaceClipOnTrack(
          tracks,
          partner.track.id,
          partner.clip.id,
          synced,
        );
      }
    }
  }

  return { tracks, snapGuideMs };
}

export type SplitResult = {
  tracks: Track[];
  rightClipId: string;
};

export function splitClipAt(args: {
  tracks: Track[];
  clipId: string;
  globalMs: number;
  minDurationMs: number;
}): SplitResult | null {
  const found = findClipInTracks(args.tracks, args.clipId);
  if (!found || found.track.locked) return null;

  const { clip } = found;
  const minDur = Math.max(1, args.minDurationMs);
  const local = args.globalMs - clip.startMs;
  if (local < minDur || local > clip.durationMs - minDur) return null;

  const leftDuration = local;
  const rightDuration = clip.durationMs - local;
  const splitSourceMs = clip.inMs + local;

  const linkedId = clip.linkedClipId;
  let left: Clip = {
    ...clip,
    durationMs: leftDuration,
    outMs: splitSourceMs,
    linkedClipId: undefined,
  };
  left = clampClipAnimatables(left, leftDuration);
  const rightId = newClipId();
  let right: Clip = {
    ...clip,
    id: rightId,
    startMs: clip.startMs + leftDuration,
    durationMs: rightDuration,
    inMs: splitSourceMs,
    outMs: clip.outMs,
    linkedClipId: undefined,
  };
  right = splitRightClipAnimatables(right, leftDuration, rightDuration);

  // Caption cues are clip-local documents (not inMs/outMs media windows).
  // Slice + shift so the right half continues from the cut, not cue 0.
  if (clip.kind === "caption" && clip.caption) {
    const { left: leftCaption, right: rightCaption } = splitCaptionProps(
      clip.caption,
      leftDuration,
    );
    left = {
      ...left,
      caption: leftCaption,
      inMs: 0,
      outMs: leftDuration,
    };
    right = {
      ...right,
      caption: rightCaption,
      inMs: 0,
      outMs: rightDuration,
    };
  }

  let tracks = mapTrack(args.tracks, found.track.id, (track) => ({
    ...track,
    clips: track.clips.flatMap((c) =>
      c.id === args.clipId ? [left, right] : [c],
    ),
  }));

  // Split linked partner at the same playhead and re-pair left↔left, right↔right.
  if (linkedId) {
    const partnerFound = findClipInTracks(tracks, linkedId);
    if (partnerFound && !partnerFound.track.locked) {
      const partner = partnerFound.clip;
      let partnerLeft: Clip = {
        ...partner,
        durationMs: leftDuration,
        outMs: splitSourceMs,
        linkedClipId: left.id,
      };
      partnerLeft = clampClipAnimatables(partnerLeft, leftDuration);
      const partnerRightId = newClipId();
      let partnerRight: Clip = {
        ...partner,
        id: partnerRightId,
        startMs: partner.startMs + leftDuration,
        durationMs: rightDuration,
        inMs: splitSourceMs,
        outMs: partner.outMs,
        linkedClipId: rightId,
      };
      partnerRight = splitRightClipAnimatables(
        partnerRight,
        leftDuration,
        rightDuration,
      );
      left.linkedClipId = partnerLeft.id;
      right.linkedClipId = partnerRightId;

      tracks = mapTrack(tracks, partnerFound.track.id, (track) => ({
        ...track,
        clips: track.clips.flatMap((c) =>
          c.id === linkedId ? [partnerLeft, partnerRight] : [c],
        ),
      }));
      // Persist updated left/right link ids on the primary track.
      tracks = mapTrack(tracks, found.track.id, (track) => ({
        ...track,
        clips: track.clips.map((c) => {
          if (c.id === left.id) return { ...c, linkedClipId: partnerLeft.id };
          if (c.id === rightId) return { ...c, linkedClipId: partnerRightId };
          return c;
        }),
      }));
    }
  }

  return { tracks, rightClipId: rightId };
}

/** Split every unlocked clip under the playhead. */
export function splitAllAtPlayhead(args: {
  tracks: Track[];
  playheadMs: number;
  minDurationMs: number;
}): { tracks: Track[]; selectedClipId: string | null } | null {
  let tracks = args.tracks;
  let selectedClipId: string | null = null;
  let changed = false;

  for (const track of args.tracks) {
    if (track.locked) continue;
    const hits = track.clips.filter(
      (c) =>
        args.playheadMs >= c.startMs &&
        args.playheadMs < c.startMs + c.durationMs,
    );
    for (const clip of hits) {
      const result = splitClipAt({
        tracks,
        clipId: clip.id,
        globalMs: args.playheadMs,
        minDurationMs: args.minDurationMs,
      });
      if (result) {
        tracks = result.tracks;
        selectedClipId = result.rightClipId;
        changed = true;
      }
    }
  }

  if (!changed) return null;
  return { tracks, selectedClipId };
}

export type FreezeFrameResult = {
  tracks: Track[];
  freezeClipId: string;
  rightClipId: string;
};

/** Whether playhead sits inside a video clip with room to split on both sides. */
export function canFreezeFrameAt(args: {
  tracks: Track[];
  clipId: string;
  globalMs: number;
  minDurationMs: number;
}): boolean {
  const found = findClipInTracks(args.tracks, args.clipId);
  if (!found || found.track.locked) return false;
  if (found.clip.kind !== "video") return false;
  const minDur = Math.max(1, args.minDurationMs);
  const local = args.globalMs - found.clip.startMs;
  return local >= minDur && local <= found.clip.durationMs - minDur;
}

function shiftTrackClipsFrom(
  tracks: Track[],
  trackId: string,
  fromMs: number,
  deltaMs: number,
): Track[] {
  if (deltaMs === 0) return tracks;
  return mapTrack(tracks, trackId, (track) => ({
    ...track,
    clips: track.clips.map((c) =>
      c.startMs >= fromMs ? { ...c, startMs: c.startMs + deltaMs } : c,
    ),
  }));
}

/**
 * Split a video at globalMs, ripple-insert an image still between the halves,
 * and shift the linked audio right-half (if any) by the same duration.
 */
export function freezeFrameAt(args: {
  tracks: Track[];
  clipId: string;
  globalMs: number;
  minDurationMs: number;
  freezeDurationMs: number;
  imageMediaId: string;
  imageClipProps?: Pick<Clip, "transform" | "blendMode" | "opacity">;
}): FreezeFrameResult | null {
  const found = findClipInTracks(args.tracks, args.clipId);
  if (!found || found.track.locked) return null;
  if (found.clip.kind !== "video") return null;

  const freezeDur = Math.max(
    Math.max(1, args.minDurationMs),
    Math.round(args.freezeDurationMs),
  );
  const splitMs = args.globalMs;

  const split = splitClipAt({
    tracks: args.tracks,
    clipId: args.clipId,
    globalMs: splitMs,
    minDurationMs: args.minDurationMs,
  });
  if (!split) return null;

  let tracks = split.tracks;
  const { rightClipId } = split;
  const videoTrackId = found.track.id;

  tracks = shiftTrackClipsFrom(tracks, videoTrackId, splitMs, freezeDur);

  // Keep linked A/V aligned: push from the audio right-half's start onward.
  const rightFound = findClipInTracks(tracks, rightClipId);
  if (rightFound?.clip.linkedClipId) {
    const partner = findClipInTracks(tracks, rightFound.clip.linkedClipId);
    if (partner && !partner.track.locked) {
      tracks = shiftTrackClipsFrom(
        tracks,
        partner.track.id,
        partner.clip.startMs,
        freezeDur,
      );
    }
  }

  const freezeClipId = newClipId();
  const freezeClip: Clip = {
    id: freezeClipId,
    kind: "image",
    mediaId: args.imageMediaId,
    startMs: splitMs,
    durationMs: freezeDur,
    inMs: 0,
    outMs: freezeDur,
    transform:
      args.imageClipProps?.transform ?? defaultAnimatableTransform(),
    blendMode: args.imageClipProps?.blendMode ?? "normal",
    ...(args.imageClipProps?.opacity
      ? { opacity: args.imageClipProps.opacity }
      : {}),
  };

  const next = addClipToTrack(tracks, videoTrackId, freezeClip);
  if (!next) return null;

  return { tracks: next, freezeClipId, rightClipId };
}

/** Close gaps only on the main (`video`) track when Auto magnet is on. */
export function shouldCloseGap(
  track: Track,
  mainTrackMagnetEnabled: boolean,
): boolean {
  return track.type === "video" && mainTrackMagnetEnabled;
}

/**
 * Q — trim left of playhead on selected/under-playhead clip.
 * Closes the gap only when Auto magnet applies to that track.
 */
export function rippleTrimLeft(args: {
  tracks: Track[];
  playheadMs: number;
  clipId?: string | null;
  minDurationMs: number;
  mainTrackMagnetEnabled?: boolean;
}): Track[] | null {
  const magnetOn = args.mainTrackMagnetEnabled ?? true;
  const hit = clipUnderPlayhead(args.tracks, args.playheadMs, args.clipId);
  if (!hit || hit.track.locked) return null;

  const { clip, track } = hit;
  const local = args.playheadMs - clip.startMs;
  const minDur = Math.max(1, args.minDurationMs);
  if (local < minDur) return null;
  if (local >= clip.durationMs) return null;

  const removed = local;
  const newIn = clip.inMs + removed;
  const newDuration = clip.durationMs - removed;

  const applyTrimLeft = (
    tracks: Track[],
    target: Clip,
    host: Track,
  ) => {
    const closeGap = shouldCloseGap(host, magnetOn);
    return mapTrack(tracks, host.id, (t) => {
      const clips = t.clips
        .map((c) => {
          if (c.id === target.id) {
            return {
              ...c,
              startMs: target.startMs,
              durationMs: newDuration,
              inMs: newIn,
              outMs: target.outMs,
            };
          }
          if (
            closeGap &&
            c.startMs >= target.startMs + target.durationMs
          ) {
            return { ...c, startMs: c.startMs - removed };
          }
          return c;
        })
        .filter((c) => c.durationMs >= minDur);
      return { ...t, clips };
    });
  };

  let tracks = applyTrimLeft(args.tracks, clip, track);
  if (clip.linkedClipId) {
    const partner = findClipInTracks(tracks, clip.linkedClipId);
    if (partner && !partner.track.locked) {
      tracks = applyTrimLeft(tracks, partner.clip, partner.track);
    }
  }
  return tracks;
}

/**
 * W — trim right of playhead.
 * Closes the gap only when Auto magnet applies to that track.
 */
export function rippleTrimRight(args: {
  tracks: Track[];
  playheadMs: number;
  clipId?: string | null;
  minDurationMs: number;
  mainTrackMagnetEnabled?: boolean;
}): Track[] | null {
  const magnetOn = args.mainTrackMagnetEnabled ?? true;
  const hit = clipUnderPlayhead(args.tracks, args.playheadMs, args.clipId);
  if (!hit || hit.track.locked) return null;

  const { clip, track } = hit;
  const local = args.playheadMs - clip.startMs;
  const minDur = Math.max(1, args.minDurationMs);
  if (local <= 0) return null;
  if (clip.durationMs - local < minDur && local < minDur) return null;

  const newDuration = Math.max(minDur, local);
  const removed = clip.durationMs - newDuration;
  if (removed <= 0) return null;

  const newOut = clip.inMs + newDuration;

  const applyTrimRight = (
    tracks: Track[],
    target: Clip,
    host: Track,
  ) => {
    const closeGap = shouldCloseGap(host, magnetOn);
    return mapTrack(tracks, host.id, (t) => {
      const clips = t.clips.map((c) => {
        if (c.id === target.id) {
          return {
            ...c,
            durationMs: newDuration,
            outMs: newOut,
          };
        }
        if (
          closeGap &&
          c.startMs >= target.startMs + target.durationMs
        ) {
          return { ...c, startMs: Math.max(0, c.startMs - removed) };
        }
        return c;
      });
      return { ...t, clips };
    });
  };

  let tracks = applyTrimRight(args.tracks, clip, track);
  if (clip.linkedClipId) {
    const partner = findClipInTracks(tracks, clip.linkedClipId);
    if (partner && !partner.track.locked) {
      tracks = applyTrimRight(tracks, partner.clip, partner.track);
    }
  }
  return tracks;
}

function deleteClipOne(
  tracks: Track[],
  clipId: string,
  mainTrackMagnetEnabled: boolean,
): Track[] | null {
  const found = findClipInTracks(tracks, clipId);
  if (!found || found.track.locked) return null;

  const { clip, track } = found;
  const removed = clip.durationMs;
  const closeGap = shouldCloseGap(track, mainTrackMagnetEnabled);

  return mapTrack(tracks, track.id, (t) => ({
    ...t,
    clips: t.clips
      .filter((c) => c.id !== clip.id)
      .map((c) =>
        closeGap && c.startMs >= clip.startMs + clip.durationMs
          ? { ...c, startMs: Math.max(0, c.startMs - removed) }
          : c,
      ),
  }));
}

/**
 * Delete clip (and linked partner). Closes gaps only on tracks where
 * Auto magnet applies (main `video` track when enabled).
 */
export function rippleDelete(args: {
  tracks: Track[];
  clipId: string;
  mainTrackMagnetEnabled?: boolean;
}): Track[] | null {
  const magnetOn = args.mainTrackMagnetEnabled ?? true;
  const found = findClipInTracks(args.tracks, args.clipId);
  if (!found || found.track.locked) return null;

  const linkedId = found.clip.linkedClipId;
  let tracks = deleteClipOne(args.tracks, args.clipId, magnetOn);
  if (!tracks) return null;

  if (linkedId) {
    const partnerDelete = deleteClipOne(tracks, linkedId, magnetOn);
    if (partnerDelete) tracks = partnerDelete;
  }

  return pruneEmptyTracks(tracks);
}

/** Delete many clips (and their linked partners). Order is earliest-start first. */
export function rippleDeleteMany(args: {
  tracks: Track[];
  clipIds: string[];
  mainTrackMagnetEnabled?: boolean;
}): Track[] | null {
  if (args.clipIds.length === 0) return null;
  const magnetOn = args.mainTrackMagnetEnabled ?? true;
  const remaining = new Set(args.clipIds);
  // Delete later clips first so earlier ripple closes stay stable.
  const ordered = [...args.clipIds]
    .map((id) => {
      const found = findClipInTracks(args.tracks, id);
      return found ? { id, startMs: found.clip.startMs } : null;
    })
    .filter((x): x is { id: string; startMs: number } => x != null)
    .sort((a, b) => b.startMs - a.startMs);

  let tracks = args.tracks;
  let changed = false;
  for (const { id } of ordered) {
    if (!remaining.has(id)) continue;
    const found = findClipInTracks(tracks, id);
    if (!found) {
      remaining.delete(id);
      continue;
    }
    const linkedId = found.clip.linkedClipId;
    const next = rippleDelete({
      tracks,
      clipId: id,
      mainTrackMagnetEnabled: magnetOn,
    });
    if (!next) {
      remaining.delete(id);
      continue;
    }
    tracks = next;
    changed = true;
    remaining.delete(id);
    if (linkedId) remaining.delete(linkedId);
  }
  return changed ? tracks : null;
}

/**
 * Clear mutual linkedClipId. If a video has no partner yet, create an unlinked
 * audio sibling on an audio track (or embedded-audio separate).
 */
export function detachAudio(args: {
  tracks: Track[];
  clipId: string;
  mediaHasAudio?: boolean;
}): { tracks: Track[]; audioClipId: string | null } | null {
  const found = findClipInTracks(args.tracks, args.clipId);
  if (!found || found.track.locked) return null;

  const { clip } = found;
  let tracks = args.tracks;

  if (clip.linkedClipId) {
    const partner = findClipInTracks(tracks, clip.linkedClipId);
    tracks = replaceClipOnTrack(tracks, found.track.id, clip.id, {
      ...clip,
      linkedClipId: undefined,
    });
    if (partner) {
      tracks = replaceClipOnTrack(tracks, partner.track.id, partner.clip.id, {
        ...partner.clip,
        linkedClipId: undefined,
      });
      return { tracks, audioClipId: partner.clip.id };
    }
    return { tracks, audioClipId: null };
  }

  // No link yet — only separate from video/image with audio.
  if (clip.kind !== "video" && clip.kind !== "image") {
    return null;
  }
  if (!args.mediaHasAudio) return null;

  const ensured = ensureTrackForRange(
    tracks,
    "audio",
    clip.startMs,
    clip.durationMs,
  );
  tracks = ensured.tracks;
  const audioClip: Clip = {
    id: newClipId(),
    kind: "audio",
    mediaId: clip.mediaId,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    inMs: clip.inMs,
    outMs: clip.outMs,
  };
  const added = addClipToTrack(tracks, ensured.trackId, audioClip);
  if (!added) return null;
  return { tracks: added, audioClipId: audioClip.id };
}

/** Bidirectionally link two clips (used when placing A/V pairs). */
export function linkClips(
  tracks: Track[],
  clipIdA: string,
  clipIdB: string,
): Track[] | null {
  const a = findClipInTracks(tracks, clipIdA);
  const b = findClipInTracks(tracks, clipIdB);
  if (!a || !b) return null;
  let next = replaceClipOnTrack(tracks, a.track.id, a.clip.id, {
    ...a.clip,
    linkedClipId: clipIdB,
  });
  next = replaceClipOnTrack(next, b.track.id, b.clip.id, {
    ...b.clip,
    linkedClipId: clipIdA,
  });
  return next;
}

export function setTrackFlags(
  tracks: Track[],
  trackId: string,
  flags: Partial<Pick<Track, "locked" | "hidden" | "muted" | "solo">>,
): Track[] {
  return mapTrack(tracks, trackId, (t) => ({ ...t, ...flags }));
}

export function pasteClips(args: {
  tracks: Track[];
  clips: Clip[];
  /** Original track id per pasted clip index; fall back to type match */
  sourceTrackIds: string[];
  playheadMs: number;
}): { tracks: Track[]; firstClipId: string | null; clipIds: string[] } | null {
  if (args.clips.length === 0) return null;

  let tracks = cloneTracks(args.tracks);
  let firstClipId: string | null = null;
  const clipIds: string[] = [];
  const baseStart = Math.min(...args.clips.map((c) => c.startMs));

  for (let i = 0; i < args.clips.length; i++) {
    const src = args.clips[i]!;
    const sourceTrackId = args.sourceTrackIds[i];
    const sourceTrack = args.tracks.find((x) => x.id === sourceTrackId);
    const preferred =
      tracks.find((t) => t.id === sourceTrackId) ??
      tracks.find((t) => (sourceTrack ? t.type === sourceTrack.type : false));

    const offset = src.startMs - baseStart;
    const pasted: Clip = {
      ...structuredClone(src),
      id: newClipId(),
      startMs: Math.max(0, args.playheadMs + offset),
      linkedClipId: undefined,
    };

    const isAv = src.kind === "video" || src.kind === "image";
    const ensured = isAv
      ? ensureVisualAvTrackForRange(
          tracks,
          pasted.startMs,
          pasted.durationMs,
          { preferredTrackId: preferred?.id },
        )
      : ensureTrackForRange(
          tracks,
          creatableTypeForClipKind(src.kind),
          pasted.startMs,
          pasted.durationMs,
          { preferredTrackId: preferred?.id },
        );
    tracks = ensured.tracks;
    if (!firstClipId) firstClipId = pasted.id;
    clipIds.push(pasted.id);

    tracks = mapTrack(tracks, ensured.trackId, (t) => ({
      ...t,
      clips: [...t.clips, pasted],
    }));
  }

  if (!firstClipId) return null;
  return { tracks, firstClipId, clipIds };
}

export function addClipToTrack(
  tracks: Track[],
  trackId: string,
  clip: Clip,
): Track[] | null {
  const track = tracks.find((t) => t.id === trackId);
  if (!track || track.locked) return null;
  return mapTrack(tracks, trackId, (t) => ({
    ...t,
    clips: [...t.clips, clip],
  }));
}

/** Sorted unique cut points across visible tracks. */
export function collectCutPoints(tracks: Track[]): number[] {
  const set = new Set<number>([0]);
  for (const track of tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      set.add(clip.startMs);
      set.add(clip.startMs + clip.durationMs);
    }
  }
  return [...set].sort((a, b) => a - b);
}

export function nextCutMs(tracks: Track[], playheadMs: number): number | null {
  const cuts = collectCutPoints(tracks);
  for (const c of cuts) {
    if (c > playheadMs + 0.5) return c;
  }
  return null;
}

export function prevCutMs(tracks: Track[], playheadMs: number): number | null {
  const cuts = collectCutPoints(tracks);
  for (let i = cuts.length - 1; i >= 0; i--) {
    const c = cuts[i]!;
    if (c < playheadMs - 0.5) return c;
  }
  return null;
}

/**
 * Apply speed curve: preserve source in/out, recompute durationMs.
 * Syncs linked A/V partner with the same speed + duration.
 */
export function applySpeedToClip(
  tracks: Track[],
  clipId: string,
  speed: SpeedCurve,
): Track[] {
  const found = findClipInTracks(tracks, clipId);
  if (!found) return tracks;

  const resolved = resolveSpeedCurve(speed);
  const sourceSpan = Math.max(0, found.clip.outMs - found.clip.inMs);
  const durationMs = timelineDurationForSpeed(sourceSpan, resolved);
  const nextSpeed: SpeedCurve = {
    ...resolved,
    frameMode: speed.frameMode ?? resolved.frameMode,
    presetId: speed.presetId ?? resolved.presetId,
    keyframes: speed.keyframes ?? resolved.keyframes,
  };

  let next = replaceClipOnTrack(tracks, found.track.id, clipId, {
    ...found.clip,
    speed: nextSpeed,
    durationMs,
  });

  if (found.clip.linkedClipId) {
    const partner = findClipInTracks(next, found.clip.linkedClipId);
    if (partner) {
      next = replaceClipOnTrack(next, partner.track.id, partner.clip.id, {
        ...partner.clip,
        speed: nextSpeed,
        durationMs,
      });
    }
  }

  return next;
}

export type ReverseClipMode = "with-audio" | "without-audio" | "off";

/** Current reverse submenu mode for a clip. */
export function reverseModeOf(clip: Clip): ReverseClipMode {
  if (!clip.reversed) return "off";
  return clip.muteAudio ? "without-audio" : "with-audio";
}

function applyReversePatch(clip: Clip, mode: ReverseClipMode): Clip {
  if (mode === "off") {
    // Clear mute that reverse-without-audio set; leave extract mute alone
    // when the clip was never reversed.
    if (clip.reversed && clip.muteAudio) {
      return { ...clip, reversed: undefined, muteAudio: undefined };
    }
    return { ...clip, reversed: undefined };
  }
  if (mode === "with-audio") {
    return { ...clip, reversed: true, muteAudio: undefined };
  }
  return { ...clip, reversed: true, muteAudio: true };
}

/**
 * Toggle/set reverse playback. Syncs linked A/V partner.
 * Passing the mode that is already active turns reverse off.
 */
export function applyReverseToClip(
  tracks: Track[],
  clipId: string,
  mode: Exclude<ReverseClipMode, "off">,
): Track[] {
  const found = findClipInTracks(tracks, clipId);
  if (!found) return tracks;
  if (found.clip.kind !== "video" && found.clip.kind !== "audio") {
    return tracks;
  }

  const nextMode: ReverseClipMode =
    reverseModeOf(found.clip) === mode ? "off" : mode;
  let next = replaceClipOnTrack(
    tracks,
    found.track.id,
    clipId,
    applyReversePatch(found.clip, nextMode),
  );

  if (found.clip.linkedClipId) {
    const partner = findClipInTracks(next, found.clip.linkedClipId);
    if (partner) {
      next = replaceClipOnTrack(
        next,
        partner.track.id,
        partner.clip.id,
        applyReversePatch(partner.clip, nextMode),
      );
    }
  }

  return next;
}
