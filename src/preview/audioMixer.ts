import {
  clampFadeMs,
  dbToLinear,
} from "../audio/audioMix";
import {
  reverseAudioBuffer,
  reversedBufferOffsetSec,
} from "../audio/reverseBuffer";
import type { AudiblePreviewClip } from "../compositor/resolvePreviewClip";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { MediaAssetRef } from "../project/types";

type LoadedBuffer = {
  audioBuffer: AudioBuffer;
  reversedAudioBuffer?: AudioBuffer;
};

const bufferCache = new Map<string, LoadedBuffer>();
const loading = new Map<string, Promise<LoadedBuffer | null>>();

/** Tiny fade to avoid buffer start/stop clicks. */
const DECLICK_SEC = 0.012;
/** Headroom so stacked video + music doesn't clip as easily. */
const MASTER_GAIN = 0.7;

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
/** Active sources keyed by clipId */
const activeSources = new Map<
  string,
  { source: AudioBufferSourceNode; gain: GainNode; mediaId: string }
>();
/** Identity of scheduled sources (clip set + rate) — mix params excluded. */
let activeIdentityKey = "";
/** Monotonic token so overlapping syncPreviewAudio calls don't double-start. */
let syncGen = 0;

/** When true, timeline project audio is silenced (Record → Mute project). */
let projectMuted = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = MASTER_GAIN;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

async function decodeAsset(
  asset: MediaAssetRef,
  projectPath: string,
): Promise<LoadedBuffer | null> {
  const cached = bufferCache.get(asset.id);
  if (cached) return cached;
  const inflight = loading.get(asset.id);
  if (inflight) return inflight;

  const promise = (async () => {
    const bridge = window.indiecut;
    if (!bridge?.fs) return null;

    let storedPath = asset.path;
    if (asset.kind === "video" && asset.proxyPath) {
      storedPath = asset.proxyPath;
    }

    const abs = resolveMediaAbsolutePath({ projectPath, storedPath });
    const bytes = await bridge.fs.readFile(abs);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const ctx = getCtx();
    const audioBuffer = await ctx.decodeAudioData(copy.buffer);
    const entry = { audioBuffer };
    bufferCache.set(asset.id, entry);
    return entry;
  })()
    .catch((err) => {
      console.warn("Audio decode failed", asset.id, err);
      return null;
    })
    .finally(() => {
      loading.delete(asset.id);
    });

  loading.set(asset.id, promise);
  return promise;
}

function stopAllHard() {
  for (const [, entry] of activeSources) {
    try {
      entry.source.onended = null;
      entry.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      entry.source.disconnect();
      entry.gain.disconnect();
    } catch {
      /* ignore */
    }
  }
  activeSources.clear();
  activeIdentityKey = "";
}

