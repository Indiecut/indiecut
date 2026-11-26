/** Fixed ElevenLabs TTS model — no Settings picker in v1. */
export const ELEVENLABS_TTS_MODEL = "eleven_multilingual_v2";

export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

export type ElevenLabsAudioMime = "audio/mpeg";

export type ElevenLabsSpeechResult = {
  bytes: ArrayBuffer;
  mimeType: ElevenLabsAudioMime;
};

export type GenerateSpeechOpts = {
  apiKey: string;
  voiceId: string;
  text: string;
  signal?: AbortSignal;
};

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
    let detail = `ElevenLabs HTTP ${res.status}`;
    const raw = await res.text().catch(() => "");
    if (raw.trim()) {
      try {
        const json = JSON.parse(raw) as {
          detail?: { message?: string } | string;
          message?: string;
        };
        if (typeof json.detail === "string" && json.detail.trim()) {
          detail = json.detail;
        } else if (
          json.detail &&
          typeof json.detail === "object" &&
          typeof json.detail.message === "string"
        ) {
          detail = json.detail.message;
        } else if (typeof json.message === "string" && json.message.trim()) {
          detail = json.message;
        } else {
          detail = raw.trim().slice(0, 200);
        }
      } catch {
        detail = raw.trim().slice(0, 200);
      }
    }
    throw new Error(detail);
  }

  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) {
    throw new Error("ElevenLabs returned empty audio");
  }

  return { bytes, mimeType: "audio/mpeg" };
}
