import type { ImportMaterialMode } from "./types";

function extensionOf(sourcePath: string): string {
  const base = sourcePath.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot);
}

/**
 * Resolve how an imported file should be stored on the project document.
 * - copy_to_project → relative path under media/
 * - keep_original → absolute/original source path
 */
export function toStoredMediaPath(args: {
  mode: ImportMaterialMode;
  projectPath: string;
  sourcePath: string;
  assetId: string;
}): string {
  const { mode, sourcePath } = args;
  if (mode === "keep_original") {
    return sourcePath;
  }
  const ext = extensionOf(sourcePath);
  return `media/${args.assetId}${ext}`;
}

/** Absolute path for reading a media asset from disk. */
export function resolveMediaAbsolutePath(args: {
  projectPath: string;
  storedPath: string;
}): string {
  const { projectPath, storedPath } = args;
  if (
    storedPath.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(storedPath)
  ) {
    return storedPath;
  }
  const sep = projectPath.includes("\\") ? "\\" : "/";
  const base = projectPath.replace(/[/\\]+$/, "");
  return `${base}${sep}${storedPath.replace(/^[/\\]+/, "")}`;
}
