/** Snap `ms` to the nearest target within `thresholdMs`, or return unchanged. */
export function snapMs(
  ms: number,
  targets: number[],
  thresholdMs: number,
): number {
  return snapMsWithGuide(ms, targets, thresholdMs).ms;
}

/** Like snapMs, but also returns the guide target when a snap actually applied. */
export function snapMsWithGuide(
  ms: number,
  targets: number[],
  thresholdMs: number,
): { ms: number; snappedTo: number | null } {
  if (thresholdMs <= 0 || targets.length === 0) {
    return { ms, snappedTo: null };
  }
  let best = ms;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const t of targets) {
    const dist = Math.abs(t - ms);
    if (dist <= thresholdMs && dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  if (best === ms) return { ms, snappedTo: null };
  return { ms: best, snappedTo: best };
}

/** Pixel snap threshold → ms at current zoom (~14px feel). */
export function snapThresholdMs(pxPerSec: number, px = 14): number {
  return (px / Math.max(1, pxPerSec)) * 1000;
}

/** Collect snap targets: playhead + clip edges. */
export function collectEdgeTargets(args: {
  playheadMs: number;
  clipEdges: number[];
}): number[] {
  return [0, args.playheadMs, ...args.clipEdges];
}

/**
 * Choose the best snapped startMs among start-edge and end-edge candidates.
 * Only real snaps (position actually changes) compete — fixes the bug where an
 * unsnapped start (dist 0) always beat a valid end-edge snap.
 */
export function pickSnappedStartMs(args: {
  startMs: number;
  durationMs: number;
  targets: number[];
  thresholdMs: number;
}): { startMs: number; snappedTo: number | null } {
  const { startMs, durationMs, targets, thresholdMs } = args;
  const endMs = startMs + durationMs;

  type Cand = { startMs: number; dist: number; guide: number };
  const cands: Cand[] = [];

  const snappedStart = snapMs(startMs, targets, thresholdMs);
  if (snappedStart !== startMs) {
    cands.push({
      startMs: Math.max(0, snappedStart),
      dist: Math.abs(snappedStart - startMs),
      guide: snappedStart,
    });
  }

  const snappedEnd = snapMs(endMs, targets, thresholdMs);
  if (snappedEnd !== endMs) {
    cands.push({
      startMs: Math.max(0, snappedEnd - durationMs),
      dist: Math.abs(snappedEnd - endMs),
      guide: snappedEnd,
    });
  }

  if (cands.length === 0) {
    return { startMs, snappedTo: null };
  }

  cands.sort((a, b) => a.dist - b.dist);
  const best = cands[0]!;
  return { startMs: best.startMs, snappedTo: best.guide };
}
