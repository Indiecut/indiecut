import {
  canFreezeFrameAt,
  moveClip,
  nextCutMs,
  pasteClips,
  prevCutMs,
  rippleDelete,
  rippleDeleteMany,
  rippleTrimLeft,
  rippleTrimRight,
  shouldCloseGap,
  splitAllAtPlayhead,
  splitClipAt,
  clipUnderPlayhead,
  detachAudio,
  findClipInTracks,
} from "../engine/timelineOps";
import { timelineDurationMs } from "../engine/time";
import { freezeFrameAtPlayhead } from "../media/freezeFrame";
import {
  frameDurationMs,
  getEditorStore,
  TIMELINE_PX_PER_SEC_MAX,
  TIMELINE_PX_PER_SEC_MIN,
  type ClipboardEntry,
} from "../store/editorStore";

function minFrameMs(): number {
  return frameDurationMs(getEditorStore().project.fps);
}

export function cmdTogglePlay(): void {
  getEditorStore().togglePlaying();
}

export function cmdSplit(): void {
  const store = getEditorStore();
  const { project, selectedClipId, commitTracks, selectClip } = store;
  const minDur = minFrameMs();

  let clipId = selectedClipId;
  if (!clipId) {
    const hit = clipUnderPlayhead(project.tracks, project.playheadMs);
    clipId = hit?.clip.id ?? null;
  }
  if (!clipId) return;

  const result = splitClipAt({
    tracks: project.tracks,
    clipId,
    globalMs: project.playheadMs,
    minDurationMs: minDur,
  });
  if (!result) return;
  commitTracks(result.tracks, "Split", {
    clipId: result.rightClipId,
  });
  selectClip(result.rightClipId);
}

export function cmdSplitAll(): void {
  const store = getEditorStore();
  const result = splitAllAtPlayhead({
    tracks: store.project.tracks,
    playheadMs: store.project.playheadMs,
    minDurationMs: minFrameMs(),
  });
  if (!result) return;
  store.commitTracks(result.tracks, "Split all", {
    clipId: result.selectedClipId,
  });
  if (result.selectedClipId) store.selectClip(result.selectedClipId);
}

/** True when freeze can run on the selected (or under-playhead) video clip. */
export function canCmdFreezeFrame(): boolean {
  const store = getEditorStore();
  const { project, selectedClipId } = store;
  let clipId = selectedClipId;
  if (!clipId) {
    const hit = clipUnderPlayhead(project.tracks, project.playheadMs);
    clipId = hit?.clip.id ?? null;
  }
  if (!clipId) return false;
  return canFreezeFrameAt({
    tracks: project.tracks,
    clipId,
    globalMs: project.playheadMs,
    minDurationMs: minFrameMs(),
  });
}

/**
 * Split the video at the playhead and insert a captured still between the halves.
 * Async — capture + adopt run before the single "Freeze frame" undo commit.
 */
export async function cmdFreezeFrame(
  preferredClipId?: string | null,
): Promise<void> {
  await freezeFrameAtPlayhead(preferredClipId);
}

export function cmdRippleTrimLeft(): void {
  const store = getEditorStore();
  const { project, selectedClipId, mainTrackMagnetEnabled, commitTracks } =
    store;
  const hit = clipUnderPlayhead(
    project.tracks,
    project.playheadMs,
    selectedClipId,
  );
  const next = rippleTrimLeft({
    tracks: project.tracks,
    playheadMs: project.playheadMs,
    clipId: selectedClipId,
    minDurationMs: minFrameMs(),
    mainTrackMagnetEnabled,
  });
  if (!next || next === project.tracks) return;
  const closed =
    hit != null && shouldCloseGap(hit.track, mainTrackMagnetEnabled);
  commitTracks(next, closed ? "Ripple trim left" : "Trim left");
}

export function cmdRippleTrimRight(): void {
  const store = getEditorStore();
  const { project, selectedClipId, mainTrackMagnetEnabled, commitTracks } =
    store;
  const hit = clipUnderPlayhead(
    project.tracks,
    project.playheadMs,
    selectedClipId,
  );
  const next = rippleTrimRight({
    tracks: project.tracks,
    playheadMs: project.playheadMs,
    clipId: selectedClipId,
    minDurationMs: minFrameMs(),
    mainTrackMagnetEnabled,
  });
  if (!next || next === project.tracks) return;
  const closed =
    hit != null && shouldCloseGap(hit.track, mainTrackMagnetEnabled);
  commitTracks(next, closed ? "Ripple trim right" : "Trim right");
}

