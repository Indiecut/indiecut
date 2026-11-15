import {
  findOutgoingNeighbor,
  outgoingCoversTransition,
  transitionProgressAt,
} from "../engine/editPoints";
import {
  anyTrackSoloed,
  trackContributes,
} from "../engine/timelineOps";
import { effectiveAudioMix } from "../audio/audioMix";
import {
  evaluateClipAdjust,
  evaluateClipMasks,
  evaluateClipOpacity,
  evaluateClipTransform,
  evaluateClipTransform3D,
  evaluateClipVolumeDb,
  evaluateEffectIntensity,
  evaluateFilterStrength,
} from "../engine/animatable";
import { sampleSpeed, sourceMsAtLocal } from "../engine/speedRemap";
import { clipLocalMs } from "../engine/time";
import {
  activeCaptionCue,
  resolveCaptionCueLayoutX,
  resolveCaptionCueLayoutY,
  resolveCaptionTextAtLocalMs,
} from "../ai/captions/resolveCaptionText";
import type { Clip, MediaAssetRef, Track, TrackType } from "../project/types";
import type { ResolvedPreviewClip } from "./types";

function isVisualPreviewTrack(type: TrackType): boolean {
  return (
    type === "video" ||
    type === "overlay" ||
    type === "text" ||
    type === "caption" ||
    type === "sticker" ||
    type === "effect" ||
    type === "filter"
  );
}

function withResolvedVisual(
  layer: ResolvedPreviewClip,
  clip: Clip,
  localMs: number,
): ResolvedPreviewClip {
  const resolved: ResolvedPreviewClip = {
    ...layer,
    resolvedTransform: evaluateClipTransform(clip, localMs),
    resolvedTransform3d: evaluateClipTransform3D(clip, localMs),
    resolvedOpacity: evaluateClipOpacity(clip, localMs),
    resolvedAdjust: evaluateClipAdjust(clip, localMs),
    resolvedMasks: evaluateClipMasks(clip, localMs),
  };
  if (clip.filter) {
    resolved.resolvedFilterStrength = evaluateFilterStrength(clip, localMs);
  }
  if (clip.effect) {
    resolved.resolvedEffectIntensity = evaluateEffectIntensity(clip, localMs);
  }
  return resolved;
}

function resolveMediaLayer(
  clip: Clip,
  mediaIndex: MediaAssetRef[],
  localMs: number,
  fps: number,
): ResolvedPreviewClip | null {
  if (clip.kind !== "video" && clip.kind !== "image") return null;
  if (!clip.mediaId) return null;
  const asset = mediaIndex.find((m) => m.id === clip.mediaId);
  if (!asset) return null;
  if (asset.kind !== "video" && asset.kind !== "image") return null;
  return withResolvedVisual(
    {
      clip,
      mediaId: clip.mediaId,
      kind: asset.kind,
      sourceMs: sourceMsAtLocal(clip, localMs, fps),
      localMs,
    },
    clip,
    localMs,
  );
}

/**
 * Resolve visual layers at globalMs, ordered bottom → top for compositing.
 * Tracks array is top → bottom in the UI; we reverse visual contributors.
 * Hidden tracks skipped; solo rules applied.
 * Includes filter/effect adjustment layers and transition pairs.
 */
