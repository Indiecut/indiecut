import type { IndieCutBridge } from "@indiecut/platform";
import { forgetBlob, hasBlob, readBlobBytes, registerBlob } from "./blobStore";
import {
  downloadOrSavePath,
  exportStreamClose,
  exportStreamOpen,
  exportStreamWrite,
} from "./exportStream";
import {
  copyFile as opfsCopyFile,
  ensureProjectDirs,
  joinOpfs,
  listProjectDir,
  listProjectNames,
  normalizeOpfsPath,
  pathExists,
  readFileBytes,
  uniqueProjectPath,
  unlinkPath,
  writeFileBytes,
} from "./opfs";
import { isBlobPath, isOpfsPath, MEDIA_EXTENSIONS, safeName } from "./paths";

const EXPORT_FOLDER = "opfs:/exports";

let wakeLock: WakeLockSentinel | null = null;

function pickViaInput(multiple: boolean, accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const files = input.files ? Array.from(input.files) : [];
      input.remove();
      resolve(files);
    });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve([]);
    });
    document.body.appendChild(input);
    input.click();
  });
}

async function pickMediaFiles(): Promise<string[]> {
  const accept = MEDIA_EXTENSIONS.map((e) => `.${e}`).join(",");
  if ("showOpenFilePicker" in window) {
    try {
      const handles = await (
        window as unknown as {
          showOpenFilePicker: (opts: {
            multiple: boolean;
            types?: Array<{
              description: string;
              accept: Record<string, string[]>;
            }>;
          }) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Media",
            accept: {
              "video/*": MEDIA_EXTENSIONS.filter((e) =>
                ["mp4", "mov", "m4v", "webm", "mkv", "avi", "gif"].includes(e),
              ).map((e) => `.${e}`),
              "audio/*": MEDIA_EXTENSIONS.filter((e) =>
                ["mp3", "wav", "aac", "m4a", "flac", "ogg"].includes(e),
              ).map((e) => `.${e}`),
              "image/*": MEDIA_EXTENSIONS.filter((e) =>
                ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(e),
              ).map((e) => `.${e}`),
            },
          },
        ],
      });
      const paths: string[] = [];
      for (const handle of handles) {
        const file = await handle.getFile();
        paths.push(registerBlob(file));
      }
      return paths;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return [];
      /* fall through */
    }
  }
  const files = await pickViaInput(true, accept);
  return files.map((f) => registerBlob(f));
}

async function pickProjectFolder(): Promise<string | null> {
  const names = await listProjectNames();
  if (names.length === 0) {
    window.alert(
      "No browser projects found yet. Use New Project to create one (stored in this browser).",
    );
    return null;
  }
  const listed = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  const choice = window.prompt(
    `Open a project stored in this browser:\n\n${listed}\n\nEnter number or exact name:`,
    names[0],
  );
  if (!choice) return null;
  const trimmed = choice.trim();
  const asIndex = Number.parseInt(trimmed, 10);
  if (
    Number.isFinite(asIndex) &&
    asIndex >= 1 &&
    asIndex <= names.length &&
    String(asIndex) === trimmed
  ) {
    return joinOpfs("projects", names[asIndex - 1]!);
  }
  if (names.includes(trimmed)) {
    return joinOpfs("projects", trimmed);
  }
  window.alert(`Project not found: ${trimmed}`);
  return null;
}

async function createProjectFolder(
  suggestedName?: string,
): Promise<string | null> {
  const name = safeName(
    suggestedName ||
      window.prompt("Project name", "Untitled") ||
      "Untitled",
  );
  const projectPath = await uniqueProjectPath(name);
  await ensureProjectDirs(projectPath);
  return projectPath;
}

async function pickExportFolder(): Promise<string | null> {
  const folder = EXPORT_FOLDER;
  if (!(await pathExists(joinOpfs("exports", ".keep")))) {
    await writeFileBytes(joinOpfs("exports", ".keep"), "", "utf8");
  }
  return folder;
}

