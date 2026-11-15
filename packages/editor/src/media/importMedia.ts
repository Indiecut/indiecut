import { saveProjectNow } from "../project/session";
import {
  resolveMediaAbsolutePath,
  toStoredMediaPath,
} from "../project/mediaPath";
import type { MediaAssetRef } from "../project/types";
import { getEditorStore } from "../store/editorStore";
import { toArrayBuffer, toUint8Array } from "./bytes";
import { processMediaInWorker } from "./mediaWorkerClient";
import {
  extensionOf,
  fileBaseName,
  guessKindFromExt,
  peaksRelPath,
  proxyRelPath,
  thumbRelPath,
} from "./paths";
import { getPlatform } from "@indiecut/platform";

function requireBridge() {
  const bridge = getPlatform();
  if (!bridge) {
    throw new Error("IndieCut platform bridge unavailable");
  }
  return bridge;
}

function newAssetId(): string {
  return `media_${Math.random().toString(36).slice(2, 10)}`;
}

async function flushProject(): Promise<void> {
  try {
    await saveProjectNow();
  } catch (err) {
    console.error("Failed to persist project after media change", err);
  }
}

export type ImportProgress = {
  assetId: string;
  progress: number;
  stage: string;
};

async function processAndAttachDerivatives(args: {
  assetId: string;
  name: string;
  storedPath: string;
  projectPath: string;
  onProgress?: (info: ImportProgress) => void;
}): Promise<MediaAssetRef> {
  const { assetId, name, storedPath, projectPath, onProgress } = args;
  const bridge = requireBridge();
  const { patchMediaAsset } = getEditorStore();

  try {
    const absSource = resolveMediaAbsolutePath({
      projectPath,
      storedPath,
    });
    const bytes = toUint8Array(await bridge.fs.readFile(absSource));
    const buffer = toArrayBuffer(bytes);

    const result = await processMediaInWorker({
      assetId,
      fileName: name,
      buffer,
      onProgress: (progress, stage) => {
        onProgress?.({ assetId, progress, stage });
      },
    });

    const patch: Partial<MediaAssetRef> = {
      kind: result.meta.kind,
      durationMs: result.meta.durationMs,
      width: result.meta.width,
      height: result.meta.height,
      codec: result.meta.codec,
      hasAudio: result.meta.hasAudio,
      importStatus: "ready",
      importError: undefined,
    };

    // GIF→MP4 (and similar): replace stored source with the converted master.
    if (result.masterMp4) {
      const masterRel = `media/${assetId}.mp4`;
      const masterBytes = new Uint8Array(result.masterMp4);
      await bridge.fs.writeProjectFile(projectPath, masterRel, masterBytes);
      patch.path = masterRel;

      // Only delete a project-local copy (never the user's keep_original path).
      const normalizedPrev = storedPath.replace(/\\/g, "/");
      if (
        normalizedPrev !== masterRel &&
        normalizedPrev.startsWith("media/")
      ) {
        try {
          await bridge.fs.unlink(
            resolveMediaAbsolutePath({ projectPath, storedPath }),
          );
        } catch {
          /* best-effort cleanup of copied .gif */
        }
      }

      // Same encode doubles as the preview proxy (already size-capped).
      if (!result.proxyMp4) {
        const rel = proxyRelPath(assetId);
        await bridge.fs.writeProjectFile(projectPath, rel, masterBytes);
        patch.proxyPath = rel;
      }
    }

    if (result.thumbJpeg) {
      const rel = thumbRelPath(assetId);
      await bridge.fs.writeProjectFile(
        projectPath,
        rel,
        new Uint8Array(result.thumbJpeg),
      );
      patch.thumbPath = rel;
    }

    if (result.peaks) {
      const rel = peaksRelPath(assetId);
      await bridge.fs.writeProjectFile(
        projectPath,
        rel,
        JSON.stringify(result.peaks, null, 2),
        "utf8",
      );
      patch.peaksPath = rel;
    }

    if (result.proxyMp4) {
      const rel = proxyRelPath(assetId);
      await bridge.fs.writeProjectFile(
        projectPath,
        rel,
        new Uint8Array(result.proxyMp4),
      );
      patch.proxyPath = rel;
    }

    patchMediaAsset(assetId, patch);
    await flushProject();

    const current = getEditorStore().project.mediaIndex.find(
      (m) => m.id === assetId,
    );
    return (
      current ??
      ({
        id: assetId,
        name,
        path: patch.path ?? storedPath,
        ...patch,
      } as MediaAssetRef)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchMediaAsset(assetId, {
      importStatus: "error",
      importError: message,
    });
    await flushProject();
    throw err;
  }
}

/**
 * Import one absolute file path into the open project.
 * Honors importMaterialMode; writes derivatives under the project folder.
 */
export async function importMediaFile(
  sourcePath: string,
  onProgress?: (info: ImportProgress) => void,
): Promise<MediaAssetRef> {
  const bridge = requireBridge();
  const store = getEditorStore();
  const { project, upsertMediaAsset } = store;
  const projectPath = project.projectPath;
  if (!projectPath) {
    throw new Error("Save or open a project before importing media");
  }

  const assetId = newAssetId();
  const name = fileBaseName(sourcePath);
  const storedPath = toStoredMediaPath({
    mode: project.importMaterialMode,
    projectPath,
    sourcePath,
    assetId,
  });

  if (project.importMaterialMode === "copy_to_project") {
    const destAbs = resolveMediaAbsolutePath({
      projectPath,
      storedPath,
    });
    await bridge.fs.copyFile(sourcePath, destAbs);
  }

  const pending: MediaAssetRef = {
    id: assetId,
    kind: guessKindFromExt(sourcePath) ?? "video",
    name,
    path: storedPath,
    durationMs: 0,
    importStatus: "processing",
  };
  upsertMediaAsset(pending);
  // Persist immediately so a reload can't orphan the copied file.
  await flushProject();

  return processAndAttachDerivatives({
    assetId,
    name,
    storedPath,
    projectPath,
    onProgress,
  });
}

/**
 * Register a file already under project/media/ (orphan recovery).
 * Does not copy; reuses the existing relative path and asset id from the filename when possible.
 */
export async function adoptProjectMediaFile(
  storedPath: string,
  onProgress?: (info: ImportProgress) => void,
): Promise<MediaAssetRef> {
  const store = getEditorStore();
  const { project, upsertMediaAsset } = store;
  const projectPath = project.projectPath;
  if (!projectPath) {
    throw new Error("No project open");
  }

  const name = fileBaseName(storedPath);
  const ext = extensionOf(storedPath);
  const base = name.slice(0, name.length - ext.length);
  const assetId = base.startsWith("media_") ? base : newAssetId();

  const pending: MediaAssetRef = {
    id: assetId,
    kind: guessKindFromExt(storedPath) ?? "video",
    name,
    path: storedPath.replace(/\\/g, "/"),
    durationMs: 0,
    importStatus: "processing",
  };
  upsertMediaAsset(pending);
  await flushProject();

  return processAndAttachDerivatives({
    assetId,
    name,
    storedPath: pending.path,
    projectPath,
    onProgress,
  });
}

function needsReprocess(asset: MediaAssetRef): boolean {
  if (asset.importStatus === "error" || asset.importStatus === "processing") {
    return true;
  }
  // Older imports treated GIF as a still — re-run to convert → video MP4.
  if (
    asset.kind === "image" &&
    asset.path.replace(/\\/g, "/").toLowerCase().endsWith(".gif")
  ) {
    return true;
  }
  if (asset.kind === "video" && !asset.proxyPath) return true;
  if (asset.kind === "video" && !asset.thumbPath) return true;
  if (asset.kind === "image" && !asset.thumbPath) return true;
  if (
    (asset.kind === "audio" || asset.hasAudio) &&
    !asset.peaksPath &&
    asset.importStatus !== "ready"
  ) {
    return true;
  }
  return false;
}

/** Re-run worker pipeline for an existing mediaIndex entry (no re-copy). */
export async function reprocessMediaAsset(
  asset: MediaAssetRef,
  onProgress?: (info: ImportProgress) => void,
): Promise<MediaAssetRef> {
  const { project, patchMediaAsset } = getEditorStore();
  if (!project.projectPath) {
    throw new Error("No project open");
  }

  patchMediaAsset(asset.id, {
    importStatus: "processing",
    importError: undefined,
  });
  await flushProject();

  return processAndAttachDerivatives({
    assetId: asset.id,
    name: asset.name,
    storedPath: asset.path,
    projectPath: project.projectPath,
    onProgress,
  });
}

/**
 * Find files in media/ that are missing from mediaIndex and adopt them.
 * Also retry assets stuck in error/processing or missing derivatives.
 */
export async function reconcileOrphanMedia(
  onProgress?: (info: ImportProgress) => void,
): Promise<MediaAssetRef[]> {
  const bridge = requireBridge();
  const { project } = getEditorStore();
  if (!project.projectPath) return [];

  const results: MediaAssetRef[] = [];

  const listed = await bridge.fs.listProjectDir(project.projectPath, "media");
  const known = new Set(
    project.mediaIndex.map((m) => m.path.replace(/\\/g, "/")),
  );

  const orphans = listed.filter((rel) => {
    const normalized = rel.replace(/\\/g, "/");
    if (normalized.endsWith(".DS_Store")) return false;
    return !known.has(normalized);
  });

  for (const rel of orphans) {
    try {
      results.push(await adoptProjectMediaFile(rel, onProgress));
    } catch (err) {
      console.error("Failed to adopt orphan media", rel, err);
    }
  }

  const stale = getEditorStore().project.mediaIndex.filter(needsReprocess);
  for (const asset of stale) {
    try {
      results.push(await reprocessMediaAsset(asset, onProgress));
    } catch (err) {
      console.error("Failed to reprocess media", asset.id, err);
    }
  }

  return results;
}

/** Open the system file picker and import selected media files. */
export async function importMediaViaDialog(
  onProgress?: (info: ImportProgress) => void,
): Promise<MediaAssetRef[]> {
  const bridge = requireBridge();
  const paths = await bridge.dialog.pickMediaFiles();
  if (!paths.length) return [];

  const results: MediaAssetRef[] = [];
  for (const p of paths) {
    try {
      results.push(await importMediaFile(p, onProgress));
    } catch (err) {
      console.error("Import failed:", p, err);
    }
  }
  return results;
}

/** Import files dropped from the OS (Electron File.path via getPathForFile). */
export async function importDroppedFiles(
  files: FileList | File[],
  onProgress?: (info: ImportProgress) => void,
): Promise<MediaAssetRef[]> {
  const bridge = requireBridge();
  const list = Array.from(files);
  const results: MediaAssetRef[] = [];

  for (const file of list) {
    let sourcePath: string | null = null;
    try {
      sourcePath = bridge.getPathForFile(file);
    } catch {
      sourcePath = null;
    }
    if (!sourcePath) {
      console.warn("Could not resolve path for dropped file", file.name);
      continue;
    }
    try {
      results.push(await importMediaFile(sourcePath, onProgress));
    } catch (err) {
      console.error("Import failed:", sourcePath, err);
    }
  }
  return results;
}
