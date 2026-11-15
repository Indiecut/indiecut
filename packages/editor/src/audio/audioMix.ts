import type { AnimatableProperty, AudioMixParams, Clip, SpeedCurve } from "../project/types";

export type ResolvedAudioMix = {
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  pitchSemitones: number;
};

export const DEFAULT_AUDIO_MIX: ResolvedAudioMix = {
  volumeDb: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
  pitchSemitones: 0,
};

function staticVolumeDb(
  volumeDb: AnimatableProperty<number> | number | undefined,
): number {
  if (typeof volumeDb === "number" && Number.isFinite(volumeDb)) return volumeDb;
  if (volumeDb && typeof volumeDb === "object" && "staticValue" in volumeDb) {
    return volumeDb.staticValue;
  }
  return DEFAULT_AUDIO_MIX.volumeDb;
}

function volumeHasKeys(
  volumeDb: AnimatableProperty<number> | number | undefined,
): boolean {
  return Boolean(
    volumeDb &&
      typeof volumeDb === "object" &&
      Array.isArray(volumeDb.keyframes) &&
      volumeDb.keyframes.length > 0,
  );
}

/**
 * Static audio mix snapshot (uses volumeDb.staticValue).
 * For playhead-accurate volume, use evaluateClipVolumeDb instead.
 */
export function effectiveAudioMix(
  clip: Pick<Clip, "audio"> | null | undefined,
): ResolvedAudioMix {
  const a = clip?.audio;
  return {
    volumeDb: staticVolumeDb(a?.volumeDb),
    fadeInMs: Math.max(
      0,
      typeof a?.fadeInMs === "number" && Number.isFinite(a.fadeInMs)
        ? a.fadeInMs
        : DEFAULT_AUDIO_MIX.fadeInMs,
    ),
    fadeOutMs: Math.max(
      0,
      typeof a?.fadeOutMs === "number" && Number.isFinite(a.fadeOutMs)
        ? a.fadeOutMs
        : DEFAULT_AUDIO_MIX.fadeOutMs,
    ),
    pitchSemitones:
      typeof a?.pitchSemitones === "number" && Number.isFinite(a.pitchSemitones)
        ? a.pitchSemitones
        : DEFAULT_AUDIO_MIX.pitchSemitones,
  };
}

/** dB → linear amplitude (0 dB = 1). Clamps silence floor. */
export function dbToLinear(db: number): number {
  if (!Number.isFinite(db) || db <= -60) return 0;
  return Math.pow(10, db / 20);
}

function speedIsIdentity(speed: SpeedCurve | undefined): boolean {
  if (!speed) return true;
  if (speed.mode === "curve") return false;
  const c = speed.constant ?? 1;
  return Math.abs(c - 1) < 1e-6;
}

/**
 * True when export cannot packet-copy this clip's audio
 * (volume/fade/pitch/speed remapping). Used by preview keying + v1.4 export.
 */
export function clipAudioNeedsRemix(clip: Clip): boolean {
  const mix = effectiveAudioMix(clip);
  if (volumeHasKeys(clip.audio?.volumeDb)) return true;
  if (Math.abs(mix.volumeDb) > 1e-6) return true;
  if (mix.fadeInMs > 0 || mix.fadeOutMs > 0) return true;
  if (Math.abs(mix.pitchSemitones) > 1e-6) return true;
  if (!speedIsIdentity(clip.speed)) return true;
  if (clip.reversed) return true;
  return false;
}

/**
 * Clamp fade lengths so they fit in durationMs and don't cross in the middle
 * more aggressively than half each when both are large.
 */
export function clampFadeMs(
  durationMs: number,
  fadeInMs: number,
  fadeOutMs: number,
): { fadeInMs: number; fadeOutMs: number } {
  const dur = Math.max(0, durationMs);
  let fi = Math.max(0, fadeInMs);
  let fo = Math.max(0, fadeOutMs);
  if (fi + fo <= dur) return { fadeInMs: fi, fadeOutMs: fo };
  if (dur <= 0) return { fadeInMs: 0, fadeOutMs: 0 };
  const scale = dur / (fi + fo);
  return { fadeInMs: fi * scale, fadeOutMs: fo * scale };
}

/** Re-export for callers that still import AudioMixParams shape helpers. */
export type { AudioMixParams };
