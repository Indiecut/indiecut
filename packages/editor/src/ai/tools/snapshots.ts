import { getPlatform } from "@indiecut/platform";
import type { Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import type {
  ProjectEditSnapshot,
  ProjectHeaderSnapshot,
} from "./mutationBatch";
import { snapshotProjectHeader } from "./mutationBatch";

export const MAX_CHECKPOINTS = 20;

/** @deprecated Use ProjectCheckpointV2 */
export type TrackCheckpointV1 = {
  version: 1;
  id: string;
  createdAt: string;
  summary: string;
  before: { tracks: Track[] };
  after: { tracks: Track[] };
};

export type ProjectCheckpointV2 = {
  version: 2;
  id: string;
  createdAt: string;
  summary: string;
  before: ProjectEditSnapshot;
  after: ProjectEditSnapshot;
};

export type AiCheckpoint = ProjectCheckpointV2 | TrackCheckpointV1;

function checkpointRelPath(id: string): string {
  return `ai/checkpoints/${id}.json`;
}

function checkpointAbsPath(projectPath: string, id: string): string {
  const root = projectPath.replace(/[/\\]+$/, "");
  const sep = projectPath.includes("\\") ? "\\" : "/";
  return `${root}${sep}ai${sep}checkpoints${sep}${id}.json`;
}

export function createCheckpointId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function writeCheckpoint(
  projectPath: string,
  doc: ProjectCheckpointV2 | TrackCheckpointV1,
): Promise<void> {
  const bridge = getPlatform();
  if (!bridge?.fs?.writeProjectFile) return;
  await bridge.fs.ensureProjectLayout(projectPath);
  await bridge.fs.writeProjectFile(
    projectPath,
    checkpointRelPath(doc.id),
    JSON.stringify(doc),
    "utf8",
  );
}

function normalizeCheckpoint(parsed: AiCheckpoint): ProjectCheckpointV2 | null {
  if (!parsed || !parsed.id) return null;
  if (parsed.version === 2) {
    if (!parsed.before?.tracks || !parsed.after?.tracks) return null;
    return parsed;
  }
  if (parsed.version === 1) {
    if (!parsed.before?.tracks || !parsed.after?.tracks) return null;
    const emptyProject = snapshotProjectHeader();
    return {
      version: 2,
      id: parsed.id,
      createdAt: parsed.createdAt,
      summary: parsed.summary,
      before: {
        tracks: parsed.before.tracks,
        project: emptyProject,
        importedMediaIds: [],
      },
      after: {
        tracks: parsed.after.tracks,
        project: emptyProject,
        importedMediaIds: [],
      },
    };
  }
  return null;
}

export async function loadCheckpoint(
  projectPath: string,
  id: string,
): Promise<ProjectCheckpointV2 | null> {
  const bridge = getPlatform();
  if (!bridge?.fs) return null;
  const path = checkpointAbsPath(projectPath, id);
  try {
    const exists = await bridge.fs.pathExists(path);
    if (!exists) return null;
    const bytes = await bridge.fs.readFile(path);
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text) as AiCheckpoint;
    const normalized = normalizeCheckpoint(parsed);
    if (!normalized || normalized.id !== id) return null;
    return normalized;
  } catch {
    return null;
  }
}

export async function deleteCheckpoint(
  projectPath: string,
  id: string,
): Promise<void> {
  const bridge = getPlatform();
  if (!bridge?.fs?.unlink) return;
  const path = checkpointAbsPath(projectPath, id);
  try {
    await bridge.fs.unlink(path);
  } catch {
    /* ignore */
  }
}

export async function listCheckpointIds(projectPath: string): Promise<string[]> {
  const bridge = getPlatform();
  if (!bridge?.fs?.listProjectDir) return [];
  try {
    const names = await bridge.fs.listProjectDir(projectPath, "ai/checkpoints");
    return names
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.replace(/\.json$/i, ""));
  } catch {
    return [];
  }
}

export async function pruneCheckpoints(
  projectPath: string,
  keepIds: string[],
): Promise<void> {
  const existing = await listCheckpointIds(projectPath);
  if (existing.length <= MAX_CHECKPOINTS) return;

  const keep = new Set(keepIds.slice(0, MAX_CHECKPOINTS));
  const removable = existing.filter((id) => !keep.has(id));
  let over = existing.length - MAX_CHECKPOINTS;
  for (const id of removable) {
    if (over <= 0) break;
    await deleteCheckpoint(projectPath, id);
    over -= 1;
  }
  if (over > 0) {
    const ordered = keepIds.slice().reverse();
    for (const id of ordered) {
      if (over <= 0) break;
      if (!existing.includes(id)) continue;
      await deleteCheckpoint(projectPath, id);
      over -= 1;
    }
  }
}

export function tracksEqual(a: Track[], b: Track[]): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function projectHeadersEqual(
  a: ProjectHeaderSnapshot,
  b: ProjectHeaderSnapshot,
): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Restore tracks from a checkpoint side into the editor with one history entry. */
export function restoreTracksFromSnapshot(
  tracks: Track[],
  label: string,
): void {
  getEditorStore().commitTracks(structuredClone(tracks), label);
}

/** Restore full ProjectEditSnapshot (tracks + header + drop imported media). */
export function restoreProjectEditSnapshot(
  snap: ProjectEditSnapshot,
  label: string,
): void {
  const store = getEditorStore();
  store.commitTracks(structuredClone(snap.tracks), label);
  const { playheadMs, ...rest } = snap.project;
  store.patchProject(rest);
  store.setPlayheadMs(playheadMs);
  for (const mediaId of snap.importedMediaIds ?? []) {
    // Only drop if not referenced by restored tracks.
    const stillUsed = snap.tracks.some((t) =>
      t.clips.some((c) => c.mediaId === mediaId),
    );
    if (!stillUsed) {
      store.removeMediaAsset(mediaId);
    }
  }
}