export function cmdRippleDelete(): void {
  const store = getEditorStore();
  const {
    selectedClipId,
    selectedClipIds,
    selectedTransitionId,
    selectedKeyframeCluster,
    selectedTimelineKeyframe,
    project,
    commitTracks,
    clearSelection,
    deleteKeyframeCluster,
    deleteTimelineKeyframe,
    selectKeyframeCluster,
    selectTimelineKeyframe,
  } = store;

  const ids = Array.from(
    new Set(
      (selectedClipIds.length > 0
        ? selectedClipIds
        : selectedClipId
          ? [selectedClipId]
          : []
      ).filter((id) => findClipInTracks(project.tracks, id)),
    ),
  );

  // Multi-clip selection always deletes clips (ignore stray keyframe focus).
  if (ids.length > 1) {
    const next = rippleDeleteMany({
      tracks: project.tracks,
      clipIds: ids,
      mainTrackMagnetEnabled: store.mainTrackMagnetEnabled,
    });
    if (!next) return;
    commitTracks(next, "Delete", { clipId: null, trackId: null });
    clearSelection();
    return;
  }

  // Per-path dope-sheet key first.
  if (selectedTimelineKeyframe) {
    const { clipId, path, keyId } = selectedTimelineKeyframe;
    const before = structuredClone(project.tracks);
    deleteTimelineKeyframe(clipId, path, keyId);
    const after = getEditorStore().project.tracks;
    store.commitTracksTransition(before, after, "Delete keyframe");
    selectTimelineKeyframe(null);
    return;
  }

  // Delete selected summary keyframe cluster before deleting the clip.
  if (selectedKeyframeCluster) {
    const { clipId, localMs } = selectedKeyframeCluster;
    const before = structuredClone(project.tracks);
    deleteKeyframeCluster(clipId, localMs);
    const after = getEditorStore().project.tracks;
    store.commitTracksTransition(before, after, "Delete keyframes");
    selectKeyframeCluster(null);
    return;
  }

  // Delete key on a selected transition clears the transition, not the clip.
  if (selectedTransitionId) {
    const found = findClipInTracks(project.tracks, selectedTransitionId);
    if (!found?.clip.transition) {
      clearSelection();
      return;
    }
    const next = project.tracks.map((t) => {
      if (t.id !== found.track.id) return t;
      return {
        ...t,
        clips: t.clips.map((c) =>
          c.id === selectedTransitionId
            ? { ...c, transition: undefined }
            : c,
        ),
      };
    });
    commitTracks(next, "Clear transition", { clipId: null, trackId: null });
    clearSelection();
    return;
  }

  if (ids.length === 0) return;

  const onlyId = ids[0]!;
  const found = findClipInTracks(project.tracks, onlyId);
  const next = rippleDelete({
    tracks: project.tracks,
    clipId: onlyId,
    mainTrackMagnetEnabled: store.mainTrackMagnetEnabled,
  });
  if (!next) return;
  const closed =
    found != null &&
    shouldCloseGap(found.track, store.mainTrackMagnetEnabled);
  commitTracks(next, closed ? "Ripple delete" : "Delete", {
    clipId: null,
    trackId: null,
  });
  clearSelection();
}

export function cmdUndo(): void {
  getEditorStore().undo();
}

export function cmdRedo(): void {
  getEditorStore().redo();
}

export function cmdCopy(): void {
  const store = getEditorStore();
  const { selectedClipId, selectedClipIds, project, setClipboard } = store;
  const ids =
    selectedClipIds.length > 0
      ? selectedClipIds
      : selectedClipId
        ? [selectedClipId]
        : [];
  if (ids.length === 0) return;

  const entries: ClipboardEntry[] = [];
  for (const id of ids) {
    const found = findClipInTracks(project.tracks, id);
    if (!found) continue;
    entries.push({
      clip: structuredClone(found.clip),
      trackId: found.track.id,
    });
  }
  if (entries.length === 0) return;
  // Stable paste order: earliest timeline start first.
  entries.sort((a, b) => a.clip.startMs - b.clip.startMs);
  setClipboard(entries);
}

