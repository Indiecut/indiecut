import type { Clip, MediaAssetRef } from "../project/types";
import {
  findSoundEffect,
  soundEffectUrl,
  type SoundEffectEntry,
} from "../soundEffects/catalog";
import { getEditorStore } from "../store/editorStore";
import { addMediaToTimeline } from "./addToTimeline";
import { adoptProjectMediaFile } from "./importMedia";

export const SOUND_EFFECT_DRAG_MIME = "application/x-indiecut-sfx";

function requireBridge() {
  const bridge = window.indiecut;
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }
  return bridge;
}

function bundledAssetId(entry: SoundEffectEntry): string {
  // Stable id so re-adding reuses the same project media copy.
  const slug = entry.id.replace(/^sfx-/, "").replace(/[^a-z0-9]+/gi, "_");
  return `media_sfx_${slug}`.slice(0, 48);
}

function waitForAssetReady(
  assetId: string,
  timeoutMs = 30_000,
): Promise<MediaAssetRef | undefined> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const asset = getEditorStore().project.mediaIndex.find(
        (m) => m.id === assetId,
      );
      if (!asset) {
        resolve(undefined);
        return;
      }
      if (asset.importStatus === "ready" || asset.importStatus === "error") {
        resolve(asset);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(asset);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Copy a bundled SFX into the open project (once per id) and place on an audio track.
 */
export async function addSoundEffectToTimeline(
  sfxId: string,
  targetTrackId?: string,
): Promise<Clip | null> {
  const entry = findSoundEffect(sfxId);
  if (!entry) return null;

  const store = getEditorStore();
  const projectPath = store.project.projectPath;
  if (!projectPath) {
    window.alert("Open or create a project before adding sound effects.");
    return null;
  }

  const assetId = bundledAssetId(entry);
  let asset = store.project.mediaIndex.find((m) => m.id === assetId);

  if (!asset || asset.importStatus === "error") {
    const bridge = requireBridge();
    const relPath = `media/${assetId}.wav`;
    const res = await fetch(soundEffectUrl(entry.file));
    if (!res.ok) {
      throw new Error(`Failed to load sound effect (${res.status})`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    await bridge.fs.writeProjectFile(projectPath, relPath, bytes);

    const adopted = await adoptProjectMediaFile(relPath);
    store.patchMediaAsset(adopted.id, { name: entry.name });
    asset = adopted;
  }

  if (asset.importStatus === "processing") {
    asset = (await waitForAssetReady(asset.id)) ?? asset;
  }
  if (asset.importStatus !== "ready") {
    throw new Error(asset.importError || "Sound effect import failed");
  }

  return addMediaToTimeline(asset.id, targetTrackId);
}
