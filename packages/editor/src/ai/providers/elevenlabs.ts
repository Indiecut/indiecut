/** Fixed ElevenLabs TTS model — no Settings picker in v1. */
export const ELEVENLABS_TTS_MODEL = "eleven_multilingual_v2";

/** Sound effects model (SFX v3). */
export const ELEVENLABS_SFX_MODEL = "eleven_text_to_sound_v3";

/** Speech-to-text model for captions (Scribe). */
export const ELEVENLABS_STT_MODEL = "scribe_v2";

export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

export type ElevenLabsAudioMime = "audio/mpeg";

export type ElevenLabsSpeechResult = {
  bytes: ArrayBuffer;
  mimeType: ElevenLabsAudioMime;
};

export type ElevenLabsTranscriptWord = {
  text: string;
  startSec: number;
  endSec: number;
};

export type ElevenLabsTranscriptResult = {
  text: string;
  words: ElevenLabsTranscriptWord[];
  languageCode?: string;
};

export type GenerateSpeechOpts = {
  apiKey: string;
  voiceId: string;
  text: string;
  signal?: AbortSignal;
};

export type GenerateSoundEffectOpts = {
  apiKey: string;
  /** Natural-language description of the sound. */
  text: string;
  /** Optional length in seconds (0.5–30). Omit to let the model choose. */
  durationSeconds?: number;
  loop?: boolean;
  /** 0–1; higher = follow prompt more literally. */
  promptInfluence?: number;
  signal?: AbortSignal;
};

export type TranscribeSpeechOpts = {
  apiKey: string;
  /** Mono float PCM samples. */
  samples: Float32Array;
  /** Sample rate of `samples` (caption pipeline uses 16 kHz). */
  sampleRate?: number;
  /** ISO-639-1/3 language code. Omit or `"auto"` to let the model detect. */
  language?: string;
  signal?: AbortSignal;
};

async function parseElevenLabsHttpError(res: Response): Promise<string> {
  let detail = `ElevenLabs HTTP ${res.status}`;
  const raw = await res.text().catch(() => "");
  if (!raw.trim()) return detail;
  try {
    const json = JSON.parse(raw) as {
      detail?: { message?: string } | string;
      message?: string;
    };
    if (typeof json.detail === "string" && json.detail.trim()) {
      return json.detail.trim();
    }
    if (
      json.detail &&
      typeof json.detail === "object" &&
      typeof json.detail.message === "string" &&
      json.detail.message.trim()
    ) {
      return json.detail.message.trim();
    }
    if (typeof json.message === "string" && json.message.trim()) {
      return json.message.trim();
    }
    return raw.trim().slice(0, 200);
  } catch {
    return raw.trim().slice(0, 200);
  }
}

/**
 * Text → MP3 via ElevenLabs TTS. Never logs the API key.
 */
export async function generateSpeech(
  opts: GenerateSpeechOpts,
): Promise<ElevenLabsSpeechResult> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) {
    throw new Error("ElevenLabs API key is missing");
  }
  const voiceId = opts.voiceId.trim();
  if (!voiceId) {
    throw new Error("ElevenLabs Voice ID is missing");
  }
  const text = opts.text.trim();
  if (!text) {
    throw new Error("Speech text is required");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_TTS_MODEL,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(await parseElevenLabsHttpError(res));
  }

  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) {
    throw new Error("ElevenLabs returned empty audio");
  }

  return { bytes, mimeType: "audio/mpeg" };
}

/**
 * Text description → MP3 sound effect via ElevenLabs Sound Generation.
 * Does not require a Voice ID. Never logs the API key.
 */
export async function generateSoundEffect(
  opts: GenerateSoundEffectOpts,
): Promise<ElevenLabsSpeechResult> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) {
    throw new Error("ElevenLabs API key is missing");
  }
  const text = opts.text.trim();
  if (!text) {
    throw new Error("Sound effect description is required");
  }

  const body: Record<string, unknown> = {
    text,
    model_id: ELEVENLABS_SFX_MODEL,
  };

  if (
    typeof opts.durationSeconds === "number" &&
    Number.isFinite(opts.durationSeconds)
  ) {
    body.duration_seconds = Math.min(
      30,
      Math.max(0.5, opts.durationSeconds),
    );
  }
  if (opts.loop === true) {
    body.loop = true;
  }
  if (
    typeof opts.promptInfluence === "number" &&
    Number.isFinite(opts.promptInfluence)
  ) {
    body.prompt_influence = Math.min(1, Math.max(0, opts.promptInfluence));
  }

  const url = `https://api.elevenlabs.io/v1/sound-generation?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(await parseElevenLabsHttpError(res));
  }

  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) {
    throw new Error("ElevenLabs returned empty sound effect");
  }

  return { bytes, mimeType: "audio/mpeg" };
}

/**
 * Encode mono float PCM as a 16-bit little-endian WAV (RIFF) buffer.
 */
export function encodeMonoWavPcm16(
  samples: Float32Array,
  sampleRate: number,
): ArrayBuffer {
  const rate = Math.max(1, Math.floor(sampleRate));
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    const int16 = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    view.setInt16(offset, int16, true);
    offset += 2;
  }
  return buffer;
}

/**
 * Mono PCM → timed transcript via ElevenLabs Speech-to-Text (Scribe).
 * Uses the API key only (no Voice ID). Never logs the API key.
 */
export async function transcribeSpeech(
  opts: TranscribeSpeechOpts,
): Promise<ElevenLabsTranscriptResult> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) {
    throw new Error("ElevenLabs API key is missing");
  }
  if (!opts.samples.length) {
    throw new Error("Audio samples are empty");
  }

  const sampleRate = opts.sampleRate ?? 16000;
  const wav = encodeMonoWavPcm16(opts.samples, sampleRate);
  const form = new FormData();
  form.append("model_id", ELEVENLABS_STT_MODEL);
  form.append(
    "file",
    new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    "timeline.wav",
  );
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");

  const language = opts.language?.trim();
  if (language && language !== "auto") {
    form.append("language_code", language);
  }

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: form,
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(await parseElevenLabsHttpError(res));
  }

  const json = (await res.json()) as {
    text?: string;
    language_code?: string;
    words?: Array<{
      text?: string;
      type?: string;
      start?: number | null;
      end?: number | null;
    }>;
  };

  const text = typeof json.text === "string" ? json.text.trim() : "";
  const words: ElevenLabsTranscriptWord[] = [];
  for (const w of json.words ?? []) {
    if (w.type && w.type !== "word") continue;
    const wordText = typeof w.text === "string" ? w.text.trim() : "";
    if (!wordText) continue;
    const startSec =
      typeof w.start === "number" && Number.isFinite(w.start) ? w.start : 0;
    const endSec =
      typeof w.end === "number" && Number.isFinite(w.end)
        ? Math.max(startSec, w.end)
        : startSec;
    words.push({ text: wordText, startSec, endSec });
  }

  if (!text && words.length === 0) {
    throw new Error("ElevenLabs returned an empty transcript");
  }

  return {
    text: text || words.map((w) => w.text).join(" "),
    words,
    languageCode:
      typeof json.language_code === "string" ? json.language_code : undefined,
  };
}
