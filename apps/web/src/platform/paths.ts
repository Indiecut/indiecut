/** Virtual path helpers for the browser OPFS backend. */

export const OPFS_SCHEME = "opfs:";
export const BLOB_SCHEME = "blob:";

export const PROJECT_SUBDIRS = [
  "media",
  "proxies",
  "thumbs",
  "peaks",
  "exports",
  "filters",
  "cache",
] as const;

export const MEDIA_EXTENSIONS = [
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "mp3",
  "wav",
  "aac",
  "m4a",
  "flac",
  "ogg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
];

export function isOpfsPath(p: string): boolean {
  return p.startsWith(`${OPFS_SCHEME}/`) || p.startsWith(`${OPFS_SCHEME}`);
}

export function isBlobPath(p: string): boolean {
  return p.startsWith(`${BLOB_SCHEME}/`);
}

/** Normalize to `opfs:/...` without duplicate slashes. */
export function normalizeOpfsPath(p: string): string {
  let s = p.trim();
  if (s.startsWith("opfs://")) s = `opfs:/${s.slice("opfs://".length)}`;
  if (s.startsWith("opfs:/")) {
    // ok
  } else if (s.startsWith("opfs:")) {
    s = `opfs:/${s.slice("opfs:".length).replace(/^\//, "")}`;
  }
  return s.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace("opfs:/", "opfs:/");
}

/** Split `opfs:/projects/foo/media/a.mp4` → ["projects","foo","media","a.mp4"] */
export function opfsParts(filePath: string): string[] {
  const norm = normalizeOpfsPath(filePath);
  const rest = norm.replace(/^opfs:\/*/, "");
  return rest.split("/").filter(Boolean);
}

export function joinOpfs(...parts: string[]): string {
  const cleaned = parts
    .flatMap((p) => p.replace(/^opfs:\/*/i, "").split("/"))
    .filter(Boolean);
  return `opfs:/${cleaned.join("/")}`;
}

export function dirnameOpfs(filePath: string): string {
  const parts = opfsParts(filePath);
  if (parts.length <= 1) return "opfs:/";
  return joinOpfs(...parts.slice(0, -1));
}

export function basenamePath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}

export function safeName(suggested: string): string {
  return (
    String(suggested || "Untitled")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .trim() || "Untitled"
  );
}
