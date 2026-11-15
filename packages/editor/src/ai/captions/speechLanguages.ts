import type { SpeechLanguage } from "./types";

export type SpeechLanguageOption = {
  code: SpeechLanguage;
  label: string;
};

/** Common Whisper language choices for the Captions tab. */
export const SPEECH_LANGUAGES: SpeechLanguageOption[] = [
  { code: "auto", label: "Auto detect" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
];

export const DEFAULT_SPEECH_LANGUAGE: SpeechLanguage = "auto";
