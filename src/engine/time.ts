import type { Clip, Track } from "../project/types";

export type ShotTimeline = {
  totalMs: number;
  offsets: number[];
};

/** Build cumulative offsets for a sequential shot list (VIDEO_RENDERING.md). */
export function buildShotTimeline(
  shots: { durationMs: number }[],
): ShotTimeline {
  const offsets: number[] = [];
  let totalMs = 0;
  for (const shot of shots) {
    offsets.push(totalMs);
    totalMs += shot.durationMs;
  }
  return { totalMs, offsets };
}

/** Map global playhead ms → shot index + local ms within that shot. */
export function resolveGlobalTime(
  globalMs: number,
  shots: { durationMs: number }[],
  timeline = buildShotTimeline(shots),
) {
  const clamped = Math.max(0, Math.min(globalMs, timeline.totalMs));
  let shotIndex = 0;
  for (let i = shots.length - 1; i >= 0; i--) {
    if (clamped >= timeline.offsets[i]!) {
      shotIndex = i;
      break;
    }
  }
  return {
    shotIndex,
    localMs: clamped - timeline.offsets[shotIndex]!,
    globalMs: clamped,
  };
}

/** Local ms inside an absolute-positioned clip, or null if playhead misses it. */
export function clipLocalMs(globalMs: number, clip: Clip): number | null {
  if (globalMs < clip.startMs || globalMs >= clip.startMs + clip.durationMs) {
    return null;
  }
  return globalMs - clip.startMs;
}

export type ActiveClip = {
  track: Track;
  clip: Clip;
  localMs: number;
};

/** All clips active at globalMs across tracks. */
export function clipsAtTime(tracks: Track[], globalMs: number): ActiveClip[] {
  const result: ActiveClip[] = [];
  for (const track of tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      const localMs = clipLocalMs(globalMs, clip);
      if (localMs !== null) {
        result.push({ track, clip, localMs });
      }
    }
  }
  return result;
}

/** End of timeline = max clip end across all tracks. */
export function timelineDurationMs(tracks: Track[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startMs + clip.durationMs);
    }
  }
  return max;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format milliseconds as HH:MM:SS:FF at the given fps. */
export function formatTimecode(ms: number, fps: number): string {
  const safeFps = Math.max(1, fps);
  const totalFrames = Math.max(0, Math.floor((ms / 1000) * safeFps));
  const ff = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}`;
}
