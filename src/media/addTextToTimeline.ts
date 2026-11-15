import { defaultAnimatableTransform } from "../engine/animatable";
import { snapMs, snapThresholdMs } from "../engine/snap";
import { addClipToTrack, ensureTrackForRange } from "../engine/timelineOps";
import type { Clip, TextProps } from "../project/types";
import { getEditorStore } from "../store/editorStore";
import {
  findTextTemplate,
  textPropsFromTemplate,
} from "../textTemplates/registry";

export const TEXT_DRAG_MIME = "application/x-indiecut-text";
export const TEXT_TEMPLATE_DRAG_MIME = "application/x-indiecut-text-template";

export type TextPresetId = "title" | "body";

const TITLE_DEFAULTS: TextProps = {
  content: "Text",
  fontFamily: "system-ui, sans-serif",
  fontSize: 64,
  color: "#ffffff",
  align: "center",
  strokeWidth: 0,
};

const BODY_DEFAULTS: TextProps = {
  content: "Text",
  fontFamily: "system-ui, sans-serif",
  fontSize: 36,
  color: "#ffffff",
  align: "center",
  strokeWidth: 0,
};

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

export function textPropsForPreset(preset: TextPresetId): TextProps {
  return { ...(preset === "body" ? BODY_DEFAULTS : TITLE_DEFAULTS) };
}

type PlaceTextClipOpts = {
  text: TextProps;
  animation?: Clip["animation"];
  transform?: Clip["transform"];
  commitLabel: string;
  targetTrackId?: string;
  /** Absolute timeline start. Defaults to playhead (+ magnet). */
  startMs?: number;
  /** Clip length in ms. Defaults to 3000. */
  durationMs?: number;
  /** When true with an explicit startMs, skip magnet snap. */
  exactStart?: boolean;
};

/**
 * Shared placement: playhead (+ magnet), text-track spill, commit.
 */
function placeTextClip(opts: PlaceTextClipOpts): Clip | null {
  const store = getEditorStore();
  const { project, magnetEnabled, timelinePxPerSec, commitTracks } = store;

  let tracks = project.tracks;
  let preferredTrackId: string | undefined;

  if (opts.targetTrackId) {
    const candidate = tracks.find((t) => t.id === opts.targetTrackId);
    if (candidate && !candidate.locked && candidate.type === "text") {
      preferredTrackId = candidate.id;
    }
  }

  const durationMs = Math.max(1, Math.round(opts.durationMs ?? 3000));
  let startMs =
    typeof opts.startMs === "number" && Number.isFinite(opts.startMs)
      ? opts.startMs
      : project.playheadMs;
  if (magnetEnabled && !opts.exactStart) {
    const edges: number[] = [0, project.playheadMs];
    for (const t of tracks) {
      for (const c of t.clips) {
        edges.push(c.startMs, c.startMs + c.durationMs);
      }
    }
    startMs = snapMs(startMs, edges, snapThresholdMs(timelinePxPerSec));
  }
  startMs = Math.max(0, Math.round(startMs));

  const ensured = ensureTrackForRange(tracks, "text", startMs, durationMs, {
    preferredTrackId,
  });
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) return null;

  const clip: Clip = {
    id: newClipId(),
    kind: "text",
    startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
    transform: opts.transform ?? defaultAnimatableTransform(),
    blendMode: "normal",
    text: opts.text,
  };
  if (opts.animation) {
    clip.animation = opts.animation;
  }

  const next = addClipToTrack(tracks, track.id, clip);
  if (!next) return null;

  commitTracks(next, opts.commitLabel, { clipId: clip.id, trackId: track.id });
  return clip;
}

/**
 * Place a styled text clip at an absolute timeline range (e.g. caption cue).
 */
export function addTextClipAt(opts: {
  text: TextProps;
  startMs: number;
  durationMs: number;
  animation?: Clip["animation"];
  transform?: Clip["transform"];
  commitLabel?: string;
  targetTrackId?: string;
}): Clip | null {
  return placeTextClip({
    text: opts.text,
    animation: opts.animation,
    transform: opts.transform,
    startMs: opts.startMs,
    durationMs: opts.durationMs,
    exactStart: true,
    commitLabel: opts.commitLabel ?? "Add text",
    targetTrackId: opts.targetTrackId,
  });
}

/**
 * Place a Title/Body text clip on a text track at the playhead.
 * Overlapping ranges spill onto a new text track.
 */
export function addTextToTimeline(
  preset: TextPresetId = "title",
  targetTrackId?: string,
): Clip | null {
  return placeTextClip({
    text: textPropsForPreset(preset),
    commitLabel: "Add text",
    targetTrackId,
  });
}

/**
 * Place a bundled text template on a text track at the playhead.
 * Seeds style recipe (+ optional default animation) and `templateId`.
 */
export function addTextTemplateToTimeline(
  templateId: string,
  targetTrackId?: string,
): Clip | null {
  const entry = findTextTemplate(templateId);
  if (!entry) return null;

  return placeTextClip({
    text: textPropsFromTemplate(entry),
    animation: entry.defaultAnimation,
    commitLabel: "Add text template",
    targetTrackId,
  });
}
