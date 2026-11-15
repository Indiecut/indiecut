import type { SpeechLine, TimedTextParseResult } from "./types";

function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : "";
}

function parseTimestampToMs(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  // SRT/ASS: HH:MM:SS.ms or H:MM:SS.cs
  const match = cleaned.match(
    /^(\d{1,2}):(\d{2}):(\d{2})(?:[.:](\d{1,3}))?$/,
  );
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  let frac = match[4] ?? "0";
  // Normalize to milliseconds
  if (frac.length === 2) {
    // centiseconds
    frac = `${frac}0`;
  } else if (frac.length === 1) {
    frac = `${frac}00`;
  } else if (frac.length > 3) {
    frac = frac.slice(0, 3);
  }
  const ms = Number(frac.padEnd(3, "0"));
  if ([hours, minutes, seconds, ms].some((n) => Number.isNaN(n))) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
}

function stripAssTags(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/\\N/gi, "\n")
    .replace(/\\n/gi, "\n")
    .trim();
}

function stripHtmlish(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

export function parseSrtDocument(input: string): TimedTextParseResult {
  const lines: SpeechLine[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  const blocks = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/);

  for (const block of blocks) {
    const rawLines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (rawLines.length === 0) continue;

    let timingLine = rawLines[0]!;
    let textStart = 1;
    // Optional numeric index line
    if (/^\d+$/.test(timingLine) && rawLines.length > 1) {
      timingLine = rawLines[1]!;
      textStart = 2;
    }

    const timingMatch = timingLine.match(
      /^(.+?)\s*-->\s*(.+?)(?:\s+.*)?$/,
    );
    if (!timingMatch) {
      skippedCount += 1;
      continue;
    }

    const startMs = parseTimestampToMs(timingMatch[1]!);
    const endMs = parseTimestampToMs(timingMatch[2]!);
    if (startMs == null || endMs == null || endMs <= startMs) {
      skippedCount += 1;
      continue;
    }

    const text = stripHtmlish(rawLines.slice(textStart).join("\n"));
    if (!text) {
      skippedCount += 1;
      continue;
    }

    lines.push({
      text,
      startMs,
      durationMs: endMs - startMs,
    });
  }

  if (skippedCount > 0) {
    warnings.push(
      `Skipped ${skippedCount} malformed SRT cue(s).`,
    );
  }

  return { lines, warnings, skippedCount };
}

export function parseAssDocument(input: string): TimedTextParseResult {
  const lines: SpeechLine[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;

  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");

  let inEvents = false;
  let formatParts: string[] | null = null;

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      inEvents = /^\[events\]$/i.test(line);
      continue;
    }
    if (!inEvents) continue;

    if (/^format:/i.test(line)) {
      formatParts = line
        .slice(line.indexOf(":") + 1)
        .split(",")
        .map((p) => p.trim().toLowerCase());
      continue;
    }

    if (!/^dialogue:/i.test(line)) continue;

    const payload = line.slice(line.indexOf(":") + 1).trim();
    // ASS Dialogue fields are comma-separated; Text is the last field and may contain commas.
    const parts = payload.split(",");
    if (!formatParts || formatParts.length === 0) {
      // Fallback: Start, End are typically indices 1 and 2 after Layer
      if (parts.length < 10) {
        skippedCount += 1;
        continue;
      }
      const startMs = parseTimestampToMs(parts[1]!.trim());
      const endMs = parseTimestampToMs(parts[2]!.trim());
      const text = stripAssTags(parts.slice(9).join(","));
      if (startMs == null || endMs == null || endMs <= startMs || !text) {
        skippedCount += 1;
        continue;
      }
      lines.push({
        text,
        startMs,
        durationMs: endMs - startMs,
      });
      continue;
    }

    const startIdx = formatParts.indexOf("start");
    const endIdx = formatParts.indexOf("end");
    const textIdx = formatParts.indexOf("text");
    if (startIdx < 0 || endIdx < 0 || textIdx < 0) {
      skippedCount += 1;
      continue;
    }

    // Text consumes the remainder after its index.
    if (parts.length <= Math.max(startIdx, endIdx, textIdx)) {
      skippedCount += 1;
      continue;
    }

    const startMs = parseTimestampToMs(parts[startIdx]!.trim());
    const endMs = parseTimestampToMs(parts[endIdx]!.trim());
    const text = stripAssTags(parts.slice(textIdx).join(","));
    if (startMs == null || endMs == null || endMs <= startMs || !text) {
      skippedCount += 1;
      continue;
    }

    lines.push({
      text,
      startMs,
      durationMs: endMs - startMs,
    });
  }

  if (skippedCount > 0) {
    warnings.push(
      `Skipped ${skippedCount} malformed ASS/SSA cue(s).`,
    );
  }

  return { lines, warnings, skippedCount };
}

export function parseTimedTextFile({
  fileName,
  input,
}: {
  fileName: string;
  input: string;
}): TimedTextParseResult {
  const ext = extensionOf(fileName);
  if (ext === "srt") {
    return parseSrtDocument(input);
  }
  if (ext === "ass" || ext === "ssa") {
    return parseAssDocument(input);
  }

  // Heuristic fallback
  if (input.includes("-->")) {
    return parseSrtDocument(input);
  }
  if (/^\[script info\]/im.test(input) || /^dialogue:/im.test(input)) {
    return parseAssDocument(input);
  }

  return {
    lines: [],
    warnings: [`Unsupported subtitle format: ${fileName || "unknown"}`],
    skippedCount: 0,
  };
}
