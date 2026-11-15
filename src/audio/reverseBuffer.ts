/**
 * Channel-wise reverse of an AudioBuffer for reverse-clip playback.
 * Web Audio cannot use a negative playbackRate on BufferSource nodes.
 */
export function reverseAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
): AudioBuffer {
  const out = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0, j = src.length - 1; i < src.length; i++, j--) {
      dst[i] = src[j]!;
    }
  }
  return out;
}

/**
 * Offset into a fully reversed buffer that corresponds to original media time.
 */
export function reversedBufferOffsetSec(
  bufferDurationSec: number,
  sourceMs: number,
): number {
  return Math.max(0, bufferDurationSec - Math.max(0, sourceMs) / 1000);
}
