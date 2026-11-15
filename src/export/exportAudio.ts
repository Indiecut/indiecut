import {
  clampFadeMs,
  clipAudioNeedsRemix,
  dbToLinear,
  effectiveAudioMix,
} from "../audio/audioMix";
import {
  reverseAudioBuffer,
  reversedBufferOffsetSec,
} from "../audio/reverseBuffer";
import { evaluateClipVolumeDb } from "../engine/animatable";
import { sampleSpeed, sourceMsAtLocal } from "../engine/speedRemap";
import {
  anyTrackSoloed,
  trackContributes,
} from "../engine/timelineOps";
import { clipLocalMs, timelineDurationMs } from "../engine/time";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { Clip, MediaAssetRef, ProjectDocument, Track } from "../project/types";

export type ExportAudioPlan =
  | { mode: "none" }
  | {
      mode: "remix";
      sampleRate: number;
      numberOfChannels: number;
      pcm: Float32Array;
    }
  | {
      mode: "packet-copy";
      /** Absolute path to the single source media file */
      mediaAbsolutePath: string;
      /** Source in/out in ms */
      inMs: number;
      outMs: number;
      /** Timeline start offset of the clip (pad silence before) */
      startMs: number;
      durationMs: number;
    };

type AudibleExportClip = {
  clip: Clip;
  mediaId: string;
  asset: MediaAssetRef;
};

function collectAudibleClips(
  tracks: Track[],
  mediaIndex: MediaAssetRef[],
): AudibleExportClip[] {
  const soloActive = anyTrackSoloed(tracks);
  const result: AudibleExportClip[] = [];

  for (const track of tracks) {
    if (track.muted) continue;
    if (!trackContributes(track, soloActive)) continue;

    if (track.type === "audio") {
      for (const clip of track.clips) {
        if (clip.kind !== "audio" && clip.kind !== "video") continue;
        if (!clip.mediaId) continue;
        if (clip.muteAudio) continue;
        const asset = mediaIndex.find((m) => m.id === clip.mediaId);
        if (!asset || asset.kind === "image") continue;
        if (asset.kind === "video" && !asset.hasAudio) continue;
        result.push({ clip, mediaId: clip.mediaId, asset });
      }
      continue;
    }

    if (track.type !== "video" && track.type !== "overlay") continue;
    for (const clip of track.clips) {
      if (clip.kind !== "video" && clip.kind !== "image") continue;
      if (!clip.mediaId) continue;
      if (clip.linkedClipId) continue;
      if (clip.muteAudio) continue;
      const asset = mediaIndex.find((m) => m.id === clip.mediaId);
      if (!asset || asset.kind === "image") continue;
      if (!asset.hasAudio) continue;
      result.push({ clip, mediaId: clip.mediaId, asset });
    }
  }

  return result;
}

let decodeCtx: AudioContext | null = null;

function getDecodeCtx(): AudioContext {
  if (!decodeCtx) decodeCtx = new AudioContext();
  return decodeCtx;
}

async function decodeMasterAudio(
  asset: MediaAssetRef,
  projectPath: string,
): Promise<AudioBuffer | null> {
  const bridge = window.indiecut;
  if (!bridge?.fs) return null;
  const abs = resolveMediaAbsolutePath({
    projectPath,
    storedPath: asset.path,
  });
  const bytes = await bridge.fs.readFile(abs);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  try {
    return await getDecodeCtx().decodeAudioData(copy.buffer);
  } catch (err) {
    console.warn("Export audio decode failed", asset.id, err);
    return null;
  }
}

/**
 * Decide packet-copy vs remix and build interleaved PCM when remixing.
 * Packet-copy only when a single unmodified audible clip covers the timeline.
 * Pass `forceRemix` to always build PCM (used when muxing into CanvasSource MP4).
 */
