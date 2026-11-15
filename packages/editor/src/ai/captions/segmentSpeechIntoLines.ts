import type { SpeechLine, SpeechSpan } from "./types";

export const DEFAULT_WORDS_PER_LINE = 3;
export const MIN_LINE_DURATION_MS = 800;

/**
 * Split Whisper timed spans into short caption lines (~3 words, min duration).
 */
export function segmentSpeechIntoLines({
  spans,
  wordsPerLine = DEFAULT_WORDS_PER_LINE,
  minDurationMs = MIN_LINE_DURATION_MS,
}: {
  spans: SpeechSpan[];
  wordsPerLine?: number;
  minDurationMs?: number;
}): SpeechLine[] {
  const lines: SpeechLine[] = [];
  let globalEndMs = 0;

  for (const span of spans) {
    const words = span.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const spanStartMs = Math.max(0, span.startSec * 1000);
    const spanEndMs = Math.max(spanStartMs, span.endSec * 1000);
    const spanDurationMs = Math.max(1, spanEndMs - spanStartMs);
    const wordsPerMs = words.length / spanDurationMs;

    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerLine) {
      chunks.push(words.slice(i, i + wordsPerLine).join(" "));
    }

    let chunkStartMs = spanStartMs;
    for (const chunk of chunks) {
      const chunkWords = chunk.split(/\s+/).filter(Boolean).length;
      const chunkDurationMs = Math.max(
        minDurationMs,
        chunkWords / wordsPerMs,
      );
      const adjustedStartMs = Math.max(chunkStartMs, globalEndMs);

      lines.push({
        text: chunk,
        startMs: Math.round(adjustedStartMs),
        durationMs: Math.round(chunkDurationMs),
      });

      globalEndMs = adjustedStartMs + chunkDurationMs;
      chunkStartMs += chunkDurationMs;
    }
  }

  return lines;
}
