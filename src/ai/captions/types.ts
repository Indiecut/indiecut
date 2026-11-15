export type SpeechLanguageCode = string;

export type SpeechLanguage = SpeechLanguageCode | "auto";

export type SpeechSpan = {
  text: string;
  startSec: number;
  endSec: number;
};

export type SpeechLine = {
  text: string;
  startMs: number;
  durationMs: number;
};

export type SpeechCaptureStatus =
  | "idle"
  | "loading-model"
  | "transcribing"
  | "complete"
  | "error";

export type SpeechCaptureProgress = {
  status: SpeechCaptureStatus;
  progress: number;
  message?: string;
};

export type TimedTextParseResult = {
  lines: SpeechLine[];
  warnings: string[];
  skippedCount: number;
};
