import { getPlatform } from "@indiecut/platform";
import { toUint8Array } from "../../media/bytes";
import { adoptProjectMediaFile } from "../../media/importMedia";
import {
  AI_IMAGE_DURATION_MS,
  placeImageOnTracks,
  type PlaceImageOnTracksResult,
} from "../../media/placeImageOnTracks";
import type { Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import type { GeminiImageMime } from "../providers/gemini";

function newAssetId(): string {
  return `media_${Math.random().toString(36).slice(2, 10)}`;
}

function extForMime(mime: GeminiImageMime): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

export type ImportGeneratedImageOpts = {
  bytes: ArrayBuffer;
  mimeType: GeminiImageMime;
  name: string;
  tracks: Track[];
  startMs?: number;
  durationMs?: number;
  exactStart?: boolean;
  preferOverlay?: boolean;
  targetTrackId?: string;
};

export type ImportGeneratedImageResult = {
  assetId: string;
  placed: PlaceImageOnTracksResult;
  /** Full-size bytes for Action Card thumb downscale. */
  bytes: Uint8Array;
  mimeType: GeminiImageMime;
};

/**
 * Write still bytes into project media, adopt into mediaIndex, place on tracks
 * without committing (MutationBatch-friendly).
 */
export async function importGeneratedImageOntoTracks(
  opts: ImportGeneratedImageOpts,
): Promise<ImportGeneratedImageResult> {
  const bridge = getPlatform();
  if (!bridge?.fs?.writeProjectFile) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }
  const store = getEditorStore();
  const projectPath = store.project.projectPath;
  if (!projectPath) {
    throw new Error("Save or open a project before importing AI images");
  }

  const assetId = newAssetId();
  const ext = extForMime(opts.mimeType);
  const relPath = `media/${assetId}.${ext}`;
  const bytes = toUint8Array(opts.bytes);
  await bridge.fs.writeProjectFile(projectPath, relPath, bytes);

  const adopted = await adoptProjectMediaFile(relPath);
  const durationMs = Math.max(
    1,
    Math.round(opts.durationMs ?? AI_IMAGE_DURATION_MS),
  );
  store.patchMediaAsset(adopted.id, {
    name: opts.name,
    durationMs: Math.max(adopted.durationMs || 0, durationMs),
    kind: "image",
  });

  const placed = placeImageOnTracks({
    tracks: opts.tracks,
    assetId: adopted.id,
    targetTrackId: opts.targetTrackId,
    preferOverlay: opts.preferOverlay,
    startMs: opts.startMs,
    durationMs,
    exactStart: opts.exactStart,
    playheadMs: store.project.playheadMs,
    magnetEnabled: store.magnetEnabled,
    pxPerSec: store.timelinePxPerSec,
  });
  if (!placed) {
    throw new Error("Could not place image on timeline (track locked?)");
  }

  return {
    assetId: adopted.id,
    placed,
    bytes,
    mimeType: opts.mimeType,
  };
}