async function readAnyFile(filePath: string): Promise<Uint8Array> {
  if (isBlobPath(filePath)) return readBlobBytes(filePath);
  if (isOpfsPath(filePath)) return readFileBytes(filePath);
  // Relative paths under an open project are always resolved to absolute by callers.
  throw new Error(`Unsupported path: ${filePath}`);
}

async function writeAnyFile(
  filePath: string,
  data: Uint8Array | ArrayBuffer | string,
  encoding?: "utf8",
): Promise<string> {
  if (isBlobPath(filePath)) {
    throw new Error("Cannot write to upload blob paths");
  }
  return writeFileBytes(filePath, data, encoding);
}

async function pathExistsAny(targetPath: string): Promise<boolean> {
  if (isBlobPath(targetPath)) return hasBlob(targetPath);
  if (isOpfsPath(targetPath)) return pathExists(targetPath);
  return false;
}

async function copyAny(sourcePath: string, destPath: string): Promise<string> {
  if (isBlobPath(sourcePath)) {
    const bytes = await readBlobBytes(sourcePath);
    await writeFileBytes(destPath, bytes);
    return normalizeOpfsPath(destPath);
  }
  return opfsCopyFile(sourcePath, destPath);
}

async function unlinkAny(
  filePath: string,
): Promise<{ ok: boolean; missing?: boolean }> {
  if (isBlobPath(filePath)) {
    if (!hasBlob(filePath)) return { ok: true, missing: true };
    forgetBlob(filePath);
    return { ok: true };
  }
  return unlinkPath(filePath);
}

function resolveUnderProject(projectPath: string, relativePath: string): string {
  const root = normalizeOpfsPath(projectPath).replace(/\/+$/, "");
  const rel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel.includes("..")) {
    throw new Error("Path escapes project folder");
  }
  return normalizeOpfsPath(`${root}/${rel}`);
}

export function createWebPlatform(): IndieCutBridge {
  return {
    version: "1.0.0-web",
    capabilities: {
      revealInFolder: false,
      openLocalPath: false,
    },
    dialog: {
      pickProjectFolder,
      createProjectFolder,
      pickMediaFiles,
      pickExportFolder,
    },
    exportStream: {
      open: exportStreamOpen,
      write: exportStreamWrite,
      close: exportStreamClose,
    },
    shell: {
      // Desktop-only actions — no-ops on web (UI hides these).
      openPath: async () => false,
      showItemInFolder: async () => false,
      downloadPath: async (targetPath) => {
        if (!isOpfsPath(targetPath)) return false;
        return downloadOrSavePath(targetPath);
      },
    },
    fs: {
      ensureProjectLayout: ensureProjectDirs,
      readProjectJson: async (projectPath) => {
        const bytes = await readFileBytes(
          resolveUnderProject(projectPath, "project.json"),
        );
        return new TextDecoder().decode(bytes);
      },
      writeProjectJson: async (projectPath, jsonText) => {
        await ensureProjectDirs(projectPath);
        await writeFileBytes(
          resolveUnderProject(projectPath, "project.json"),
          jsonText,
          "utf8",
        );
      },
      pathExists: pathExistsAny,
      copyFile: copyAny,
      readFile: readAnyFile,
      unlink: unlinkAny,
      writeFile: writeAnyFile,
      writeProjectFile: async (projectPath, relativePath, data, encoding) => {
        const target = resolveUnderProject(projectPath, relativePath);
        await writeFileBytes(target, data, encoding);
        return target;
      },
      listProjectDir,
    },
    power: {
      blockSleep: async () => {
        try {
          if (navigator.wakeLock?.request) {
            wakeLock = await navigator.wakeLock.request("screen");
          }
        } catch {
          /* unsupported / denied */
        }
        return { id: 1 };
      },
      allowSleep: async () => {
        try {
          await wakeLock?.release();
        } catch {
          /* ignore */
        }
        wakeLock = null;
        return { ok: true };
      },
    },
    getPathForFile: (file) => registerBlob(file),
  };
}