export function resolvePreviewLayers(
  tracks: Track[],
  mediaIndex: MediaAssetRef[],
  globalMs: number,
  fps = 30,
  /** Frame height for per-cue caption layout overrides. */
  compositionHeight?: number,
): ResolvedPreviewClip[] {
  const soloActive = anyTrackSoloed(tracks);
  const visual = tracks.filter(
    (t) =>
      isVisualPreviewTrack(t.type) &&
      !t.hidden &&
      trackContributes(t, soloActive),
  );
  // UI top-first → reverse so main/lower lanes paint first.
  const bottomToTop = [...visual].reverse();
  const layers: ResolvedPreviewClip[] = [];

  for (const track of bottomToTop) {
    if (track.type === "filter") {
      for (const clip of track.clips) {
        if (clip.kind !== "filter" || !clip.filter?.lutId) continue;
        const localMs = clipLocalMs(globalMs, clip);
        if (localMs === null) continue;
        layers.push({
          clip,
          kind: "filter",
          sourceMs: 0,
          localMs,
          filter: clip.filter,
          resolvedFilterStrength: evaluateFilterStrength(clip, localMs),
        });
      }
      continue;
    }

    if (track.type === "effect") {
      for (const clip of track.clips) {
        if (clip.kind !== "effect" || !clip.effect?.effectId) continue;
        const localMs = clipLocalMs(globalMs, clip);
        if (localMs === null) continue;
        layers.push({
          clip,
          kind: "effect",
          sourceMs: 0,
          localMs,
          effect: clip.effect,
          resolvedEffectIntensity: evaluateEffectIntensity(clip, localMs),
        });
      }
      continue;
    }

    let picked: ResolvedPreviewClip | null = null;

    for (const clip of track.clips) {
      const localMs = clipLocalMs(globalMs, clip);
      if (localMs === null) continue;

      if (clip.kind === "text") {
        picked = withResolvedVisual(
          {
            clip,
            kind: "text",
            sourceMs: 0,
            localMs,
          },
          clip,
          localMs,
        );
        continue;
      }

      if (clip.kind === "caption") {
        const resolvedText = resolveCaptionTextAtLocalMs(clip, localMs);
        if (!resolvedText) continue;
        picked = withResolvedVisual(
          {
            clip,
            kind: "caption",
            sourceMs: 0,
            localMs,
            resolvedText,
          },
          clip,
          localMs,
        );
        const caption = clip.caption;
        if (
          caption &&
          compositionHeight != null &&
          compositionHeight > 0 &&
          picked.resolvedTransform
        ) {
          const cue = activeCaptionCue(
            caption.cues,
            localMs,
            caption.speed,
          );
          picked = {
            ...picked,
            resolvedTransform: {
              ...picked.resolvedTransform,
              x: resolveCaptionCueLayoutX(
                caption,
                cue,
                picked.resolvedTransform.x,
              ),
              y: resolveCaptionCueLayoutY(caption, cue, compositionHeight),
            },
          };
        }
        continue;
      }

      if (clip.kind === "sticker") {
        if (!clip.stickerId) continue;
        picked = withResolvedVisual(
          {
            clip,
            kind: "sticker",
            stickerId: clip.stickerId,
            sourceMs: 0,
            localMs,
          },
          clip,
          localMs,
        );
        continue;
      }

      if (clip.kind !== "video" && clip.kind !== "image") continue;

      // Transition window: composite outgoing A → incoming B
      const progress = transitionProgressAt(clip, globalMs);
      if (progress !== null && clip.transition) {
        const outgoing = findOutgoingNeighbor(track, clip);
        if (
          outgoing &&
          outgoingCoversTransition(outgoing, clip, globalMs) &&
          outgoing.mediaId
        ) {
          const outLocal = clipLocalMs(globalMs, outgoing);
          const partner = outLocal !== null
            ? resolveMediaLayer(outgoing, mediaIndex, outLocal, fps)
            : null;
          const incoming = resolveMediaLayer(clip, mediaIndex, localMs, fps);
          if (partner && incoming && partner.mediaId) {
            const partnerLocal = partner.localMs;
            picked = {
              ...incoming,
              transitionPartner: {
                clip: outgoing,
                mediaId: partner.mediaId,
                kind: partner.kind === "image" ? "image" : "video",
                sourceMs: partner.sourceMs,
                localMs: partnerLocal,
                resolvedTransform: evaluateClipTransform(
                  outgoing,
                  partnerLocal,
                ),
                resolvedOpacity: evaluateClipOpacity(outgoing, partnerLocal),
                resolvedAdjust: evaluateClipAdjust(outgoing, partnerLocal),
                resolvedMasks: evaluateClipMasks(outgoing, partnerLocal),
              },
              transitionProgress: progress,
              transition: clip.transition,
            };
            continue;
          }
        }
      }

      const mediaLayer = resolveMediaLayer(clip, mediaIndex, localMs, fps);
      if (mediaLayer) picked = mediaLayer;
    }
    if (picked) layers.push(picked);
  }

  return layers;
}

