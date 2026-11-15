import type { CaptionCue, CaptionProps } from "../../project/types";

export const DEFAULT_CAPTION_SPEED = 1;
export const MIN_CAPTION_SPEED = 0.5;
export const MAX_CAPTION_SPEED = 2;

function newCueId(): string {
  return `cue_${Math.random().toString(36).slice(2, 10)}`;
}

/** Clamp caption timing speed into the supported slider range. */
export function normalizeCaptionSpeed(speed: number | undefined): number {
  if (typeof speed !== "number" || !Number.isFinite(speed) || speed <= 0) {
    return DEFAULT_CAPTION_SPEED;
  }
  return Math.min(MAX_CAPTION_SPEED, Math.max(MIN_CAPTION_SPEED, speed));
}

/** Clip-local playhead → stored cue timeline (1× content time). */
export function captionContentMs(
  localMs: number,
  speed: number | undefined,
): number {
  return localMs * normalizeCaptionSpeed(speed);
}

/** Stored cue time → clip-local display time on the timeline. */
export function captionDisplayMs(
  contentMs: number,
  speed: number | undefined,
): number {
  return contentMs / normalizeCaptionSpeed(speed);
}

/** Clip duration needed to cover all cues at the given speed. */
export function captionDurationForSpeed(
  cues: CaptionCue[],
  speed: number | undefined,
): number {
  if (cues.length === 0) return 1;
  let maxEnd = 0;
  for (const cue of cues) {
    if (cue.endMs > maxEnd) maxEnd = cue.endMs;
  }
  return Math.max(1, Math.round(captionDisplayMs(maxEnd, speed)));
}

/**
 * Split a caption document at a clip-local timeline time.
 * Cue times stay stored at 1×; `splitLocalMs` is converted through speed.
 * Right-half cues are shifted so the cut becomes local 0.
 */
export function splitCaptionProps(
  caption: CaptionProps,
  splitLocalMs: number,
): { left: CaptionProps; right: CaptionProps } {
  const splitContentMs = Math.max(
    0,
    captionContentMs(splitLocalMs, caption.speed),
  );
  const leftCues: CaptionCue[] = [];
  const rightCues: CaptionCue[] = [];

  for (const cue of caption.cues) {
    if (cue.endMs <= splitContentMs) {
      leftCues.push(cue);
      continue;
    }
    if (cue.startMs >= splitContentMs) {
      rightCues.push({
        ...cue,
        id: newCueId(),
        startMs: Math.max(0, cue.startMs - splitContentMs),
        endMs: Math.max(1, cue.endMs - splitContentMs),
      });
      continue;
    }

    // Cue straddles the cut — keep text on both halves.
    if (splitContentMs - cue.startMs >= 1) {
      leftCues.push({
        ...cue,
        endMs: splitContentMs,
      });
    }
    const rightEnd = cue.endMs - splitContentMs;
    if (rightEnd >= 1) {
      rightCues.push({
        ...cue,
        id: newCueId(),
        startMs: 0,
        endMs: rightEnd,
      });
    }
  }

  return {
    left: { ...caption, cues: leftCues },
    right: { ...caption, cues: rightCues },
  };
}
