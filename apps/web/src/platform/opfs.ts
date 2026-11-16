import {
  joinOpfs,
  normalizeOpfsPath,
  opfsParts,
  PROJECT_SUBDIRS,
} from "./paths";

async function rootDir(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

async function getDir(
  parts: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = await rootDir();
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

async function resolveParentAndName(
  filePath: string,
  createParents: boolean,
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const parts = opfsParts(normalizeOpfsPath(filePath));
  if (parts.length === 0) {
    throw new Error("Invalid OPFS path");
  }
  const name = parts[parts.length - 1]!;
  const parent = await getDir(parts.slice(0, -1), createParents);
  return { parent, name };
}

export async function ensureProjectDirs(projectPath: string): Promise<void> {
  const parts = opfsParts(normalizeOpfsPath(projectPath));
  await getDir(parts, true);
  for (const sub of PROJECT_SUBDIRS) {
    await getDir([...parts, sub], true);
  }
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    const parts = opfsParts(normalizeOpfsPath(targetPath));
    if (parts.length === 0) return true;
    const name = parts[parts.length - 1]!;
    const parent = await getDir(parts.slice(0, -1), false);
    try {
      await parent.getFileHandle(name);
      return true;
    } catch {
      try {
        await parent.getDirectoryHandle(name);
        return true;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
}

export async function readFileBytes(filePath: string): Promise<Uint8Array> {
  const { parent, name } = await resolveParentAndName(filePath, false);
  const handle = await parent.getFileHandle(name);
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

function toWritableData(
  data: Uint8Array | ArrayBuffer,
): ArrayBuffer {
  const src =
    data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(src.byteLength);
  copy.set(src);
  return copy.buffer;
}

type DirEntries = AsyncIterableIterator<
  [string, FileSystemDirectoryHandle | FileSystemFileHandle]
>;

function dirEntries(dir: FileSystemDirectoryHandle): DirEntries {
  return (
    dir as FileSystemDirectoryHandle & { entries: () => DirEntries }
  ).entries();
}

export async function writeFileBytes(
  filePath: string,
  data: Uint8Array | ArrayBuffer | string,
  encoding?: "utf8",
): Promise<string> {
  const { parent, name } = await resolveParentAndName(filePath, true);
  const handle = await parent.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    if (encoding === "utf8" || typeof data === "string") {
      await writable.write(String(data));
    } else {
      await writable.write(toWritableData(data));
    }
  } finally {
    await writable.close();
  }
  return normalizeOpfsPath(filePath);
}

export async function unlinkPath(
  filePath: string,
): Promise<{ ok: boolean; missing?: boolean }> {
  try {
    const { parent, name } = await resolveParentAndName(filePath, false);
    await parent.removeEntry(name);
    return { ok: true };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotFoundError") return { ok: true, missing: true };
    throw err;
  }
}

export async function removeDirectory(
  dirPath: string,
): Promise<{ ok: boolean; missing?: boolean }> {
  try {
    const { parent, name } = await resolveParentAndName(dirPath, false);
    await parent.removeEntry(name, { recursive: true });
    return { ok: true };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotFoundError") return { ok: true, missing: true };
    throw err;
  }
}

export async function copyFile(
  sourcePath: string,
  destPath: string,
): Promise<string> {
  const bytes = await readFileBytes(sourcePath);
  await writeFileBytes(destPath, bytes);
  return normalizeOpfsPath(destPath);
}

export async function listProjectDir(
  projectPath: string,
  relativeDir: string,
): Promise<string[]> {
  const projectParts = opfsParts(normalizeOpfsPath(projectPath));
  const rel = relativeDir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const relParts = rel ? rel.split("/").filter(Boolean) : [];
  try {
    const dir = await getDir([...projectParts, ...relParts], false);
    const out: string[] = [];
    for await (const [name, handle] of dirEntries(dir)) {
      if (handle.kind === "file") {
        out.push(rel ? `${rel}/${name}` : name);
      }
    }
    return out;
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotFoundError") return [];
    throw err;
  }
}

export async function listProjectNames(): Promise<string[]> {
  try {
    const projects = await getDir(["projects"], true);
    const names: string[] = [];
    for await (const [name, handle] of dirEntries(projects)) {
      if (handle.kind !== "directory") continue;
      try {
        await handle.getFileHandle("project.json");
        names.push(name);
      } catch {
        /* empty / incomplete */
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function projectRootPath(name: string): string {
  return joinOpfs("projects", name);
}

export async function uniqueProjectPath(safe: string): Promise<string> {
  let name = safe;
  let suffix = 2;
  while (await pathExists(joinOpfs("projects", name, "project.json"))) {
    name = `${safe} (${suffix})`;
    suffix += 1;
  }
  return projectRootPath(name);
}

export { joinOpfs, normalizeOpfsPath };
