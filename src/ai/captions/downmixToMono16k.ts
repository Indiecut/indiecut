export const SPEECH_TARGET_SAMPLE_RATE = 16000;

/**
 * Downmix interleaved PCM to mono and resample to 16 kHz for Whisper.
 */
export async function downmixToMono16k({
  pcm,
  sampleRate,
  numberOfChannels,
  targetSampleRate = SPEECH_TARGET_SAMPLE_RATE,
}: {
  pcm: Float32Array;
  sampleRate: number;
  numberOfChannels: number;
  targetSampleRate?: number;
}): Promise<Float32Array> {
  const channels = Math.max(1, numberOfChannels);
  const frameCount = Math.floor(pcm.length / channels);
  if (frameCount <= 0) return new Float32Array(0);

  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      sum += pcm[i * channels + ch] ?? 0;
    }
    mono[i] = sum / channels;
  }

  if (sampleRate === targetSampleRate) return mono;

  return resampleLinear({
    samples: mono,
    fromRate: sampleRate,
    toRate: targetSampleRate,
  });
}

/** Pure linear resampler (testable without OfflineAudioContext). */
export function resampleLinear({
  samples,
  fromRate,
  toRate,
}: {
  samples: Float32Array;
  fromRate: number;
  toRate: number;
}): Float32Array {
  if (samples.length === 0) return new Float32Array(0);
  if (fromRate === toRate) return samples;

  const outLength = Math.max(
    1,
    Math.round((samples.length * toRate) / fromRate),
  );
  const out = new Float32Array(outLength);
  const ratio = samples.length / outLength;

  for (let i = 0; i < outLength; i++) {
    const src = i * ratio;
    const left = Math.floor(src);
    const right = Math.min(left + 1, samples.length - 1);
    const frac = src - left;
    const a = samples[left] ?? 0;
    const b = samples[right] ?? 0;
    out[i] = a + (b - a) * frac;
  }

  return out;
}
