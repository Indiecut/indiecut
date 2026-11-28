import { defaultAnimatableTransform } from "../engine/animatable";
import { snapMs, snapThresholdMs } from "../engine/snap";
import {
  addClipToTrack,
  ensureTrackForRange,
  isSharedVisualTrack,
} from "../engine/timelineOps";
import type { Clip, StickerStyleParams, Track } from "../project/types";
import { SHAPE_STICKER_ID } from "../project/types";
import { getEditorStore } from "../store/editorStore";
import {
  findSticker,
  loadStickerManifest,
  type StickerManifestEntry,
} from "../stickers/manifest";
import {
  defaultShapeStickerStyle,
  isShapeStickerId,
} from "../stickers/shapeStickerSvg";
import { defaultStickerStyle } from "../stickers/stickerStyle";
import type { VectorShapePreset } from "../geometry/vectorShape";

export const STICKER_DRAG_MIME = "application/x-indiecut-sticker";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

export type PlaceStickerOnTracksOpts = {
  tracks: Track[];
  entry: StickerManifestEntry;
  targetTrackId?: string;
  startMs?: number;
  durationMs?: number;
  exactStart?: boolean;
  transform?: Clip["transform"];
  stickerStyle?: StickerStyleParams;
  playheadMs: number;
  magnetEnabled: boolean;
  pxPerSec: number;
};

export type PlaceStickerOnTracksResult = {
  tracks: Track[];
  clip: Clip;
  trackId: string;
};

/**
 * Pure sticker placement onto tracks (no commit).
 */
export function placeStickerOnTracks(
  opts: PlaceStickerOnTracksOpts,
): PlaceStickerOnTracksResult | null {
  let tracks = opts.tracks;
  let preferredTrackId: string | undefined;

  if (opts.targetTrackId) {
    const candidate = tracks.find((t) => t.id === opts.targetTrackId);
    if (
      candidate &&
      !candidate.locked &&
      isSharedVisualTrack(candidate.type)
    ) {
      preferredTrackId = candidate.id;
    }
  }

  const durationMs = Math.max(
    500,
    Math.round(opts.durationMs ?? opts.entry.defaultDurationMs),
  );
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

  const ensured = ensureTrackForRange(tracks, "sticker", startMs, durationMs, {
    preferredTrackId,
  });
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) return null;

  const style =
    opts.stickerStyle ??
    (isShapeStickerId(opts.entry.id)
      ? defaultShapeStickerStyle("star")
      : defaultStickerStyle());

  const clip: Clip = {
    id: newClipId(),
    kind: "sticker",
    stickerId: opts.entry.id,
    stickerStyle: style,
    startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
    // Logical size is 256; scale 1 ≈ 256px on a 1080p stage.
    transform:
      opts.transform ??
      defaultAnimatableTransform({ scaleX: 1, scaleY: 1 }),
    blendMode: "normal",
  };

  const next = addClipToTrack(tracks, track.id, clip);
  if (!next) return null;

  return { tracks: next, clip, trackId: track.id };
}

/**
 * Place a kinetic sticker on a sticker lane at the playhead.
 * Overlapping / foreign-lane aims spill onto a new sticker lane beside the aim.
 */
export async function addStickerToTimeline(
  stickerId: string,
  targetTrackId?: string,
  stickerStyle?: StickerStyleParams,
): Promise<Clip | null> {
  if (
    isShapeStickerId(stickerId) ||
    stickerId === SHAPE_STICKER_ID ||
    stickerId.startsWith(`${SHAPE_STICKER_ID}:`)
  ) {
    const presetRaw = stickerId.includes(":")
      ? stickerId.slice(SHAPE_STICKER_ID.length + 1)
      : (stickerStyle?.shapePreset ?? "star");
    const preset =
      (presetRaw as Exclude<VectorShapePreset, "custom"> | "custom") || "star";
    return addShapeStickerToTimeline(preset, targetTrackId, stickerStyle);
  }
  const manifest = await loadStickerManifest();
  const entry = findSticker(manifest, stickerId);
  if (!entry) return null;
  return placeStickerEntry(entry, targetTrackId, stickerStyle);
}

/** Insert a parametric shape sticker (`stickerId === "shape"`). */
export function addShapeStickerToTimeline(
  preset: Exclude<VectorShapePreset, "custom"> | "custom" = "star",
  targetTrackId?: string,
  styleOverride?: StickerStyleParams,
): Clip | null {
  const entry: StickerManifestEntry = {
    id: SHAPE_STICKER_ID,
    name: "Shape",
    file: "shape/custom.svg",
    group: "shapes",
    tags: ["shape", "vector", String(preset)],
    defaultDurationMs: 3000,
    template: "shape",
    colorRole: "primary",
    slug: "shape",
    catIndex: -1,
  };
  const style =
    styleOverride ??
    (preset === "custom"
      ? defaultShapeStickerStyle("star")
      : defaultShapeStickerStyle(preset));
  if (preset === "custom" && styleOverride?.points) {
    style.shapePreset = "custom";
    style.points = styleOverride.points;
  } else if (preset !== "custom") {
    style.shapePreset = preset;
  }
  return placeStickerEntry(entry, targetTrackId, style);
}

function placeStickerEntry(
  entry: StickerManifestEntry,
  targetTrackId?: string,
  stickerStyle?: StickerStyleParams,
): Clip | null {
  const store = getEditorStore();
  const { project, magnetEnabled, timelinePxPerSec, commitTracks } = store;

  const placed = placeStickerOnTracks({
    tracks: project.tracks,
    entry,
    targetTrackId,
    stickerStyle,
    playheadMs: project.playheadMs,
    magnetEnabled,
    pxPerSec: timelinePxPerSec,
  });
  if (!placed) return null;

  commitTracks(placed.tracks, "Add sticker", {
    clipId: placed.clip.id,
    trackId: placed.trackId,
  });
  return placed.clip;
}