export type AudiblePreviewClip = {
  clipId: string;
  mediaId: string;
  /** Source media time at playhead. */
  sourceMs: number;
  localMs: number;
  /** Clip timeline start — for scheduling. */
  startMs: number;
  inMs: number;
  durationMs: number;
  outMs: number;
  /** Instantaneous or constant playback rate for Web Audio. */
  playbackRate: number;
  /** When true, restart audio more often to track remapped source. */
  curveMode: boolean;
  /** Play through a time-reversed buffer (see audioMixer). */
  reversed: boolean;
  volumeDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  pitchSemitones: number;
};

function pushAudible(
  result: AudiblePreviewClip[],
  clip: Clip,
  mediaId: string,
  localMs: number,
  fps: number,
): void {
  const tNorm = clip.durationMs > 0 ? localMs / clip.durationMs : 0;
  const mix = effectiveAudioMix(clip);
  const reversed = !!clip.reversed;
  result.push({
    clipId: clip.id,
    mediaId,
    sourceMs: sourceMsAtLocal(clip, localMs, fps),
    localMs,
    startMs: clip.startMs,
    inMs: clip.inMs,
    durationMs: clip.durationMs,
    outMs: clip.outMs,
    playbackRate: sampleSpeed(tNorm, clip.speed),
    curveMode: clip.speed?.mode === "curve" || reversed,
    reversed,
    volumeDb: evaluateClipVolumeDb(clip, localMs),
    fadeInMs: mix.fadeInMs,
    fadeOutMs: mix.fadeOutMs,
    pitchSemitones: mix.pitchSemitones,
  });
}

/**
 * Clips audible at globalMs (mute + solo gated).
 * Video/overlay clips play their embedded audio in place.
 * Dedicated audio-track clips (music, SFX, or later detached A/V) still mix in.
 * Linked A/V pairs: only the audio sibling is audible (video side skipped).
 */
export function resolveAudibleClips(
  tracks: Track[],
  mediaIndex: MediaAssetRef[],
  globalMs: number,
  fps = 30,
): AudiblePreviewClip[] {
  const soloActive = anyTrackSoloed(tracks);
  const result: AudiblePreviewClip[] = [];

  for (const track of tracks) {
    if (track.muted) continue;
    if (!trackContributes(track, soloActive)) continue;

    if (track.type === "audio") {
      for (const clip of track.clips) {
        if (clip.kind !== "audio" && clip.kind !== "video") continue;
        if (!clip.mediaId) continue;
        const localMs = clipLocalMs(globalMs, clip);
        if (localMs === null) continue;
        const asset = mediaIndex.find((m) => m.id === clip.mediaId);
        if (!asset) continue;
        if (clip.muteAudio) continue;
        if (asset.kind === "image") continue;
        if (asset.kind === "video" && !asset.hasAudio) continue;
        pushAudible(result, clip, clip.mediaId, localMs, fps);
      }
      continue;
    }

    if (track.type !== "video" && track.type !== "overlay") continue;

    for (const clip of track.clips) {
      if (clip.kind !== "video" && clip.kind !== "image") continue;
      if (!clip.mediaId) continue;
      // Linked pair — audio lives on the audio lane.
      if (clip.linkedClipId) continue;
      // Extracted audio lives on an audio-lane clip; keep video silent.
      if (clip.muteAudio) continue;
      const localMs = clipLocalMs(globalMs, clip);
      if (localMs === null) continue;
      const asset = mediaIndex.find((m) => m.id === clip.mediaId);
      if (!asset) continue;
      if (asset.kind === "image") continue;
      if (!asset.hasAudio) continue;
      pushAudible(result, clip, clip.mediaId, localMs, fps);
    }
  }

  return result;
}
