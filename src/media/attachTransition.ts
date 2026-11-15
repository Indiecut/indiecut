import {
  applyTransition,
  DEFAULT_TRANSITION_DURATION_MS,
  resolveTransitionTarget,
} from "../engine/editPoints";
import {
  findTransition,
  loadTransitionManifest,
} from "../transitions/manifest";
import type { Clip, TransitionParams } from "../project/types";
import { findClip, getEditorStore } from "../store/editorStore";

export const TRANSITION_DRAG_MIME = "application/x-indiecut-transition";

export type AttachTransitionPresetOptions = {
  /** Lane the preset was dropped onto (validates video-only). */
  dropTrackId?: string | null;
  /** When false, errors are returned instead of alerting. Default true. */
  alertOnError?: boolean;
  /**
   * Library “+” / double-click: ignore clip selection and attach at the next
   * continuous join at or after the playhead.
   */
  preferPlayhead?: boolean;
};

/**
 * Attach a transition preset at the next continuous video edit point at or
 * after the playhead, or between the selected video clip and its neighbor.
 * Transitions are never separate tracks — they overlay the cut on the video lane.
 */
export async function attachTransitionPreset(
  presetId: string,
  options: AttachTransitionPresetOptions = {},
): Promise<Clip | null> {
  const manifest = await loadTransitionManifest();
  const entry = findTransition(manifest, presetId);
  if (!entry) return null;

  const store = getEditorStore();
  const {
    project,
    selectedClipId,
    selectedTransitionId,
    commitTracks,
    selectTransition,
  } = store;

  const params: TransitionParams = {
    presetId: entry.id,
    durationMs: entry.defaultDurationMs || DEFAULT_TRANSITION_DURATION_MS,
    category: entry.category,
    direction: entry.direction,
    intensity: 1,
  };

  const target = resolveTransitionTarget(project.tracks, {
    playheadMs: project.playheadMs,
    // Library apply uses the upcoming join; otherwise prefer selection / replace.
    selectedClipId: options.preferPlayhead
      ? null
      : (selectedClipId ?? selectedTransitionId),
    dropTrackId: options.dropTrackId,
  });

  if (!target.ok) {
    if (options.alertOnError !== false) {
      window.alert(target.message);
    }
    return null;
  }

  const applied = applyTransition(project.tracks, target.incomingId, params);
  if (!applied.ok) {
    if (options.alertOnError !== false) {
      window.alert(applied.message);
    }
    return null;
  }

  const found = findClip(applied.tracks, applied.incomingId);
  commitTracks(applied.tracks, "Add transition", {
    clipId: null,
    trackId: found?.track.id,
  });
  if (found) {
    selectTransition(applied.incomingId, found.track.id);
  }
  return found?.clip ?? null;
}