export function cmdCut(): void {
  cmdCopy();
  cmdRippleDelete();
}

export function cmdPaste(): void {
  const store = getEditorStore();
  const { clipboard, project, commitTracks, setSelectedClipIds } = store;
  if (clipboard.length === 0) return;
  const result = pasteClips({
    tracks: project.tracks,
    clips: clipboard.map((e) => e.clip),
    sourceTrackIds: clipboard.map((e) => e.trackId),
    playheadMs: project.playheadMs,
  });
  if (!result) return;
  commitTracks(result.tracks, "Paste", { clipId: result.firstClipId });
  if (result.clipIds.length > 0) {
    setSelectedClipIds(result.clipIds, result.firstClipId);
  }
}

export function cmdStepFrame(dir: -1 | 1): void {
  const store = getEditorStore();
  store.setPlaying(false);
  store.setPlayheadMs(store.project.playheadMs + dir * minFrameMs());
}

export function cmdJumpCut(dir: -1 | 1): void {
  const store = getEditorStore();
  store.setPlaying(false);
  const next =
    dir < 0
      ? prevCutMs(store.project.tracks, store.project.playheadMs)
      : nextCutMs(store.project.tracks, store.project.playheadMs);
  if (next != null) store.setPlayheadMs(next);
}

export function cmdZoomIn(): void {
  const store = getEditorStore();
  store.setTimelinePxPerSec(store.timelinePxPerSec * 1.25);
}

export function cmdZoomOut(): void {
  const store = getEditorStore();
  store.setTimelinePxPerSec(store.timelinePxPerSec / 1.25);
}

export function cmdZoomFit(viewportWidthPx: number): void {
  const store = getEditorStore();
  const duration = Math.max(timelineDurationMs(store.project.tracks), 1000);
  const px = (viewportWidthPx / duration) * 1000;
  store.setTimelinePxPerSec(
    Math.min(TIMELINE_PX_PER_SEC_MAX, Math.max(TIMELINE_PX_PER_SEC_MIN, px)),
  );
}

/** Separate linked audio from video (Command-M), or extract audio. */
export function cmdDetachAudio(): void {
  const store = getEditorStore();
  const { selectedClipId, project, commitTracks, selectClip } = store;
  if (!selectedClipId) return;
  const found = findClipInTracks(project.tracks, selectedClipId);
  if (!found) return;

  // Prefer operating from the video/image side when an audio clip is selected.
  let clipId = selectedClipId;
  if (found.clip.kind === "audio" && found.clip.linkedClipId) {
    clipId = found.clip.linkedClipId;
  }

  const target = findClipInTracks(project.tracks, clipId);
  if (!target) return;
  const asset = target.clip.mediaId
    ? project.mediaIndex.find((m) => m.id === target.clip.mediaId)
    : undefined;

  const result = detachAudio({
    tracks: project.tracks,
    clipId,
    mediaHasAudio: Boolean(asset?.hasAudio),
  });
  if (!result) return;
  commitTracks(result.tracks, "Detach audio", {
    clipId: result.audioClipId ?? clipId,
  });
  if (result.audioClipId) selectClip(result.audioClipId);
}

/** Nudge selected clip by one frame (used rarely; move is primarily mouse). */
export function cmdNudgeSelected(dir: -1 | 1): void {
  const store = getEditorStore();
  const { selectedClipId, project, magnetEnabled, timelinePxPerSec, commitTracks } =
    store;
  if (!selectedClipId) return;
  const found = findClipInTracks(project.tracks, selectedClipId);
  if (!found) return;
  const result = moveClip({
    tracks: project.tracks,
    clipId: selectedClipId,
    startMs: found.clip.startMs + dir * minFrameMs(),
    playheadMs: project.playheadMs,
    magnetEnabled,
    pxPerSec: timelinePxPerSec,
  });
  if (!result || result.tracks === project.tracks) return;
  commitTracks(result.tracks, "Nudge clip");
}

