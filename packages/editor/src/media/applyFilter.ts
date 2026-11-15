import { staticAnimatable } from "../engine/animatable";
import { snapMs, snapThresholdMs } from "../engine/snap";
import { addClipToTrack, ensureTrackForRange } from "../engine/timelineOps";
import {
  findFilter,
  loadFilterManifest,
  type FilterManifestEntry,
} from "../filters/manifest";
import type { Clip, FilterCategory, FilterClipParams } from "../project/types";
import { findClip, getEditorStore } from "../store/editorStore";
import { getPlatform } from "@indiecut/platform";

export const FILTER_DRAG_MIME = "application/x-indiecut-filter";

function newClipId(): string {
  return `clip_${Math.random().toString(36).slice(2, 10)}`;
}

function paramsFromEntry(
  entry: FilterManifestEntry,
  overrides?: Partial<FilterClipParams>,
): FilterClipParams {
  return {
    lutId: entry.id,
    strength: overrides?.strength ?? staticAnimatable(1),
    category: entry.category,
    lutPath: overrides?.lutPath,
  };
}

/**
 * Apply a bundled filter to the selected video/image clip,
 * or place a filter-track adjustment layer when nothing suitable is selected.
 */
export async function applyOrPlaceFilter(
  lutId: string,
  targetTrackId?: string,
): Promise<Clip | null> {
  const manifest = await loadFilterManifest();
  const entry = findFilter(manifest, lutId);
  if (!entry) return null;
  return applyEntry(entry, targetTrackId);
}

export function applyCustomFilter(params: FilterClipParams): Clip | null {
  const store = getEditorStore();
  const { project, updateClip, selectedClipId } = store;
  if (selectedClipId) {
    const found = findClip(project.tracks, selectedClipId);
    if (
      found &&
      (found.clip.kind === "video" || found.clip.kind === "image")
    ) {
      updateClip(selectedClipId, {
        filter: {
          ...params,
          strength: params.strength ?? staticAnimatable(1),
        },
      });
      return { ...found.clip, filter: params };
    }
  }
  return placeFilterLayer(
    {
      id: params.lutId,
      name: params.lutId,
      file: params.lutPath ?? "",
      category: (params.category ?? "custom") as FilterCategory,
      tags: ["custom"],
    },
    undefined,
    params,
  );
}

function applyEntry(
  entry: FilterManifestEntry,
  targetTrackId?: string,
): Clip | null {
  const store = getEditorStore();
  const { project, updateClip, selectedClipId } = store;

  if (selectedClipId) {
    const found = findClip(project.tracks, selectedClipId);
    if (
      found &&
      (found.clip.kind === "video" || found.clip.kind === "image")
    ) {
      const filter = paramsFromEntry(entry);
      updateClip(selectedClipId, { filter });
      return { ...found.clip, filter };
    }
  }

  return placeFilterLayer(entry, targetTrackId);
}

function placeFilterLayer(
  entry: FilterManifestEntry,
  targetTrackId?: string,
  overrides?: Partial<FilterClipParams>,
): Clip | null {
  const store = getEditorStore();
  const { project, magnetEnabled, timelinePxPerSec, commitTracks } = store;

  let tracks = project.tracks;
  let preferredTrackId: string | undefined;

  if (targetTrackId) {
    const candidate = tracks.find((t) => t.id === targetTrackId);
    if (candidate && !candidate.locked && candidate.type === "filter") {
      preferredTrackId = candidate.id;
    }
  }

  const durationMs = 5000;
  let startMs = project.playheadMs;
  if (magnetEnabled) {
    const edges: number[] = [0, project.playheadMs];
    for (const t of tracks) {
      for (const c of t.clips) {
        edges.push(c.startMs, c.startMs + c.durationMs);
      }
    }
    startMs = snapMs(startMs, edges, snapThresholdMs(timelinePxPerSec));
  }
  startMs = Math.max(0, startMs);

  const ensured = ensureTrackForRange(tracks, "filter", startMs, durationMs, {
    preferredTrackId,
  });
  tracks = ensured.tracks;
  const track = tracks.find((t) => t.id === ensured.trackId);
  if (!track || track.locked) return null;

  const clip: Clip = {
    id: newClipId(),
    kind: "filter",
    startMs,
    durationMs,
    inMs: 0,
    outMs: durationMs,
    filter: paramsFromEntry(entry, overrides),
  };

  const next = addClipToTrack(tracks, track.id, clip);
  if (!next) return null;

  commitTracks(next, "Add filter", { clipId: clip.id, trackId: track.id });
  return clip;
}

/** Import a .cube file into the project and apply/place it. */
export async function importCubeLutFile(file: File): Promise<Clip | null> {
  const store = getEditorStore();
  const projectPath = store.project.projectPath;
  if (!projectPath) {
    throw new Error("Save or open a project before importing LUTs.");
  }
  const bridge = getPlatform();
  if (!bridge?.fs) throw new Error("Electron fs bridge unavailable");

  await bridge.fs.ensureProjectLayout(projectPath);
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const lutId = `custom_${Date.now().toString(36)}`;
  const relative = `filters/${lutId}_${safeName}`;
  const buffer = new Uint8Array(await file.arrayBuffer());
  await bridge.fs.writeProjectFile(projectPath, relative, buffer);

  return applyCustomFilter({
    lutId,
    lutPath: relative,
    strength: staticAnimatable(1),
    category: "custom",
  });
}