/** Soft-stop to reduce click/pop when tearing down sources. */
function stopAll() {
  const ctx = audioCtx;
  if (!ctx || activeSources.size === 0) {
    stopAllHard();
    return;
  }
  const now = ctx.currentTime;
  for (const [, entry] of activeSources) {
    try {
      const g = entry.gain.gain;
      g.cancelScheduledValues(now);
      const cur = Number.isFinite(g.value) ? Math.max(0.0001, g.value) : 0.0001;
      g.setValueAtTime(cur, now);
      g.linearRampToValueAtTime(0.0001, now + DECLICK_SEC);
      entry.source.stop(now + DECLICK_SEC + 0.002);
    } catch {
      try {
        entry.source.stop();
      } catch {
        /* ignore */
      }
    }
    try {
      entry.source.onended = null;
    } catch {
      /* ignore */
    }
  }
  const snapshot = [...activeSources.values()];
  activeSources.clear();
  activeIdentityKey = "";
  window.setTimeout(() => {
    for (const entry of snapshot) {
      try {
        entry.source.disconnect();
        entry.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
  }, Math.ceil(DECLICK_SEC * 1000) + 20);
}

/** Clip set + playback rate — changing this requires buffer restart. */
function identityKey(audible: AudiblePreviewClip[]): string {
  return audible
    .map((a) => {
      const bucket = a.curveMode ? Math.floor(a.localMs / 100) : 0;
      const rev = a.reversed ? "r" : "f";
      return `${a.clipId}@${a.mediaId}@${a.playbackRate.toFixed(2)}@${rev}@${bucket}`;
    })
    .sort()
    .join(",");
}

function bufferForClip(
  loaded: LoadedBuffer,
  reversed: boolean,
): AudioBuffer {
  if (!reversed) return loaded.audioBuffer;
  if (!loaded.reversedAudioBuffer) {
    loaded.reversedAudioBuffer = reverseAudioBuffer(
      getCtx(),
      loaded.audioBuffer,
    );
  }
  return loaded.reversedAudioBuffer;
}

function peakLinear(volumeDb: number): number {
  return Math.min(4, Math.max(0, dbToLinear(volumeDb)));
}

/**
 * Schedule gain automation for fade in / plateau / fade out relative to
 * where we are inside the clip (localMs already advanced).
 */
function scheduleGainEnvelope(
  gain: GainNode,
  ctx: AudioContext,
  clip: AudiblePreviewClip,
): void {
  const peak = peakLinear(clip.volumeDb);
  const { fadeInMs, fadeOutMs } = clampFadeMs(
    clip.durationMs,
    clip.fadeInMs,
    clip.fadeOutMs,
  );
  const now = ctx.currentTime;
  const local = Math.max(0, clip.localMs);
  const remainingSec = Math.max(0, (clip.durationMs - local) / 1000);

  gain.gain.cancelScheduledValues(now);

  // No user fades — hold a constant level with a short de-click attack only.
  if (fadeInMs <= 0 && fadeOutMs <= 0) {
    const cur = Number.isFinite(gain.gain.value)
      ? Math.max(0.0001, gain.gain.value)
      : 0.0001;
    // Live volume tweak: short slew to new peak (no full restart).
    gain.gain.setValueAtTime(cur, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), now + DECLICK_SEC);
    return;
  }

  let current = peak;
  if (fadeInMs > 0 && local < fadeInMs) {
    current = peak * (local / fadeInMs);
  } else if (fadeOutMs > 0 && local > clip.durationMs - fadeOutMs) {
    const intoOut = local - (clip.durationMs - fadeOutMs);
    current = peak * Math.max(0, 1 - intoOut / fadeOutMs);
  }
  current = Math.max(0.0001, current);

  gain.gain.setValueAtTime(current, now);

  if (remainingSec <= 0) {
    gain.gain.setValueAtTime(0.0001, now);
    return;
  }

  type Knot = { tSec: number; g: number };
  const knots: Knot[] = [];

  if (fadeInMs > 0 && local < fadeInMs) {
    const t = (fadeInMs - local) / 1000;
    if (t > 0.001) knots.push({ tSec: t, g: peak });
  }

  if (fadeOutMs > 0) {
    const fadeOutStart = clip.durationMs - fadeOutMs;
    if (local < fadeOutStart) {
      const tPlateau = (fadeOutStart - local) / 1000;
      if (tPlateau > 0.001) knots.push({ tSec: tPlateau, g: peak });
      const tEnd = (clip.durationMs - local) / 1000;
      if (tEnd > tPlateau + 0.001) knots.push({ tSec: tEnd, g: 0.0001 });
    } else {
      const tEnd = (clip.durationMs - local) / 1000;
      if (tEnd > 0.001) knots.push({ tSec: tEnd, g: 0.0001 });
    }
  }

  let prevT = 0;
  for (const knot of knots) {
    if (knot.tSec <= prevT + 0.0005) continue;
    gain.gain.linearRampToValueAtTime(knot.g, now + knot.tSec);
    prevT = knot.tSec;
  }
}

/** Update gain / detune on already-playing sources (inspector scrub). */
function applyLiveMix(audible: AudiblePreviewClip[]): void {
  const ctx = getCtx();
  for (const clip of audible) {
    const entry = activeSources.get(clip.clipId);
    if (!entry) continue;
    scheduleGainEnvelope(entry.gain, ctx, clip);
    const detune =
      typeof clip.pitchSemitones === "number" &&
      Number.isFinite(clip.pitchSemitones)
        ? clip.pitchSemitones * 100
        : 0;
    try {
      entry.source.detune.setValueAtTime(detune, ctx.currentTime);
    } catch {
      entry.source.detune.value = detune;
    }
  }
}

/**
 * Keep AudioContext sources in sync with audible clips.
 * Starts/stops only when the audible clip set / rate changes —
 * volume/fade/pitch update in place to avoid harsh restart clicks.
 */
export async function syncPreviewAudio(args: {
  audible: AudiblePreviewClip[];
  mediaIndex: MediaAssetRef[];
  projectPath: string;
  playheadMs: number;
  isPlaying: boolean;
}): Promise<void> {
  const { audible, mediaIndex, projectPath, playheadMs, isPlaying } = args;

  if (!isPlaying || !projectPath || projectMuted) {
    stopAll(); // soft fade when pausing / mute
    return;
  }

  const ctx = getCtx();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const nextIdentity = identityKey(audible);
  if (nextIdentity === activeIdentityKey && nextIdentity !== "") {
    applyLiveMix(audible);
    return;
  }

  const gen = ++syncGen;
  // Hard stop before starting a new set — avoid overlap with soft-fade tails.
  stopAllHard();
  activeIdentityKey = nextIdentity;
  if (audible.length === 0) return;

  const master = getMaster();

  for (const clip of audible) {
    const asset = mediaIndex.find((m) => m.id === clip.mediaId);
    if (!asset) continue;
    const loaded = await decodeAsset(asset, projectPath);
    if (!loaded) continue;

    if (gen !== syncGen || activeIdentityKey !== nextIdentity) return;

    const stillInRange =
      playheadMs >= clip.startMs &&
      playheadMs < clip.startMs + clip.durationMs;
    if (!stillInRange) continue;

    if (activeSources.has(clip.clipId)) continue;

    const source = ctx.createBufferSource();
    const playBuffer = bufferForClip(loaded, clip.reversed);
    source.buffer = playBuffer;
    const rate = Math.min(8, Math.max(0.1, clip.playbackRate || 1));
    source.playbackRate.value = rate;
    const detune =
      typeof clip.pitchSemitones === "number" &&
      Number.isFinite(clip.pitchSemitones)
        ? clip.pitchSemitones * 100
        : 0;
    source.detune.value = detune;
    const gain = ctx.createGain();
    scheduleGainEnvelope(gain, ctx, clip);
    source.connect(gain);
    gain.connect(master);

    const offsetSec = clip.reversed
      ? reversedBufferOffsetSec(loaded.audioBuffer.duration, clip.sourceMs)
      : Math.max(0, clip.sourceMs / 1000);
    const sourceRemainingSec = clip.reversed
      ? Math.max(0, (clip.sourceMs - clip.inMs) / 1000)
      : Math.max(0, (clip.outMs - clip.sourceMs) / 1000);
    try {
      source.start(0, offsetSec, sourceRemainingSec);
      source.onended = () => {
        activeSources.delete(clip.clipId);
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          /* ignore */
        }
      };
      activeSources.set(clip.clipId, {
        source,
        gain,
        mediaId: clip.mediaId,
      });
    } catch (err) {
      console.warn("Audio start failed", clip.clipId, err);
    }
  }
}

export function setPreviewProjectMuted(muted: boolean): void {
  projectMuted = muted;
  if (muted) stopAll();
}

export function isPreviewProjectMuted(): boolean {
  return projectMuted;
}

export function stopPreviewAudio(): void {
  stopAll();
  if (audioCtx && audioCtx.state !== "closed") {
    void audioCtx.suspend();
  }
}

export function disposePreviewAudio(): void {
  stopAllHard();
  projectMuted = false;
  syncGen++;
  if (masterGain) {
    try {
      masterGain.disconnect();
    } catch {
      /* ignore */
    }
    masterGain = null;
  }
  if (audioCtx) {
    void audioCtx.close();
    audioCtx = null;
  }
  bufferCache.clear();
  loading.clear();
}