const SHUTTLE_STEPS = [1, 2, 4, 8] as const;

function nextShuttleRate(current: number, dir: 1 | -1): number {
  if (current === 0 || Math.sign(current) !== dir) {
    return dir * SHUTTLE_STEPS[0]!;
  }
  const abs = Math.abs(current);
  const idx = SHUTTLE_STEPS.findIndex((s) => s === abs);
  const next =
    idx >= 0 && idx < SHUTTLE_STEPS.length - 1
      ? SHUTTLE_STEPS[idx + 1]!
      : SHUTTLE_STEPS[SHUTTLE_STEPS.length - 1]!;
  return dir * next;
}

export function cmdShuttleReverse(): void {
  const store = getEditorStore();
  const rate = nextShuttleRate(store.shuttleRate, -1);
  store.setShuttleRate(rate);
  store.setPlaying(true);
}

export function cmdShuttlePause(): void {
  const store = getEditorStore();
  store.setShuttleRate(0);
  store.setPlaying(false);
}

export function cmdShuttleForward(): void {
  const store = getEditorStore();
  const rate = nextShuttleRate(store.shuttleRate, 1);
  store.setShuttleRate(rate);
  store.setPlaying(true);
}

export function cmdGotoStart(): void {
  const store = getEditorStore();
  store.setPlaying(false);
  store.setPlayheadMs(0);
}

export function cmdGotoEnd(): void {
  const store = getEditorStore();
  store.setPlaying(false);
  store.setPlayheadMs(timelineDurationMs(store.project.tracks));
}

export function cmdToggleFullscreen(): void {
  window.dispatchEvent(new CustomEvent("indiecut:toggle-fullscreen"));
}

export function cmdExitFullscreen(): void {
  const store = getEditorStore();
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  // Not fullscreen: Esc clears keyframe / segment / cluster selection.
  const hasKfSel =
    store.selectedTimelineKeyframe ||
    store.selectedEasingSegment ||
    store.selectedKeyframeCluster;
  if (hasKfSel) {
    store.clearKeyframeSelection();
  }
}

export function cmdToggleKeyframeGraph(): void {
  getEditorStore().toggleKeyframeGraphMode();
}

export function cmdSelectTool(): void {
  getEditorStore().setEditorTool("select");
}

export function cmdBladeTool(): void {
  getEditorStore().setEditorTool("blade");
}

export function cmdAddText(): void {
  void import("../media/addTextToTimeline").then(({ addTextToTimeline }) => {
    addTextToTimeline("title");
  });
}

function newGroupId(): string {
  return `grp_${Math.random().toString(36).slice(2, 10)}`;
}

export function cmdGroup(): void {
  const store = getEditorStore();
  const { selectedClipId, selectedClipIds, project, commitTracks } = store;
  if (!selectedClipId) return;
  const found = findClipInTracks(project.tracks, selectedClipId);
  if (!found) return;

  // Group the multi-selection; fall back to linked/group peers.
  const seedIds = new Set<string>(
    selectedClipIds.length > 0 ? selectedClipIds : [selectedClipId],
  );
  if (found.clip.groupId) {
    for (const t of project.tracks) {
      for (const c of t.clips) {
        if (c.groupId === found.clip.groupId) seedIds.add(c.id);
      }
    }
  }
  if (seedIds.size < 2 && found.clip.linkedClipId) {
    seedIds.add(found.clip.linkedClipId);
  }

  if (seedIds.size < 2) return;
  const gid = newGroupId();
  const next = project.tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) =>
      seedIds.has(c.id) ? { ...c, groupId: gid } : c,
    ),
  }));
  commitTracks(next, "Group");
}

export function cmdUngroup(): void {
  const store = getEditorStore();
  const { selectedClipId, project, commitTracks } = store;
  if (!selectedClipId) return;
  const found = findClipInTracks(project.tracks, selectedClipId);
  if (!found?.clip.groupId) return;
  const gid = found.clip.groupId;
  const next = project.tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) =>
      c.groupId === gid ? { ...c, groupId: undefined } : c,
    ),
  }));
  commitTracks(next, "Ungroup");
}
