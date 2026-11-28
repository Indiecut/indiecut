import { create } from "zustand";
import {
  applyEasingPreset as applyEasingOnClip,
  clearAnimatableKeyframes as clearKeysOnClip,
  deleteKeyframeById as deleteKeyById,
  deleteKeyframeCluster as deleteCluster,
  getAnimatable,
  jumpToNextKeyframe as jumpNextKey,
  jumpToPrevKeyframe as jumpPrevKey,
  frameEpsilonMs,
  listKeyedAnimatablePaths,
  moveKeyframe as moveKeyOnClip,
  moveKeyframeCluster as moveCluster,
  moveKeyframeXY as moveKeyXYOnClip,
  setAnimatableValue as setAnimValue,
  setKeyframeValueById as setKeyValueOnClip,
  toggleKeyframe as toggleKey,
  toggleKeyframeGroup as toggleGroup,
  updateKeyframeHandles as updateHandlesOnClip,
  type AnimatablePath,
  type KeyframeHandlePatch,
} from "../engine/animatable";
import {
  clearHistory,
  createHistoryState,
  pushPatch,
  redo as historyRedo,
  undo as historyUndo,
  type HistoryState,
} from "../engine/history";
import { pruneEmptyTracks, rippleDeleteMany } from "../engine/timelineOps";
import { clipLocalMs, timelineDurationMs } from "../engine/time";
import type { ExportProgress, ExportSettings } from "../export/types";
import { isCloudAiAvailable } from "../ai/isCloudAiAvailable";
import { saveChatUiPrefs } from "../prefs/appPrefs";
import { createEmptyProject } from "../project/createProject";
import type {
  AssetTab,
  Clip,
  EasingPresetId,
  MediaAssetRef,
  ProjectDocument,
  Track,
} from "../project/types";

export type ExportUiPhase = "settings" | "exporting" | "interrupted" | "done";

export type KeyframeDrawerMode = "dope" | "graph";

export type TimelineKeyframeSelection = {
  clipId: string;
  path: AnimatablePath;
  keyId: string;
};

export type EasingSegmentSelection = {
  clipId: string;
  path: AnimatablePath;
  leftKeyId: string;
};

export type PreviewFitMode = "fit" | "full";

export const PREVIEW_ASPECT_CYCLE = ["16:9", "9:16", "1:1"] as const;
export type PreviewAspect = (typeof PREVIEW_ASPECT_CYCLE)[number];

export const TIMELINE_PX_PER_SEC_MIN = 10;
export const TIMELINE_PX_PER_SEC_MAX = 200;
export const TIMELINE_PX_PER_SEC_DEFAULT = 40;

function touch(project: ProjectDocument): ProjectDocument {
  return { ...project, updatedAt: new Date().toISOString() };
}

function clampPlayheadMs(ms: number, tracks: Track[]): number {
  const duration = timelineDurationMs(tracks);
  const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(0, ms), max);
}

function clampZoom(px: number): number {
  return Math.min(
    TIMELINE_PX_PER_SEC_MAX,
    Math.max(TIMELINE_PX_PER_SEC_MIN, px),
  );
}

export type ClipboardEntry = {
  clip: Clip;
  trackId: string;
};