export async function planExportAudio(
  project: ProjectDocument,
  opts?: { forceRemix?: boolean },
): Promise<ExportAudioPlan> {
  const durationMs = timelineDurationMs(project.tracks);
  if (durationMs <= 0) return { mode: "none" };

  const audible = collectAudibleClips(project.tracks, project.mediaIndex);
  if (audible.length === 0) return { mode: "none" };

  const canPacketCopy =
    !opts?.forceRemix &&
    audible.length === 1 &&
    !clipAudioNeedsRemix(audible[0]!.clip) &&
    audible[0]!.clip.startMs <= 0 &&
    audible[0]!.clip.startMs + audible[0]!.clip.durationMs >= durationMs - 1;

  if (canPacketCopy) {
    const item = audible[0]!;
    const abs = resolveMediaAbsolutePath({
      projectPath: project.projectPath,
      storedPath: item.asset.path,
    });
    return {
      mode: "packet-copy",
      mediaAbsolutePath: abs,
      inMs: item.clip.inMs,
      outMs: item.clip.outMs,
      startMs: item.clip.startMs,
      durationMs: item.clip.durationMs,
    };
  }

  // Remix path — OfflineAudioContext mix matching preview envelopes
  const sampleRate = 48000;
  const numberOfChannels = 2;
  const length = Math.max(1, Math.ceil((durationMs / 1000) * sampleRate));
  const offline = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const master = offline.createGain();
  master.gain.value = 0.7;
  master.connect(offline.destination);

  const fps = project.fps || 30;

  for (const item of audible) {
    const buffer = await decodeMasterAudio(item.asset, project.projectPath);
    if (!buffer) continue;

    const { clip } = item;
    const fades = clampFadeMs(
      clip.durationMs,
      clip.audio?.fadeInMs ?? 0,
      clip.audio?.fadeOutMs ?? 0,
    );
    const staticVolumeLin = dbToLinear(effectiveAudioMix(clip).volumeDb);
    const pitch = clip.audio?.pitchSemitones ?? 0;
    const volumeKeyed =
      (clip.audio?.volumeDb?.keyframes.length ?? 0) > 0;

    const reversed = !!clip.reversed;
    const playBuffer = reversed
      ? reverseAudioBuffer(offline, buffer)
      : buffer;

    // Sample in slices when speed-curved, reversed, or volume is keyframed
    const curveMode =
      clip.speed?.mode === "curve" || volumeKeyed || reversed;
    if (!curveMode) {
      const rate = sampleSpeed(0, clip.speed);
      const source = offline.createBufferSource();
      source.buffer = playBuffer;
      source.playbackRate.value = Math.max(0.05, rate);
      if (pitch !== 0) source.detune.value = pitch * 100;

      const gain = offline.createGain();
      gain.connect(master);
      source.connect(gain);

      const startSec = clip.startMs / 1000;
      const durSec = clip.durationMs / 1000;
      const offsetSec = Math.max(0, clip.inMs / 1000);
      const when = Math.max(0, startSec);

      const g = gain.gain;
      g.setValueAtTime(0.0001, when);
      if (fades.fadeInMs > 0) {
        g.linearRampToValueAtTime(
          staticVolumeLin,
          when + fades.fadeInMs / 1000,
        );
      } else {
        g.setValueAtTime(staticVolumeLin, when);
      }
      const fadeOutStart = when + durSec - fades.fadeOutMs / 1000;
      if (fades.fadeOutMs > 0 && fadeOutStart > when) {
        g.setValueAtTime(staticVolumeLin, Math.max(when, fadeOutStart));
        g.linearRampToValueAtTime(0.0001, when + durSec);
      }

      try {
        source.start(when, offsetSec, durSec * Math.max(0.05, rate));
      } catch (err) {
        console.warn("Export schedule failed", clip.id, err);
      }
      continue;
    }

    // Curve / keyed volume / reverse: slice into short segments
    const stepMs = 40;
    for (let local = 0; local < clip.durationMs; local += stepMs) {
      const slice = Math.min(stepMs, clip.durationMs - local);
      const sourceMs = sourceMsAtLocal(clip, local, fps);
      const tNorm = clip.durationMs > 0 ? local / clip.durationMs : 0;
      const rate = Math.max(0.05, sampleSpeed(tNorm, clip.speed));
      const source = offline.createBufferSource();
      source.buffer = playBuffer;
      source.playbackRate.value = rate;
      if (pitch !== 0) source.detune.value = pitch * 100;
      const gain = offline.createGain();
      const globalMs = clip.startMs + local;
      let amp = dbToLinear(evaluateClipVolumeDb(clip, local));
      if (fades.fadeInMs > 0 && local < fades.fadeInMs) {
        amp *= local / fades.fadeInMs;
      }
      if (
        fades.fadeOutMs > 0 &&
        local > clip.durationMs - fades.fadeOutMs
      ) {
        amp *= (clip.durationMs - local) / fades.fadeOutMs;
      }
      gain.gain.value = Math.max(0.0001, amp);
      gain.connect(master);
      source.connect(gain);
      const when = globalMs / 1000;
      const offsetSec = reversed
        ? reversedBufferOffsetSec(buffer.duration, sourceMs)
        : Math.max(0, sourceMs / 1000);
      try {
        source.start(when, offsetSec, (slice / 1000) * rate);
      } catch {
        /* ignore edge schedule errors */
      }
    }
  }

  const rendered = await offline.startRendering();
  const frames = rendered.length;
  const pcm = new Float32Array(frames * numberOfChannels);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = rendered.getChannelData(ch);
    for (let i = 0; i < frames; i++) {
      pcm[i * numberOfChannels + ch] = data[i]!;
    }
  }

  return { mode: "remix", sampleRate, numberOfChannels, pcm };
}

/** @internal helper for packet-copy path consumers */
export function clipLocalMsAt(globalMs: number, clip: Clip): number | null {
  return clipLocalMs(globalMs, clip);
}
