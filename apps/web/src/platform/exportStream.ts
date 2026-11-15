import {
  normalizeOpfsPath,
  pathExists,
  readFileBytes,
  unlinkPath,
  writeFileBytes,
} from "./opfs";
import { safeName } from "./paths";

type Session = {
  chunks: Map<number, Uint8Array>;
  tmpPath: string;
  finalPath: string;
  bytesWritten: number;
  maxEnd: number;
};

const sessions = new Map<string, Session>();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function downloadBytes(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([toArrayBuffer(bytes)], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

async function assemble(session: Session): Promise<Uint8Array> {
  const size = Math.max(session.maxEnd, session.bytesWritten);
  const out = new Uint8Array(size);
  for (const [pos, chunk] of session.chunks) {
    out.set(chunk, pos);
  }
  return out;
}

export async function exportStreamOpen(opts: {
  folder: string;
  title: string;
  overwrite?: boolean;
  extension?: string;
}): Promise<{ streamId: string; tmpPath: string; finalPath: string }> {
  const folder = normalizeOpfsPath(opts.folder);
  const title = safeName(opts.title);
  const extension =
    String(opts.extension || "mp4")
      .replace(/^\./, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || "mp4";

  let finalPath = normalizeOpfsPath(`${folder}/${title}.${extension}`);

  if (!opts.overwrite) {
    let n = 1;
    while (await pathExists(finalPath)) {
      n += 1;
      finalPath = normalizeOpfsPath(`${folder}/${title} (${n}).${extension}`);
    }
  }

  const tmpPath = `${finalPath}.${Date.now()}.partial`;
  const streamId = crypto.randomUUID();
  sessions.set(streamId, {
    chunks: new Map(),
    tmpPath,
    finalPath,
    bytesWritten: 0,
    maxEnd: 0,
  });
  return { streamId, tmpPath, finalPath };
}

export async function exportStreamWrite(
  streamId: string,
  position: number,
  data: Uint8Array,
): Promise<{ written: number }> {
  const session = sessions.get(streamId);
  if (!session) throw new Error("Unknown export stream");
  const pos = Number(position);
  if (!Number.isFinite(pos) || pos < 0) {
    throw new Error("Invalid export stream write position");
  }
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  session.chunks.set(pos, copy);
  const end = pos + copy.byteLength;
  session.maxEnd = Math.max(session.maxEnd, end);
  session.bytesWritten = Math.max(session.bytesWritten, end);
  return { written: copy.byteLength };
}

/**
 * Finalize a stream into OPFS only.
 * Intermediate segment closes must NOT prompt the user — download happens
 * once via shell.downloadPath for the finished export.
 */
export async function exportStreamClose(
  streamId: string,
  options?: { abort?: boolean },
): Promise<{
  ok: boolean;
  aborted?: boolean;
  finalPath?: string;
  bytesWritten?: number;
  error?: string;
}> {
  const session = sessions.get(streamId);
  if (!session) {
    return { ok: false, error: "Unknown export stream" };
  }
  sessions.delete(streamId);
  const abort = Boolean(options?.abort);
  if (abort) {
    try {
      await unlinkPath(session.tmpPath);
    } catch {
      /* ignore */
    }
    return { ok: true, aborted: true, bytesWritten: session.bytesWritten };
  }

  const bytes = await assemble(session);
  await writeFileBytes(session.finalPath, bytes);

  return {
    ok: true,
    aborted: false,
    finalPath: session.finalPath,
    bytesWritten: session.bytesWritten,
  };
}

/** Save/download a finished OPFS file once (save picker when available). */
export async function downloadOrSavePath(targetPath: string): Promise<boolean> {
  const bytes = await readFileBytes(targetPath);
  const filename = targetPath.split("/").pop() || "export.mp4";
  try {
    if ("showSaveFilePicker" in window) {
      const handle = await (
        window as unknown as {
          showSaveFilePicker: (opts: {
            suggestedName: string;
          }) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(toArrayBuffer(bytes));
      await writable.close();
      return true;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return false;
    }
  }
  downloadBytes(filename, bytes);
  return true;
}
