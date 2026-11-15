/** Waveform peak helpers (shared by worker). */

export type PeaksDocument = {
  version: 1;
  peaksPerSecond: number;
  channels: 1;
  peaks: number[];
};

export const DEFAULT_PEAKS_PER_SECOND = 100;

type PeakAccumulator = {
  peaksPerSecond: number;
  samplesPerPeak: number;
  peaks: number[];
  bucketMax: number;
  bucketCount: number;
};

export function createPeakAccumulator(
  sampleRate: number,
  peaksPerSecond: number = DEFAULT_PEAKS_PER_SECOND,
): PeakAccumulator {
  return {
    peaksPerSecond,
    samplesPerPeak: Math.max(1, Math.floor(sampleRate / peaksPerSecond)),
    peaks: [],
    bucketMax: 0,
    bucketCount: 0,
  };
}

/** Push one mono sample (already max-abs across channels) into the accumulator. */
export function pushMonoSample(acc: PeakAccumulator, sample: number): void {
  const v = Math.abs(sample);
  if (v > acc.bucketMax) acc.bucketMax = v;
  acc.bucketCount++;
  if (acc.bucketCount >= acc.samplesPerPeak) {
    acc.peaks.push(acc.bucketMax);
    acc.bucketMax = 0;
    acc.bucketCount = 0;
  }
}

/** Push interleaved f32 frames (channels contiguous per frame). */
export function pushInterleavedF32(
  acc: PeakAccumulator,
  data: Float32Array,
  numberOfChannels: number,
): void {
  const frames = Math.floor(data.length / Math.max(1, numberOfChannels));
  for (let i = 0; i < frames; i++) {
    let sample = 0;
    const base = i * numberOfChannels;
    for (let c = 0; c < numberOfChannels; c++) {
      const v = Math.abs(data[base + c]!);
      if (v > sample) sample = v;
    }
    pushMonoSample(acc, sample);
  }
}

export function finalizePeaks(acc: PeakAccumulator): PeaksDocument {
  if (acc.bucketCount > 0) {
    acc.peaks.push(acc.bucketMax);
    acc.bucketMax = 0;
    acc.bucketCount = 0;
  }
  return {
    version: 1,
    peaksPerSecond: acc.peaksPerSecond,
    channels: 1,
    peaks: acc.peaks,
  };
}

/** Downsample AudioBuffer channel data into mono max-abs peaks (main-thread / tests). */
export function audioBuffersToPeaks(
  buffers: Array<{
    sampleRate: number;
    numberOfChannels: number;
    length: number;
    getChannelData: (channel: number) => Float32Array;
  }>,
  peaksPerSecond: number = DEFAULT_PEAKS_PER_SECOND,
): PeaksDocument {
  if (buffers.length === 0) {
    return {
      version: 1,
      peaksPerSecond,
      channels: 1,
      peaks: [],
    };
  }

  const acc = createPeakAccumulator(buffers[0]!.sampleRate, peaksPerSecond);

  for (const buffer of buffers) {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
      channelData.push(buffer.getChannelData(c));
    }

    for (let i = 0; i < length; i++) {
      let sample = 0;
      for (let c = 0; c < channels; c++) {
        const v = Math.abs(channelData[c]![i]!);
        if (v > sample) sample = v;
      }
      pushMonoSample(acc, sample);
    }
  }

  return finalizePeaks(acc);
}