export type EditorState = {
  project: ProjectDocument;
  /** Primary selected clip (inspector / single-clip ops). */
  selectedClipId: string | null;
  /** All selected timeline clips (includes primary). Order is selection order. */
  selectedClipIds: string[];
  selectedTrackId: string | null;
  /** Incoming clip id when a transition marker is selected (not the video clip). */
  selectedTransitionId: string | null;
  /** Media-bin asset selected from Media/Audio panel (inspector info). */
  selectedMediaId: string | null;
  /**
   * Selected caption cue ids within the primary selected caption clip (UI-only).
   * Cleared when selection leaves that clip.
   */
  selectedCaptionCueIds: string[];
  /** Anchor cue id for shift-range caption selection (UI-only). */
  captionCueRangeAnchorId: string | null;
  /** Active mask chip id for inspector + canvas handles (UI-only). */
  activeMaskId: string | null;
  /** True while Video → Mask subtab is open (drives preview mask handles). */
  maskInspectorOpen: boolean;
  /** Clip id while Remove BG eyedropper is active (UI-only). */
  removeBgEyedropperClipId: string | null;
  /** Selected summary keyframe cluster on the timeline (UI-only). */
  selectedKeyframeCluster: { clipId: string; localMs: number } | null;
  /** Selected single keyframe in the dope-sheet drawer (UI-only). */
  selectedTimelineKeyframe: TimelineKeyframeSelection | null;
  /** Selected easing segment (left key drives Graphs preset) (UI-only). */
  selectedEasingSegment: EasingSegmentSelection | null;
  /** Clip with expanded keyframe dope-sheet drawer (UI-only; one at a time). */
  expandedKeyframeClipId: string | null;
  /** Dope lanes vs value graph under the expanded clip (UI-only). */
  keyframeDrawerMode: KeyframeDrawerMode;
  /** Inspector/timeline path focus for highlight sync (UI-only). */
  focusedAnimatablePath: AnimatablePath | null;
  assetTab: AssetTab;
  lastSavedAt: string | null;
  settingsOpen: boolean;
  /** `create` = New project flow; Cancel must not wipe the open project. */
  projectSettingsMode: "edit" | "create";
  /** Prompt when an action needs an open project (import, SFX, …). */
  needProjectDialogOpen: boolean;
  needProjectDialogMessage: string;
  /** Confirm permanently deleting the open project. */
  deleteProjectDialogOpen: boolean;
  exportOpen: boolean;
  /**
   * Export modal session (UI-only). Survives mediaIndex churn / sleep wake so
   * progress + Resume stay visible.
   */
  exportPhase: ExportUiPhase;
  exportProgress: ExportProgress | null;
  exportError: string | null;
  exportDonePath: string | null;
  exportCanResume: boolean;
  exportDraft: ExportSettings | null;
  shortcutsOpen: boolean;
  /** App-scoped AI settings (API keys) modal. */
  aiSettingsOpen: boolean;
  /** Full-height Chat right dock. Closed by default. */
  chatOpen: boolean;
  /** Crop dialog open for the selected video/image clip. */
  cropDialogOpen: boolean;
  /** Floating Record dialog open. */
  recordDialogOpen: boolean;
  /** Timeline tool: select vs blade (click-to-split). */
  editorTool: "select" | "blade";
  /** Playback shuttle rate: negative = reverse, 0 = paused via K, positive = forward. */
  shuttleRate: number;
  /** 3→1 countdown overlay on preview; null when idle. */
  recordCountdown: number | null;

  /** UI-only — not persisted in project.json */
  isPlaying: boolean;
  previewFitMode: PreviewFitMode;
  isScrubbing: boolean;
  timelinePxPerSec: number;
  magnetEnabled: boolean;
  /** Close gaps on main (`video`) track delete/Q/W when on. */
  mainTrackMagnetEnabled: boolean;
  history: HistoryState;
  clipboard: ClipboardEntry[];

  setProject: (project: ProjectDocument) => void;
  patchProject: (partial: Partial<ProjectDocument>) => void;
  setPlayheadMs: (ms: number) => void;
  setTitle: (title: string) => void;
  addClip: (trackId: string, clip: Clip) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  /** Mutate clip props without pushing undo (slider / drag gestures). */
  patchClipLive: (clipId: string, patch: Partial<Clip>) => void;
  /** Replace tracks without undo (e.g. speed edits that sync linked A/V). */
  patchTracksLive: (tracks: Track[]) => void;
  /** Auto-key or static write at playhead (no undo — use with gesture commit). */
  setAnimatableValue: (
    clipId: string,
    path: AnimatablePath,
    value: number,
  ) => void;
  /** Add/remove key at playhead (no undo — use with gesture commit). */
  toggleKeyframe: (clipId: string, path: AnimatablePath) => void;
  /** Batch toggle child paths at playhead (group diamond). */
  toggleKeyframeGroup: (clipId: string, paths: AnimatablePath[]) => void;
  jumpToPrevKeyframe: (clipId: string, path: AnimatablePath) => void;
  jumpToNextKeyframe: (clipId: string, path: AnimatablePath) => void;
  /** Live-move all keys in a ±1-frame cluster (no undo — commit on pointer up). */
  moveKeyframeCluster: (
    clipId: string,
    fromLocalMs: number,
    toLocalMs: number,
  ) => void;
  /** Delete all keys in a ±1-frame cluster (no undo — use with gesture commit). */
  deleteKeyframeCluster: (clipId: string, localMs: number) => void;
  selectKeyframeCluster: (
    cluster: { clipId: string; localMs: number } | null,
  ) => void;
  selectTimelineKeyframe: (sel: TimelineKeyframeSelection | null) => void;
  selectEasingSegment: (sel: EasingSegmentSelection | null) => void;
  setExpandedKeyframeClipId: (clipId: string | null) => void;
  setKeyframeDrawerMode: (mode: KeyframeDrawerMode) => void;
  /** Expand selected clip if needed, then flip dope ↔ graph. */
  toggleKeyframeGraphMode: () => void;
  setFocusedAnimatablePath: (path: AnimatablePath | null) => void;
  /** Live-move one key on a path (no undo — commit on pointer up). */
  moveTimelineKeyframe: (
    clipId: string,
    path: AnimatablePath,
    keyId: string,
    toLocalMs: number,
  ) => void;
  /** Live-move key in time + value (graph diamond drag). */
  moveTimelineKeyframeXY: (
    clipId: string,
    path: AnimatablePath,
    keyId: string,
    toLocalMs: number,
    value: number,
  ) => void;
  /** Live-set key value only (graph Y or mini-curve sync). */
  setTimelineKeyframeValue: (
    clipId: string,
    path: AnimatablePath,
    keyId: string,
    value: number,
  ) => void;
  /** Live-update segment handles (custom graph / mini-curve). */
  updateTimelineKeyframeHandles: (
    clipId: string,
    path: AnimatablePath,
    keyId: string,
    patch: KeyframeHandlePatch,
  ) => void;
  /** Delete one key by id (no undo — use with gesture commit). */
  deleteTimelineKeyframe: (
    clipId: string,
    path: AnimatablePath,
    keyId: string,
  ) => void;
  /** Apply Graphs preset to left key of a segment (no undo — use with commit). */
  applyEasingPreset: (
    clipId: string,
    path: AnimatablePath,
    leftKeyId: string,
    preset: Exclude<EasingPresetId, "custom">,
  ) => void;
  /** Clear all keys on a path (no undo — use with commit). */
  clearAnimatableKeyframes: (clipId: string, path: AnimatablePath) => void;
  /** Clear keyframe / segment / cluster selection only. */
  clearKeyframeSelection: () => void;
  upsertMediaAsset: (asset: MediaAssetRef) => void;
  patchMediaAsset: (assetId: string, patch: Partial<MediaAssetRef>) => void;
  /** Remove media from the bin and any timeline clips that reference it. */
  removeMediaAsset: (assetId: string) => boolean;

  selectClip: (clipId: string, trackId?: string) => void;
  /**
   * Select a caption clip and cue(s) within it (left-panel / timeline cue click).
   * Pass cueId null to keep the clip selected but clear cue focus.
   * mode: replace (default), toggle (⌘/Ctrl), range (Shift).
   */
  selectCaptionCue: (
    clipId: string,
    cueId: string | null,
    trackId?: string,
    mode?: "replace" | "toggle" | "range",
  ) => void;
  /** Toggle clip in/out of multi-selection (⌘/Ctrl+click). */
  toggleClipSelection: (clipId: string, trackId?: string) => void;
  /** Replace selection with these ids; primary defaults to the last id. */
  setSelectedClipIds: (clipIds: string[], primaryId?: string | null) => void;
  /** Select an edit-point transition (incoming clip id). Clears clip selection. */
  selectTransition: (incomingClipId: string, trackId?: string) => void;
  /** Select a media-bin asset; clears timeline clip/transition selection. */
  selectMedia: (mediaId: string | null) => void;
  clearSelection: () => void;
  setActiveMaskId: (maskId: string | null) => void;
  setMaskInspectorOpen: (open: boolean) => void;
  setRemoveBgEyedropperClipId: (clipId: string | null) => void;
  setAssetTab: (tab: AssetTab) => void;
  setLastSavedAt: (iso: string | null) => void;
  setSettingsOpen: (open: boolean, mode?: "edit" | "create") => void;
  setNeedProjectDialogOpen: (open: boolean, message?: string) => void;
  setDeleteProjectDialogOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setExportPhase: (phase: ExportUiPhase) => void;
  setExportProgress: (progress: ExportProgress | null) => void;
  setExportError: (error: string | null) => void;
  setExportDonePath: (path: string | null) => void;
  setExportCanResume: (can: boolean) => void;
  setExportDraft: (draft: ExportSettings | null) => void;
  resetExportSession: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setAiSettingsOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  toggleChatOpen: () => void;
  /** Boot-only: apply persisted open flag without writing prefs again. */
  hydrateChatOpen: (open: boolean) => void;
  setCropDialogOpen: (open: boolean) => void;
  setEditorTool: (tool: "select" | "blade") => void;
  setShuttleRate: (rate: number) => void;
  setRecordDialogOpen: (open: boolean) => void;
  setRecordCountdown: (n: number | null) => void;

  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setPreviewFitMode: (mode: PreviewFitMode) => void;
  cyclePreviewAspect: () => void;
  setScrubbing: (scrubbing: boolean) => void;

  setTimelinePxPerSec: (px: number) => void;
  setMagnetEnabled: (enabled: boolean) => void;
  toggleMagnet: () => void;
  setMainTrackMagnetEnabled: (enabled: boolean) => void;
  toggleMainTrackMagnet: () => void;

  /** Apply tracks mutation with one undo patch. */
  commitTracks: (
    tracks: Track[],
    label: string,
    selection?: { clipId: string | null; trackId?: string | null },
  ) => void;
  /** Commit with an explicit before snapshot (for live drag gestures). */
  commitTracksTransition: (
    before: Track[],
    after: Track[],
    label: string,
  ) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  setClipboard: (entries: ClipboardEntry[]) => void;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  project: createEmptyProject(),
  selectedClipId: null,
  selectedClipIds: [],
  selectedTrackId: null,
  selectedTransitionId: null,
  selectedMediaId: null,
  selectedCaptionCueIds: [],
  captionCueRangeAnchorId: null,
  activeMaskId: null,
  maskInspectorOpen: false,
  removeBgEyedropperClipId: null,
  selectedKeyframeCluster: null,
  selectedTimelineKeyframe: null,
  selectedEasingSegment: null,
  expandedKeyframeClipId: null,
  keyframeDrawerMode: "dope",
  focusedAnimatablePath: null,
  assetTab: "Media",
  lastSavedAt: null,
  settingsOpen: false,
  projectSettingsMode: "edit",
  needProjectDialogOpen: false,
  needProjectDialogMessage:
    "Open or create a project before continuing.",
  deleteProjectDialogOpen: false,
  exportOpen: false,
  exportPhase: "settings",
  exportProgress: null,
  exportError: null,
  exportDonePath: null,
  exportCanResume: false,
  exportDraft: null,
  cropDialogOpen: false,
  shortcutsOpen: false,
  aiSettingsOpen: false,
  chatOpen: false,
  recordDialogOpen: false,
  recordCountdown: null,
  editorTool: "select",
  shuttleRate: 0,

  isPlaying: false,
  previewFitMode: "fit",
  isScrubbing: false,
  timelinePxPerSec: TIMELINE_PX_PER_SEC_DEFAULT,
  magnetEnabled: true,
  mainTrackMagnetEnabled: true,
  history: createHistoryState(),
  clipboard: [],

  setProject: (project) =>
    set({
      project: touch(project),
      history: clearHistory(),
      selectedClipId: null,
      selectedClipIds: [],
      selectedTrackId: null,
      selectedTransitionId: null,
      selectedMediaId: null,
      selectedCaptionCueIds: [],
      captionCueRangeAnchorId: null,
      activeMaskId: null,
      maskInspectorOpen: false,
      removeBgEyedropperClipId: null,
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
      expandedKeyframeClipId: null,
      keyframeDrawerMode: "dope",
      focusedAnimatablePath: null,
      cropDialogOpen: false,
    }),

  patchProject: (partial) => {
    const { project } = get();
    set({
      project: touch({
        ...project,
        ...partial,
        version: partial.version ?? project.version,
        tracks: partial.tracks ?? project.tracks,
        mediaIndex: partial.mediaIndex ?? project.mediaIndex,
      }),
    });
  },

  setPlayheadMs: (ms) => {
    const { project } = get();
    const playheadMs = clampPlayheadMs(ms, project.tracks);
    if (playheadMs === project.playheadMs) return;
    set({
      project: {
        ...project,
        playheadMs,
      },
    });
  },

  setTitle: (title) => {
    const { project } = get();
    set({ project: touch({ ...project, title }) });
  },

  addClip: (trackId, clip) => {
    const { project, commitTracks } = get();
    const tracks = project.tracks.map((track) =>
      track.id === trackId
        ? { ...track, clips: [...track.clips, clip] }
        : track,
    );
    commitTracks(tracks, "Add clip", { clipId: clip.id, trackId });
  },

  updateClip: (clipId, patch) => {
    const { project, commitTracks } = get();
    const tracks = project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId ? { ...clip, ...patch } : clip,
      ),
    }));
    commitTracks(tracks, "Update clip");
  },

  patchClipLive: (clipId, patch) => {
    const { project } = get();
    const tracks = project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId ? { ...clip, ...patch } : clip,
      ),
    }));
    if (tracks === project.tracks) return;
    const playheadMs = clampPlayheadMs(project.playheadMs, tracks);
    set({
      project: touch({ ...project, tracks, playheadMs }),
    });
  },

  setAnimatableValue: (clipId, path, value) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const local = clipLocalMs(project.playheadMs, found.clip);
    if (local === null) return;
    const patch = setAnimValue(
      found.clip,
      path,
      value,
      local,
      project.fps,
    );
    patchClipLive(clipId, patch);
  },

  toggleKeyframe: (clipId, path) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const local = clipLocalMs(project.playheadMs, found.clip);
    if (local === null) return;
    const patch = toggleKey(found.clip, path, local, project.fps);
    patchClipLive(clipId, patch);
  },

  jumpToPrevKeyframe: (clipId, path) => {
    const { project, setPlayheadMs } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const local = clipLocalMs(project.playheadMs, found.clip);
    if (local === null) return;
    const prop = getAnimatable(found.clip, path);
    const t = jumpPrevKey(prop, local, frameEpsilonMs(project.fps));
    if (t === null) return;
    setPlayheadMs(found.clip.startMs + t);
  },

  jumpToNextKeyframe: (clipId, path) => {
    const { project, setPlayheadMs } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const local = clipLocalMs(project.playheadMs, found.clip);
    if (local === null) return;
    const prop = getAnimatable(found.clip, path);
    const t = jumpNextKey(prop, local, frameEpsilonMs(project.fps));
    if (t === null) return;
    setPlayheadMs(found.clip.startMs + t);
  },

  toggleKeyframeGroup: (clipId, paths) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const local = clipLocalMs(project.playheadMs, found.clip);
    if (local === null) return;
    const patch = toggleGroup(found.clip, paths, local, project.fps);
    patchClipLive(clipId, patch);
  },

  moveKeyframeCluster: (clipId, fromLocalMs, toLocalMs) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const patch = moveCluster(
      found.clip,
      fromLocalMs,
      toLocalMs,
      project.fps,
    );
    if (Object.keys(patch).length === 0) return;
    patchClipLive(clipId, patch);
  },

  deleteKeyframeCluster: (clipId, localMs) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const patch = deleteCluster(found.clip, localMs, project.fps);
    patchClipLive(clipId, patch);
  },

  selectKeyframeCluster: (cluster) => {
    set({
      selectedKeyframeCluster: cluster,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
    });
  },

  selectTimelineKeyframe: (sel) => {
    set({
      selectedTimelineKeyframe: sel,
      selectedEasingSegment: null,
      selectedKeyframeCluster: null,
      focusedAnimatablePath: sel?.path ?? get().focusedAnimatablePath,
    });
  },

  selectEasingSegment: (sel) => {
    set({
      selectedEasingSegment: sel,
      selectedTimelineKeyframe: null,
      selectedKeyframeCluster: null,
      focusedAnimatablePath: sel?.path ?? get().focusedAnimatablePath,
    });
  },

  setExpandedKeyframeClipId: (clipId) => {
    if (clipId === null) {
      set({ expandedKeyframeClipId: null, keyframeDrawerMode: "dope" });
      return;
    }
    set({ expandedKeyframeClipId: clipId });
  },

  setKeyframeDrawerMode: (mode) => {
    set({ keyframeDrawerMode: mode });
  },

  toggleKeyframeGraphMode: () => {
    const state = get();
    const { project, selectedClipId, expandedKeyframeClipId, keyframeDrawerMode } =
      state;
    let clipId = expandedKeyframeClipId ?? selectedClipId;
    if (!clipId) return;
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const paths = listKeyedAnimatablePaths(found.clip);
    if (paths.length === 0) return;

    const enteringGraph =
      expandedKeyframeClipId !== clipId || keyframeDrawerMode !== "graph";
    const focus =
      state.focusedAnimatablePath &&
      paths.includes(state.focusedAnimatablePath)
        ? state.focusedAnimatablePath
        : paths[0]!;

    if (enteringGraph) {
      set({
        expandedKeyframeClipId: clipId,
        keyframeDrawerMode: "graph",
        focusedAnimatablePath: focus,
      });
      return;
    }
    set({ keyframeDrawerMode: "dope" });
  },

  setFocusedAnimatablePath: (path) => {
    set({ focusedAnimatablePath: path });
  },

  moveTimelineKeyframe: (clipId, path, keyId, toLocalMs) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const patch = moveKeyOnClip(
      found.clip,
      path,
      keyId,
      toLocalMs,
      project.fps,
    );
    if (Object.keys(patch).length === 0) return;
    patchClipLive(clipId, patch);
  },

  moveTimelineKeyframeXY: (clipId, path, keyId, toLocalMs, value) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const patch = moveKeyXYOnClip(
      found.clip,
      path,
      keyId,
      toLocalMs,
      value,
      project.fps,
    );
    if (Object.keys(patch).length === 0) return;
    patchClipLive(clipId, patch);
  },

  setTimelineKeyframeValue: (clipId, path, keyId, value) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const patch = setKeyValueOnClip(found.clip, path, keyId, value);
    if (Object.keys(patch).length === 0) return;
    patchClipLive(clipId, patch);
  },

  updateTimelineKeyframeHandles: (clipId, path, keyId, patch) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const next = updateHandlesOnClip(found.clip, path, keyId, patch);
    if (Object.keys(next).length === 0) return;
    patchClipLive(clipId, next);
  },

  deleteTimelineKeyframe: (clipId, path, keyId) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const patch = deleteKeyById(found.clip, path, keyId);
    if (Object.keys(patch).length === 0) return;
    patchClipLive(clipId, patch);
  },

  applyEasingPreset: (clipId, path, leftKeyId, preset) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const patch = applyEasingOnClip(found.clip, path, leftKeyId, preset);
    if (Object.keys(patch).length === 0) return;
    patchClipLive(clipId, patch);
  },

  clearAnimatableKeyframes: (clipId, path) => {
    const { project, patchClipLive } = get();
    const found = findClip(project.tracks, clipId);
    if (!found) return;
    const local = clipLocalMs(project.playheadMs, found.clip) ?? 0;
    const patch = clearKeysOnClip(found.clip, path, local);
    if (Object.keys(patch).length === 0) return;
    patchClipLive(clipId, patch);
  },

  clearKeyframeSelection: () =>
    set({
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
    }),

  patchTracksLive: (tracks) => {
    const { project } = get();
    const playheadMs = clampPlayheadMs(project.playheadMs, tracks);
    set({
      project: touch({ ...project, tracks, playheadMs }),
    });
  },

  upsertMediaAsset: (asset) => {
    const { project } = get();
    const idx = project.mediaIndex.findIndex((m) => m.id === asset.id);
    const mediaIndex =
      idx >= 0
        ? project.mediaIndex.map((m, i) => (i === idx ? asset : m))
        : [...project.mediaIndex, asset];
    set({ project: touch({ ...project, mediaIndex }) });
  },

  patchMediaAsset: (assetId, patch) => {
    const { project } = get();
    const mediaIndex = project.mediaIndex.map((m) =>
      m.id === assetId ? { ...m, ...patch } : m,
    );
    set({ project: touch({ ...project, mediaIndex }) });
  },

  removeMediaAsset: (assetId) => {
    const state = get();
    const { project, mainTrackMagnetEnabled } = state;
    if (!project.mediaIndex.some((m) => m.id === assetId)) return false;

    const clipIds: string[] = [];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.mediaId === assetId) clipIds.push(clip.id);
      }
    }

    let tracks = project.tracks;
    if (clipIds.length > 0) {
      tracks =
        rippleDeleteMany({
          tracks,
          clipIds,
          mainTrackMagnetEnabled,
        }) ?? tracks;
    }

    const mediaIndex = project.mediaIndex.filter((m) => m.id !== assetId);
    const remainingIds = new Set(
      tracks.flatMap((t) => t.clips.map((c) => c.id)),
    );
    const selectedClipIds = state.selectedClipIds.filter((id) =>
      remainingIds.has(id),
    );
    const selectedClipId =
      state.selectedClipId && remainingIds.has(state.selectedClipId)
        ? state.selectedClipId
        : (selectedClipIds[selectedClipIds.length - 1] ?? null);
    const playheadMs = clampPlayheadMs(project.playheadMs, tracks);

    set({
      project: touch({ ...project, mediaIndex, tracks, playheadMs }),
      selectedMediaId:
        state.selectedMediaId === assetId ? null : state.selectedMediaId,
      selectedClipId,
      selectedClipIds,
      selectedTrackId: selectedClipId
        ? (tracks.find((t) => t.clips.some((c) => c.id === selectedClipId))
            ?.id ?? null)
        : null,
      selectedTransitionId:
        state.selectedTransitionId &&
        remainingIds.has(state.selectedTransitionId)
          ? state.selectedTransitionId
          : null,
      selectedCaptionCueIds: selectedClipId ? state.selectedCaptionCueIds : [],
      captionCueRangeAnchorId: selectedClipId
        ? state.captionCueRangeAnchorId
        : null,
      expandedKeyframeClipId:
        state.expandedKeyframeClipId &&
        remainingIds.has(state.expandedKeyframeClipId)
          ? state.expandedKeyframeClipId
          : null,
      selectedKeyframeCluster:
        state.selectedKeyframeCluster &&
        remainingIds.has(state.selectedKeyframeCluster.clipId)
          ? state.selectedKeyframeCluster
          : null,
      selectedTimelineKeyframe:
        state.selectedTimelineKeyframe &&
        remainingIds.has(state.selectedTimelineKeyframe.clipId)
          ? state.selectedTimelineKeyframe
          : null,
      selectedEasingSegment:
        state.selectedEasingSegment &&
        remainingIds.has(state.selectedEasingSegment.clipId)
          ? state.selectedEasingSegment
          : null,
      activeMaskId: selectedClipId ? state.activeMaskId : null,
      removeBgEyedropperClipId:
        state.removeBgEyedropperClipId &&
        remainingIds.has(state.removeBgEyedropperClipId)
          ? state.removeBgEyedropperClipId
          : null,
    });
    return true;
  },

  selectClip: (clipId, trackId) => {
    let resolvedTrackId = trackId ?? null;
    if (!resolvedTrackId) {
      for (const track of get().project.tracks) {
        if (track.clips.some((c) => c.id === clipId)) {
          resolvedTrackId = track.id;
          break;
        }
      }
    }
    const state = get();
    const {
      expandedKeyframeClipId,
      keyframeDrawerMode,
      selectedCaptionCueIds,
      captionCueRangeAnchorId,
    } = state;
    const keepExpanded = expandedKeyframeClipId === clipId;
    const sameClip = state.selectedClipId === clipId;
    set({
      selectedClipId: clipId,
      selectedClipIds: [clipId],
      selectedTrackId: resolvedTrackId,
      selectedTransitionId: null,
      selectedMediaId: null,
      selectedCaptionCueIds: sameClip ? selectedCaptionCueIds : [],
      captionCueRangeAnchorId: sameClip ? captionCueRangeAnchorId : null,
      activeMaskId: null,
      removeBgEyedropperClipId: null,
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
      // Collapse drawer when selecting a different clip
      expandedKeyframeClipId: keepExpanded ? expandedKeyframeClipId : null,
      keyframeDrawerMode: keepExpanded ? keyframeDrawerMode : "dope",
      focusedAnimatablePath: null,
    });
  },

  selectCaptionCue: (clipId, cueId, trackId, mode = "replace") => {
    let resolvedTrackId = trackId ?? null;
    if (!resolvedTrackId) {
      for (const track of get().project.tracks) {
        if (track.clips.some((c) => c.id === clipId)) {
          resolvedTrackId = track.id;
          break;
        }
      }
    }

    const state = get();
    const { expandedKeyframeClipId, keyframeDrawerMode } = state;
    const keepExpanded = expandedKeyframeClipId === clipId;

    let nextCueIds: string[] = [];
    let nextAnchor: string | null = null;

    if (cueId == null) {
      nextCueIds = [];
      nextAnchor = null;
    } else {
      const sameClip = state.selectedClipId === clipId;
      const existing = sameClip ? state.selectedCaptionCueIds : [];
      const anchor = sameClip ? state.captionCueRangeAnchorId : null;

      if (mode === "toggle" && sameClip) {
        if (existing.includes(cueId)) {
          nextCueIds = existing.filter((id) => id !== cueId);
        } else {
          nextCueIds = [...existing, cueId];
        }
        nextAnchor = cueId;
      } else if (mode === "range" && sameClip) {
        const clip = state.project.tracks
          .flatMap((t) => t.clips)
          .find((c) => c.id === clipId);
        const cueList = clip?.caption?.cues ?? [];
        const anchorId = anchor ?? existing[existing.length - 1] ?? cueId;
        const a = cueList.findIndex((c) => c.id === anchorId);
        const b = cueList.findIndex((c) => c.id === cueId);
        if (a >= 0 && b >= 0) {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          nextCueIds = cueList.slice(lo, hi + 1).map((c) => c.id);
        } else {
          nextCueIds = [cueId];
        }
        nextAnchor = anchorId;
      } else {
        nextCueIds = [cueId];
        nextAnchor = cueId;
      }
    }

    set({
      selectedClipId: clipId,
      selectedClipIds: [clipId],
      selectedTrackId: resolvedTrackId,
      selectedTransitionId: null,
      selectedMediaId: null,
      selectedCaptionCueIds: nextCueIds,
      captionCueRangeAnchorId: nextAnchor,
      activeMaskId: null,
      removeBgEyedropperClipId: null,
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
      expandedKeyframeClipId: keepExpanded ? expandedKeyframeClipId : null,
      keyframeDrawerMode: keepExpanded ? keyframeDrawerMode : "dope",
      focusedAnimatablePath: null,
    });
  },

  toggleClipSelection: (clipId, trackId) => {
    const state = get();
    const has = state.selectedClipIds.includes(clipId);
    let nextIds: string[];
    let primary: string | null;
    if (has) {
      nextIds = state.selectedClipIds.filter((id) => id !== clipId);
      primary =
        state.selectedClipId === clipId
          ? (nextIds[nextIds.length - 1] ?? null)
          : state.selectedClipId;
      if (primary && !nextIds.includes(primary)) {
        primary = nextIds[nextIds.length - 1] ?? null;
      }
    } else {
      nextIds = [...state.selectedClipIds, clipId];
      primary = clipId;
    }

    let resolvedTrackId = trackId ?? state.selectedTrackId;
    if (primary) {
      for (const track of state.project.tracks) {
        if (track.clips.some((c) => c.id === primary)) {
          resolvedTrackId = track.id;
          break;
        }
      }
    } else {
      resolvedTrackId = null;
    }

    const { expandedKeyframeClipId, keyframeDrawerMode } = state;
    const keepExpanded = primary != null && expandedKeyframeClipId === primary;
    set({
      selectedClipId: primary,
      selectedClipIds: nextIds,
      selectedTrackId: resolvedTrackId,
      selectedTransitionId: null,
      selectedMediaId: null,
      selectedCaptionCueIds: [],
      captionCueRangeAnchorId: null,
      activeMaskId: null,
      removeBgEyedropperClipId: null,
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
      expandedKeyframeClipId: keepExpanded ? expandedKeyframeClipId : null,
      keyframeDrawerMode: keepExpanded ? keyframeDrawerMode : "dope",
      focusedAnimatablePath: null,
    });
  },

  setSelectedClipIds: (clipIds, primaryId) => {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const id of clipIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    const primary =
      primaryId !== undefined
        ? primaryId && unique.includes(primaryId)
          ? primaryId
          : (unique[unique.length - 1] ?? null)
        : (unique[unique.length - 1] ?? null);

    let resolvedTrackId: string | null = null;
    if (primary) {
      for (const track of get().project.tracks) {
        if (track.clips.some((c) => c.id === primary)) {
          resolvedTrackId = track.id;
          break;
        }
      }
    }

    const { expandedKeyframeClipId, keyframeDrawerMode } = get();
    const keepExpanded = primary != null && expandedKeyframeClipId === primary;
    set({
      selectedClipId: primary,
      selectedClipIds: unique,
      selectedTrackId: resolvedTrackId,
      selectedTransitionId: null,
      selectedMediaId: null,
      selectedCaptionCueIds: [],
      captionCueRangeAnchorId: null,
      activeMaskId: null,
      removeBgEyedropperClipId: null,
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
      expandedKeyframeClipId: keepExpanded ? expandedKeyframeClipId : null,
      keyframeDrawerMode: keepExpanded ? keyframeDrawerMode : "dope",
      focusedAnimatablePath: null,
    });
  },

  selectTransition: (incomingClipId, trackId) => {
    let resolvedTrackId = trackId ?? null;
    if (!resolvedTrackId) {
      for (const track of get().project.tracks) {
        if (track.clips.some((c) => c.id === incomingClipId)) {
          resolvedTrackId = track.id;
          break;
        }
      }
    }
    set({
      selectedTransitionId: incomingClipId,
      selectedTrackId: resolvedTrackId,
      selectedClipId: null,
      selectedClipIds: [],
      selectedMediaId: null,
      selectedCaptionCueIds: [],
      captionCueRangeAnchorId: null,
      activeMaskId: null,
      maskInspectorOpen: false,
      removeBgEyedropperClipId: null,
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
      expandedKeyframeClipId: null,
      keyframeDrawerMode: "dope",
      focusedAnimatablePath: null,
    });
  },

  selectMedia: (mediaId) =>
    set({
      selectedMediaId: mediaId,
      selectedClipId: null,
      selectedClipIds: [],
      selectedTrackId: null,
      selectedTransitionId: null,
      selectedCaptionCueIds: [],
      captionCueRangeAnchorId: null,
      activeMaskId: null,
      maskInspectorOpen: false,
      removeBgEyedropperClipId: null,
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
      expandedKeyframeClipId: null,
      keyframeDrawerMode: "dope",
      focusedAnimatablePath: null,
    }),

  clearSelection: () =>
    set({
      selectedClipId: null,
      selectedClipIds: [],
      selectedTrackId: null,
      selectedTransitionId: null,
      selectedMediaId: null,
      selectedCaptionCueIds: [],
      captionCueRangeAnchorId: null,
      activeMaskId: null,
      maskInspectorOpen: false,
      removeBgEyedropperClipId: null,
      selectedKeyframeCluster: null,
      selectedTimelineKeyframe: null,
      selectedEasingSegment: null,
      expandedKeyframeClipId: null,
      keyframeDrawerMode: "dope",
      focusedAnimatablePath: null,
      cropDialogOpen: false,
    }),

  setActiveMaskId: (maskId) => set({ activeMaskId: maskId }),
  setMaskInspectorOpen: (open) => set({ maskInspectorOpen: open }),
  setRemoveBgEyedropperClipId: (clipId) =>
    set({ removeBgEyedropperClipId: clipId }),

  setAssetTab: (tab) => set({ assetTab: tab }),

  setLastSavedAt: (iso) => set({ lastSavedAt: iso }),

  setSettingsOpen: (open, mode = "edit") =>
    set({
      settingsOpen: open,
      projectSettingsMode: open ? mode : "edit",
    }),
  setNeedProjectDialogOpen: (open, message) =>
    set({
      needProjectDialogOpen: open,
      ...(message
        ? { needProjectDialogMessage: message }
        : open
          ? {}
          : {
              needProjectDialogMessage:
                "Open or create a project before continuing.",
            }),
    }),
  setDeleteProjectDialogOpen: (open) =>
    set({ deleteProjectDialogOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setExportPhase: (phase) => set({ exportPhase: phase }),
  setExportProgress: (progress) => set({ exportProgress: progress }),
  setExportError: (error) => set({ exportError: error }),
  setExportDonePath: (path) => set({ exportDonePath: path }),
  setExportCanResume: (can) => set({ exportCanResume: can }),
  setExportDraft: (draft) => set({ exportDraft: draft }),
  resetExportSession: () =>
    set({
      exportPhase: "settings",
      exportProgress: null,
      exportError: null,
      exportDonePath: null,
      exportCanResume: false,
      exportDraft: null,
    }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setAiSettingsOpen: (open) => {
    if (open && !isCloudAiAvailable()) return;
    set({ aiSettingsOpen: open });
  },
  setChatOpen: (open) => {
    if (open && !isCloudAiAvailable()) return;
    const next = Boolean(open);
    set({ chatOpen: next });
    void saveChatUiPrefs({ open: next });
  },
  toggleChatOpen: () => {
    get().setChatOpen(!get().chatOpen);
  },
  /** Apply prefs loaded from IndexedDB during app boot (no re-write). */
  hydrateChatOpen: (open: boolean) =>
    set({ chatOpen: isCloudAiAvailable() ? Boolean(open) : false }),
  setCropDialogOpen: (open) => set({ cropDialogOpen: open }),
  setEditorTool: (tool) => set({ editorTool: tool }),
  setShuttleRate: (rate) => set({ shuttleRate: rate }),
  setRecordDialogOpen: (open) =>
    set({
      recordDialogOpen: open,
      ...(open ? {} : { recordCountdown: null }),
    }),
  setRecordCountdown: (n) => set({ recordCountdown: n }),

  setPlaying: (playing) =>
    set({
      isPlaying: playing,
      ...(playing ? {} : { shuttleRate: 0 }),
    }),

  togglePlaying: () => {
    const { isPlaying, project, setPlayheadMs, setPlaying } = get();
    if (!isPlaying) {
      const duration = timelineDurationMs(project.tracks);
      if (duration > 0 && project.playheadMs >= duration) {
        setPlayheadMs(0);
      }
    }
    setPlaying(!isPlaying);
  },

  setPreviewFitMode: (mode) => set({ previewFitMode: mode }),

  cyclePreviewAspect: () => {
    const { project, patchProject } = get();
    const current = project.aspectRatio;
    const idx = PREVIEW_ASPECT_CYCLE.indexOf(current as PreviewAspect);
    const next =
      PREVIEW_ASPECT_CYCLE[(idx + 1) % PREVIEW_ASPECT_CYCLE.length] ??
      PREVIEW_ASPECT_CYCLE[0];
    patchProject({ aspectRatio: next });
  },

  setScrubbing: (scrubbing) => set({ isScrubbing: scrubbing }),

  setTimelinePxPerSec: (px) => set({ timelinePxPerSec: clampZoom(px) }),

  setMagnetEnabled: (enabled) => set({ magnetEnabled: enabled }),

  toggleMagnet: () => set({ magnetEnabled: !get().magnetEnabled }),

  setMainTrackMagnetEnabled: (enabled) =>
    set({ mainTrackMagnetEnabled: enabled }),

  toggleMainTrackMagnet: () =>
    set({ mainTrackMagnetEnabled: !get().mainTrackMagnetEnabled }),

  commitTracks: (tracks, label, selection) => {
    const { project, history } = get();
    // Keep a just-added empty lane so the user can drop onto it;
    // every other edit drops empty extras automatically.
    const skipPrune = /^Add \w+ track$/i.test(label);
    const nextTracks = skipPrune ? tracks : pruneEmptyTracks(tracks);
    if (nextTracks === project.tracks) return;
    const before = structuredClone(project.tracks);
    const after = structuredClone(nextTracks);
    const nextHistory = pushPatch(history, {
      label,
      before: { tracks: before },
      after: { tracks: after },
    });
    const playheadMs = clampPlayheadMs(project.playheadMs, nextTracks);
    set({
      project: touch({ ...project, tracks: nextTracks, playheadMs }),
      history: nextHistory,
      ...(selection
        ? {
            selectedClipId: selection.clipId,
            selectedClipIds: selection.clipId ? [selection.clipId] : [],
            selectedTrackId:
              selection.trackId !== undefined
                ? selection.trackId
                : get().selectedTrackId,
            selectedTransitionId: null,
          }
        : {}),
    });
  },

  commitTracksTransition: (before, after, label) => {
    const { project, history } = get();
    const nextTracks = pruneEmptyTracks(after);
    const nextHistory = pushPatch(history, {
      label,
      before: { tracks: structuredClone(before) },
      after: { tracks: structuredClone(nextTracks) },
    });
    const playheadMs = clampPlayheadMs(project.playheadMs, nextTracks);
    set({
      project: touch({ ...project, tracks: nextTracks, playheadMs }),
      history: nextHistory,
    });
  },

  undo: () => {
    const { history, project } = get();
    const result = historyUndo(history);
    if (!result) return;
    const playheadMs = clampPlayheadMs(project.playheadMs, result.tracks);
    set({
      project: touch({ ...project, tracks: result.tracks, playheadMs }),
      history: result.state,
    });
  },

  redo: () => {
    const { history, project } = get();
    const result = historyRedo(history);
    if (!result) return;
    const playheadMs = clampPlayheadMs(project.playheadMs, result.tracks);
    set({
      project: touch({ ...project, tracks: result.tracks, playheadMs }),
      history: result.state,
    });
  },

  canUndo: () => get().history.undoStack.length > 0,
  canRedo: () => get().history.redoStack.length > 0,

  setClipboard: (entries) => set({ clipboard: entries }),
}));

export function getEditorStore() {
  return useEditorStore.getState();
}

export function findClip(
  tracks: Track[],
  clipId: string,
): { track: Track; clip: Clip } | null {
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function frameDurationMs(fps: number): number {
  return 1000 / Math.max(1, fps);
}
