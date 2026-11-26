import type {
  AspectRatio,
  ColorSpace,
  ResolutionMode,
  Track,
} from "../../project/types";
import { getEditorStore } from "../../store/editorStore";

/** Project header fields AI may mutate (Action Card Restore scope). */
export type ProjectHeaderSnapshot = {
  title: string;
  fps: number;
  width: number;
  height: number;
  resolutionMode: ResolutionMode;
  aspectRatio: AspectRatio;
  colorSpace: ColorSpace;
  playheadMs: number;
};

export type ProjectEditSnapshot = {
  tracks: Track[];
  project: ProjectHeaderSnapshot;
  /** Media ids imported during this AI turn (Restore drops orphans). */
  importedMediaIds: string[];
};

export type MutationBatch = {
  before: ProjectEditSnapshot;
  tracks: Track[];
  /** Accumulated project header patches (applied on commit). */
  projectPatch: Partial<ProjectHeaderSnapshot>;
  /** Session selection clip ids to apply on commit (undefined = leave alone). */
  selectionClipIds?: string[] | null;
  importedMediaIds: string[];
  labels: string[];
  dirty: boolean;
  /** Optional generative result thumb for Action Card. */
  resultThumb?: {
    bytes: Uint8Array;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    detail?: string;
  };
};

export function snapshotProjectHeader(): ProjectHeaderSnapshot {
  const { project } = getEditorStore();
  return {
    title: project.title,
    fps: project.fps,
    width: project.width,
    height: project.height,
    resolutionMode: project.resolutionMode,
    aspectRatio: project.aspectRatio,
    colorSpace: project.colorSpace,
    playheadMs: project.playheadMs,
  };
}

export function createMutationBatch(): MutationBatch {
  const beforeTracks = structuredClone(getEditorStore().project.tracks);
  return {
    before: {
      tracks: beforeTracks,
      project: snapshotProjectHeader(),
      importedMediaIds: [],
    },
    tracks: structuredClone(beforeTracks),
    projectPatch: {},
    importedMediaIds: [],
    labels: [],
    dirty: false,
  };
}

export function markBatchDirty(batch: MutationBatch, label: string): void {
  batch.labels.push(label);
  batch.dirty = true;
}

/** Commit a dirty mutation batch as one undoable history entry (+ project/session). */
export function commitMutationBatch(batch: MutationBatch): void {
  if (!batch.dirty) return;
  const store = getEditorStore();
  const label =
    batch.labels.length === 1
      ? `AI: ${batch.labels[0]}`
      : `AI: ${batch.labels.length} edits`;

  const tracksChanged =
    JSON.stringify(batch.tracks) !== JSON.stringify(batch.before.tracks);
  const alreadyLive =
    JSON.stringify(batch.tracks) === JSON.stringify(store.project.tracks);
  // Skills like captions.auto may have already committed — skip duplicate history.
  if (tracksChanged && !alreadyLive) {
    store.commitTracks(batch.tracks, label);
  }

  const patch = batch.projectPatch;
  const headerKeys = Object.keys(patch) as Array<keyof ProjectHeaderSnapshot>;
  if (headerKeys.length > 0) {
    const { playheadMs, ...rest } = patch;
    if (Object.keys(rest).length > 0) {
      store.patchProject(rest);
    }
    if (typeof playheadMs === "number" && Number.isFinite(playheadMs)) {
      store.setPlayheadMs(playheadMs);
    }
  }

  if (batch.selectionClipIds !== undefined) {
    const ids = batch.selectionClipIds;
    if (!ids || ids.length === 0) {
      store.clearSelection();
    } else {
      store.setSelectedClipIds(ids);
    }
  }
}

export function afterSnapshotFromBatch(
  batch: MutationBatch,
): ProjectEditSnapshot {
  const live = snapshotProjectHeader();
  return {
    tracks: structuredClone(getEditorStore().project.tracks),
    project: {
      ...live,
      ...batch.projectPatch,
      playheadMs:
        typeof batch.projectPatch.playheadMs === "number"
          ? batch.projectPatch.playheadMs
          : live.playheadMs,
    },
    importedMediaIds: [...batch.importedMediaIds],
  };
}
