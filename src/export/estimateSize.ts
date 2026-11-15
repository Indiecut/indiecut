import { resolveExportProfile } from "./profiles";
import type { ExportSettings } from "./types";

/** Estimated size string (e.g. "3M") from duration + bitrate heuristic. */
export function estimateExportSizeLabel(
  durationMs: number,
  settings: Pick<
    ExportSettings,
    "resolution" | "bitRate" | "frameRate" | "videoEnabled" | "audioEnabled"
  >,
): string {
  const profile = resolveExportProfile(settings);
  const sec = Math.max(0, durationMs) / 1000;
  let bits = 0;
  if (settings.videoEnabled) bits += profile.videoBitrateApprox * sec;
  if (settings.audioEnabled) bits += profile.audioBitrateApprox * sec;
  const bytes = bits / 8;
  return formatByteSize(bytes);
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0K";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))}K`;
  const mb = kb / 1024;
  if (mb < 1024) {
    const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
    return `${rounded}M`;
  }
  const gb = mb / 1024;
  const rounded = gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10;
  return `${rounded}G`;
}

export function formatDurationShort(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}
