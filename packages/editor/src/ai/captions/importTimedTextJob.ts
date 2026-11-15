import { parseTimedTextFile } from "./parseTimedTextFile";
import { placeSpeechLinesOnTimeline } from "./placeSpeechLinesOnTimeline";
import type { TimedTextParseResult } from "./types";

export type ImportTimedTextJobResult = {
  clipCount: number;
  cueCount: number;
  trackId: string | null;
  parse: TimedTextParseResult;
};

export async function importTimedTextJob({
  fileName,
  text,
}: {
  fileName: string;
  text: string;
}): Promise<ImportTimedTextJobResult> {
  const parse = parseTimedTextFile({ fileName, input: text });
  if (parse.lines.length === 0) {
    throw new Error(
      parse.warnings[0] ??
        "No valid subtitle cues were found in the subtitle file.",
    );
  }

  const placed = placeSpeechLinesOnTimeline({
    lines: parse.lines,
    commitLabel: "Import captions",
  });

  if (placed.clipCount === 0 || placed.cueCount === 0) {
    throw new Error("No captions were generated from the subtitle file.");
  }

  return {
    ...placed,
    parse,
  };
}

export async function importTimedTextFromFile(
  file: File,
): Promise<ImportTimedTextJobResult> {
  const text = await file.text();
  return importTimedTextJob({ fileName: file.name, text });
}
