import { getPlatform } from "@indiecut/platform";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import { saveProjectNow } from "../project/session";
import type { MediaAssetRef } from "../project/types";
import { getEditorStore } from "../store/editorStore";

function isProjectLocalPath(storedPath: string): boolean {
  const n = storedPath.replace(/\\/g, "/");
  return (
    n.startsWith("media/") ||
    n.startsWith("thumbs/") ||
    n.startsWith("proxies/") ||
    n.startsWith("peaks/")
  );
}

async function unlinkQuiet(absPath: string): Promise<void> {
  try {
    await getPlatform()?.fs?.unlink?.(absPath);
  } catch {
    /* best-effort */
  }
}

async function unlinkAssetFiles(
  projectPath: string,
  asset: MediaAssetRef,
): Promise<void> {
  const rels = [
    asset.path,
    asset.thumbPath,
    asset.proxyPath,
    asset.peaksPath,
  ].filter((p): p is string => !!p && isProjectLocalPath(p));

  await Promise.all(
    rels.map((storedPath) =>
      unlinkQuiet(resolveMediaAbsolutePath({ projectPath, storedPath })),
    ),
  );
}

/** Confirm + remove media from the bin, timeline clips, and project-local files. */
export async function deleteMediaAsset(assetId: string): Promise<boolean> {
  const store = getEditorStore();
  const asset = store.project.mediaIndex.find((m) => m.id === assetId);
  if (!asset) return false;

  let used = 0;
  for (const track of store.project.tracks) {
    for (const clip of track.clips) {
      if (clip.mediaId === assetId) used += 1;
    }
  }

  const message =
    used > 0
      ? `“${asset.name}” is used by ${used} clip${used === 1 ? "" : "s"} on the timeline. Delete it and remove those clips?`
      : `Delete “${asset.name}” from this project?`;
  if (!window.confirm(message)) return false;

  const projectPath = store.project.projectPath;
  const removed = store.removeMediaAsset(assetId);
  if (!removed) return false;

  if (projectPath) {
    await unlinkAssetFiles(projectPath, asset);
    try {
      await saveProjectNow();
    } catch (err) {
      console.error("Failed to persist project after media delete", err);
    }
  }

  return true;
}
