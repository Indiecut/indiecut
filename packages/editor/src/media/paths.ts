/** Relative derivative paths under the project folder. */

export function thumbRelPath(assetId: string): string {
  return `thumbs/${assetId}.jpg`;
}

export function proxyRelPath(assetId: string): string {
  return `proxies/${assetId}_720.mp4`;
}

export function peaksRelPath(assetId: string): string {
  return `peaks/${assetId}.json`;
}

export function fileBaseName(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? "media";
  return base || "media";
}

export function extensionOf(filePath: string): string {
  const base = fileBaseName(filePath);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

const IMAGE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
]);
/** GIFs are converted to MP4 on import and treated as video. */
const GIF_EXTS = new Set([".gif"]);
const AUDIO_EXTS = new Set([
  ".mp3",
  ".wav",
  ".aac",
  ".m4a",
  ".flac",
  ".ogg",
]);
const VIDEO_EXTS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
]);

export function guessKindFromExt(
  filePath: string,
): "video" | "audio" | "image" | null {
  const ext = extensionOf(filePath);
  if (GIF_EXTS.has(ext)) return "video";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  return null;
}
