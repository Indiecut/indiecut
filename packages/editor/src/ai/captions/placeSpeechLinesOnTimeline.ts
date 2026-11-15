import { defaultAnimatableTransform } from "../../engine/animatable";
import {
  addClipToTrack,
  ensureTrackForRange,
} from "../../engine/timelineOps";
import type { CaptionCue, Clip, Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import {
  captionPropsDefaults,
  captionTransformY,
} from "./speechLineTextDefaults";
import type { SpeechLine } from "./types";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

function newCueId(): string {
  return `cue_${Math.random().toString(36).slice(2, 10)}`;
}

/** Strip every existing caption-document clip (v1: one caption item per project). */
function removeCaptionClips(tracks: Track[]): Track[] {
  return tracks.map((track) => {
    if (track.type !== "caption") return track;
    return {
      ...track,
      clips: track.clips.filter((c) => c.kind !== "caption"),
    };
  });
}

/**
 * Place caption lines as one caption-document clip in an undoable commit.
 * Replaces any existing caption clip.
 */
export function placeSpeechLinesOnTimeline({
  lines,
  commitLabel = "Add auto captions",
}: {
  lines: SpeechLine[];
  commitLabel?: string;
}): { trackId: string | null; clipCount: number; cueCount: number } {
  if (lines.length === 0) {
    return { trackId: null, clipCount: 0, cueCount: 0 };
  }

  const store = getEditorStore();
  const sorted = [...lines]
    .map((line) => ({
      text: line.text.trim(),
      startMs: Math.max(0, Math.round(line.startMs)),
      durationMs: Math.max(1, Math.round(line.durationMs)),
    }))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.startMs - b.startMs);

  if (sorted.length === 0) {
    return { trackId: null, clipCount: 0, cueCount: 0 };
  }

  const clipStartMs = sorted[0]!.startMs;
  const last = sorted[sorted.length - 1]!;
  const clipEndMs = last.startMs + last.durationMs;
  const durationMs = Math.max(1, clipEndMs - clipStartMs);

  const cues: CaptionCue[] = sorted.map((line) => {
    const startMs = Math.max(0, line.startMs - clipStartMs);
    const endMs = Math.max(
      startMs + 1,
      line.startMs + line.durationMs - clipStartMs,
    );
    return {
      id: newCueId(),
      startMs,
      endMs,
      text: line.text,
    };
  });

  let tracks = removeCaptionClips(store.project.tracks);
  const ensured = ensureTrackForRange(tracks, "caption", clipStartMs, durationMs);
  tracks = ensured.tracks;

  const frameH = store.project.height;
  const caption = captionPropsDefaults(cues);
  const y = captionTransformY(caption.position, caption.offsetY, frameH);

  const clip: Clip = {
    id: newClipId(),
    kind: "caption",
    startMs: clipStartMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
    transform: defaultAnimatableTransform({ y }),
    blendMode: "normal",
    caption,
  };

  const next = addClipToTrack(tracks, ensured.trackId, clip);
  if (!next) {
    return { trackId: null, clipCount: 0, cueCount: 0 };
  }

  store.commitTracks(next, commitLabel, {
    clipId: clip.id,
    trackId: ensured.trackId,
  });
  store.setAssetTab("Captions");

  return {
    trackId: ensured.trackId,
    clipCount: 1,
    cueCount: cues.length,
  };
}
