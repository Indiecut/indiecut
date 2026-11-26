import { getPlatform } from "@indiecut/platform";
import { toUint8Array } from "../../media/bytes";
import { adoptProjectMediaFile } from "../../media/importMedia";
import {
  placeAudioOnTracks,
  type PlaceAudioOnTracksResult,
} from "../../media/placeAudioOnTracks";
import type { MediaAssetRef, Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import type { ElevenLabsAudioMime } from "../providers/elevenlabs";

function newAssetId(): string {
  return `media_${Math.random().toString(36).slice(2, 10)}`;
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

export type ImportGeneratedAudioOpts = {
  bytes: ArrayBuffer;
  mimeType: ElevenLabsAudioMime;
  name: string;
  tracks: Track[];
  startMs?: number;
  exactStart?: boolean;
  targetTrackId?: string;
};

export type ImportGeneratedAudioResult = {
  assetId: string;
  placed: PlaceAudioOnTracksResult;
};

/**
 * Write TTS bytes into project media, adopt into mediaIndex, place on tracks
 * without committing (MutationBatch-friendly).
 */
export async function importGeneratedAudioOntoTracks(
  opts: ImportGeneratedAudioOpts,
): Promise<ImportGeneratedAudioResult> {
  const bridge = getPlatform();
  if (!bridge?.fs?.writeProjectFile) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }
  const store = getEditorStore();
  const projectPath = store.project.projectPath;
  if (!projectPath) {
    throw new Error("Save or open a project before importing AI audio");
  }

  if (opts.mimeType !== "audio/mpeg") {
    throw new Error(`Unsupported AI audio mime: ${opts.mimeType}`);
  }

  const assetId = newAssetId();
  const relPath = `media/${assetId}.mp3`;
  const bytes = toUint8Array(opts.bytes);
  await bridge.fs.writeProjectFile(projectPath, relPath, bytes);

  let adopted = await adoptProjectMediaFile(relPath);
  store.patchMediaAsset(adopted.id, {
    name: opts.name,
    kind: "audio",
  });

  if (adopted.importStatus === "processing") {
    adopted = (await waitForAssetReady(adopted.id)) ?? adopted;
  }
  if (adopted.importStatus === "error") {
    throw new Error(adopted.importError || "Audio import failed");
  }
  if (adopted.importStatus !== "ready") {
    throw new Error("Audio import timed out");
  }

  const durationMs = Math.max(adopted.durationMs, 200);
  const placed = placeAudioOnTracks({
    tracks: opts.tracks,
    assetId: adopted.id,
    targetTrackId: opts.targetTrackId,
    startMs: opts.startMs,
    durationMs,
    exactStart: opts.exactStart,
    playheadMs: store.project.playheadMs,
    magnetEnabled: store.magnetEnabled,
    pxPerSec: store.timelinePxPerSec,
  });
  if (!placed) {
    throw new Error("Could not place audio on timeline (track locked?)");
  }

  return {
    assetId: adopted.id,
    placed,
  };
}
