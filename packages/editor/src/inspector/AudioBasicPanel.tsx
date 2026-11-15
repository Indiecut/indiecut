import { useState } from "react";
import { effectiveAudioMix } from "../audio/audioMix";
import { evaluateClipVolumeDb } from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import type { AudioMixParams, Clip, Track } from "../project/types";
import { useEditorStore } from "../store/editorStore";
import { InspectorKeyframeRow } from "./InspectorKeyframeRow";
import { SpeedPanel } from "./SpeedPanel";
import { useClipGestureEdit } from "./useClipGestureEdit";

type InspectorTab = "Primary" | "Speed";

type Props = {
  clip: Clip;
  track: Track;
};

function mergeAudio(
  clip: Clip,
  partial: Omit<Partial<AudioMixParams>, "volumeDb">,
): AudioMixParams {
  const base = effectiveAudioMix(clip);
  return {
    volumeDb: clip.audio?.volumeDb,
    fadeInMs: partial.fadeInMs ?? base.fadeInMs,
    fadeOutMs: partial.fadeOutMs ?? base.fadeOutMs,
    pitchSemitones: partial.pitchSemitones ?? base.pitchSemitones,
  };
}

export function AudioBasicPanel({ clip, track }: Props) {
  const [tab, setTab] = useState<InspectorTab>("Primary");
  const locked = track.locked;
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const setAnimatableValue = useEditorStore((s) => s.setAnimatableValue);
  const mix = effectiveAudioMix(clip);
  const gesture = useClipGestureEdit(clip.id, "Audio");

  const localMs = clipLocalMs(playheadMs, clip);
  const offClip = localMs === null || locked;
  const volumeDb =
    localMs !== null
      ? evaluateClipVolumeDb(clip, localMs)
      : mix.volumeDb;

  const patchAudio = (partial: Omit<Partial<AudioMixParams>, "volumeDb">) =>
    ({ audio: mergeAudio(clip, partial) }) satisfies Partial<Clip>;

  const fadeInSec = mix.fadeInMs / 1000;
  const fadeOutSec = mix.fadeOutMs / 1000;
  const maxFadeSec = Math.max(0.1, clip.durationMs / 1000);

  return (
    <div className="inspector-video">
      <div className="inspector-video__tabs" role="tablist">
        {(["Primary", "Speed"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={
              tab === name
                ? "inspector-video__tab inspector-video__tab--active"
                : "inspector-video__tab"
            }
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="inspector-video__body">
      {tab === "Speed" ? (
        <SpeedPanel clip={clip} locked={locked} />
      ) : (
        <>
          <section className="inspector-section">
            <InspectorKeyframeRow
              clipId={clip.id}
              path="audio.volumeDb"
              label="Volume"
              disabled={offClip}
            >
              <input
                type="range"
                className="inspector-slider"
                min={-60}
                max={12}
                step={0.1}
                disabled={offClip}
                value={volumeDb}
                onPointerDown={gesture.begin}
                onPointerUp={gesture.end}
                onChange={(e) => {
                  if (offClip) return;
                  gesture.ensureBegin();
                  setAnimatableValue(
                    clip.id,
                    "audio.volumeDb",
                    Number(e.target.value),
                  );
                }}
              />
              <input
                type="number"
                className="inspector-number"
                disabled={offClip}
                value={Number(volumeDb.toFixed(1))}
                min={-60}
                max={12}
                step={0.1}
                onFocus={gesture.begin}
                onBlur={gesture.end}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || offClip) return;
                  gesture.ensureBegin();
                  setAnimatableValue(
                    clip.id,
                    "audio.volumeDb",
                    Math.min(12, Math.max(-60, v)),
                  );
                }}
              />
              <span className="inspector-field__unit">dB</span>
            </InspectorKeyframeRow>

            <label className="inspector-field">
              <span className="inspector-field__label">Fade in</span>
              <div className="inspector-field__controls">
                <input
                  type="range"
                  className="inspector-slider"
                  min={0}
                  max={maxFadeSec}
                  step={0.1}
                  disabled={locked}
                  value={fadeInSec}
                  onPointerDown={gesture.begin}
                  onPointerUp={gesture.end}
                  onChange={(e) => {
                    gesture.live(
                      patchAudio({
                        fadeInMs: Math.max(0, Number(e.target.value) * 1000),
                      }),
                    );
                  }}
                />
                <input
                  type="number"
                  className="inspector-number"
                  disabled={locked}
                  value={Number(fadeInSec.toFixed(1))}
                  min={0}
                  max={maxFadeSec}
                  step={0.1}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    gesture.live(
                      patchAudio({
                        fadeInMs: Math.max(0, Math.min(maxFadeSec, v) * 1000),
                      }),
                    );
                  }}
                />
                <span className="inspector-field__unit">s</span>
              </div>
            </label>

            <label className="inspector-field">
              <span className="inspector-field__label">Fade out</span>
              <div className="inspector-field__controls">
                <input
                  type="range"
                  className="inspector-slider"
                  min={0}
                  max={maxFadeSec}
                  step={0.1}
                  disabled={locked}
                  value={fadeOutSec}
                  onPointerDown={gesture.begin}
                  onPointerUp={gesture.end}
                  onChange={(e) => {
                    gesture.live(
                      patchAudio({
                        fadeOutMs: Math.max(0, Number(e.target.value) * 1000),
                      }),
                    );
                  }}
                />
                <input
                  type="number"
                  className="inspector-number"
                  disabled={locked}
                  value={Number(fadeOutSec.toFixed(1))}
                  min={0}
                  max={maxFadeSec}
                  step={0.1}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    gesture.live(
                      patchAudio({
                        fadeOutMs: Math.max(0, Math.min(maxFadeSec, v) * 1000),
                      }),
                    );
                  }}
                />
                <span className="inspector-field__unit">s</span>
              </div>
            </label>

            <label className="inspector-field">
              <span className="inspector-field__label">Pitch</span>
              <div className="inspector-field__controls">
                <input
                  type="range"
                  className="inspector-slider"
                  min={-12}
                  max={12}
                  step={0.1}
                  disabled={locked}
                  value={mix.pitchSemitones}
                  onPointerDown={gesture.begin}
                  onPointerUp={gesture.end}
                  onChange={(e) => {
                    gesture.live(
                      patchAudio({
                        pitchSemitones: Number(e.target.value),
                      }),
                    );
                  }}
                />
                <input
                  type="number"
                  className="inspector-number"
                  disabled={locked}
                  value={Number(mix.pitchSemitones.toFixed(1))}
                  min={-12}
                  max={12}
                  step={0.1}
                  onFocus={gesture.begin}
                  onBlur={gesture.end}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    gesture.live(
                      patchAudio({
                        pitchSemitones: Math.min(12, Math.max(-12, v)),
                      }),
                    );
                  }}
                />
                <span className="inspector-field__unit">st</span>
              </div>
            </label>
          </section>
        </>
      )}
      </div>
    </div>
  );
}
