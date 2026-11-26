/** Caption speech-to-text backends offered in the Captions tab. */
export type CaptionSttProvider = "whisper" | "elevenlabs";

export const DEFAULT_CAPTION_STT_PROVIDER: CaptionSttProvider = "whisper";

export const CAPTION_STT_PROVIDERS: ReadonlyArray<{
  id: CaptionSttProvider;
  label: string;
  /** Shown under the select when this option is chosen. */
  hint: string;
}> = [
  {
    id: "whisper",
    label: "On-device Whisper",
    hint: "Runs locally — free, private, downloads a model on first use.",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    hint: "Cloud speech-to-text (Scribe) — uses your ElevenLabs API key.",
  },
];
