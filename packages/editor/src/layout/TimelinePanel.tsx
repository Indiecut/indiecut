import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  IconBlade,
  IconCrop,
  IconEffects,
  IconEye,
  IconFilters,
  IconFreeze,
  IconLock,
  IconMagnet,
  IconMainTrackMagnet,
  IconMic,
  IconMute,
  IconRedo,
  IconSelect,
  IconSolo,
  IconSplit,
  IconTrackCaption,
  IconText,
  IconTrackAudio,
  IconTrackSticker,
  IconTrackVideo,
  IconTransitionBowtie,
  IconTrash,
  IconUndo,
} from "../icons/Icons";
import {
  listTransitionMarkers,
  resizeTransitionDuration,
  type TransitionMarker,
} from "../engine/editPoints";
import { timelineDurationMs } from "../engine/time";
import {
  applyReverseToClip,
  canExtendClipLeft,
  canExtendClipRight,
  canFreezeFrameAt,
  isVisualAvTrack,
  moveClip,
  reverseModeOf,
  setTrackFlags,
  splitClipAt,
  trimClipEdge,
} from "../engine/timelineOps";
import {
  addEffectToTimeline,
  EFFECT_DRAG_MIME,
} from "../media/addEffectToTimeline";
import {
  addStickerToTimeline,
  STICKER_DRAG_MIME,
} from "../media/addStickerToTimeline";
import { addMediaToTimeline, MEDIA_DRAG_MIME } from "../media/addToTimeline";
import {
  addSoundEffectToTimeline,
  SOUND_EFFECT_DRAG_MIME,
} from "../media/addSoundEffectToTimeline";
import { extractAudioFromVideoClip } from "../media/extractAudio";
import {
  addTextToTimeline,
  addTextTemplateToTimeline,
  TEXT_DRAG_MIME,
  TEXT_TEMPLATE_DRAG_MIME,
  type TextPresetId,
} from "../media/addTextToTimeline";
import {
  applyOrPlaceFilter,
  FILTER_DRAG_MIME,
} from "../media/applyFilter";
import {
  attachTransitionPreset,
  TRANSITION_DRAG_MIME,
} from "../media/attachTransition";
import { listKeyedAnimatablePaths } from "../engine/animatable";
import type { Clip, Track, TrackType } from "../project/types";
import {
  canCmdFreezeFrame,
  cmdCopy,
  cmdFreezeFrame,
  cmdPaste,
  cmdRippleDelete,
  cmdRedo,
  cmdSplit,
  cmdUndo,
} from "../shortcuts/commands";
import {
  findClip,
  frameDurationMs,
  TIMELINE_PX_PER_SEC_MAX,
  TIMELINE_PX_PER_SEC_MIN,
  useEditorStore,
} from "../store/editorStore";
import { stickerDisplayName } from "../stickers/manifest";
import { CaptionCueBandsClip } from "../timeline/CaptionCueBandsClip";
import { FilmstripClip } from "../timeline/FilmstripClip";
import { OverlayLabelClip } from "../timeline/OverlayLabelClip";
import {
  ClipContextMenu,
  type ClipContextMenuState,
} from "../timeline/ClipContextMenu";
import {
  keyframeDrawerExtraHeight,
  TimelineKeyframeDrawer,
} from "../timeline/TimelineKeyframeDrawer";
import { TimelineSummaryKeyframes } from "../timeline/TimelineSummaryKeyframes";
import { WaveformClip } from "../timeline/WaveformClip";
import "./TimelinePanel.css";

const LANE_BASE_HEIGHT = 40;
const LANE_COMPACT_HEIGHT = 24;
const CLIP_TOP = 4;
const CLIP_HEIGHT = 32;
const CLIP_COMPACT_HEIGHT = 18;

const TRACK_SWATCH: Record<TrackType, string> = {
  video: "var(--track-video)",
  overlay: "var(--track-video)",
  audio: "var(--track-audio)",
  text: "var(--track-text)",
  caption: "var(--track-caption)",
  sticker: "var(--track-sticker)",
  effect: "var(--track-effect)",
  filter: "var(--track-effect)",
};

const TRACK_LABEL: Record<TrackType, string> = {
  video: "Video",
  overlay: "Overlay",
  audio: "Audio",
  text: "Text",
  caption: "Captions",
  sticker: "Stickers",
  effect: "Effects",
  filter: "Filters",
};

/** Text / stickers / FX lanes are shorter than A/V. */
function isCompactTrack(type: TrackType): boolean {
  return (
    type === "text" ||
    type === "caption" ||
    type === "sticker" ||
    type === "effect" ||
    type === "filter"
  );
}

type TrackTypeIcon = ComponentType<{ size?: number; className?: string }>;

const TRACK_TYPE_ICON: Record<TrackType, TrackTypeIcon> = {
  video: IconTrackVideo,
  overlay: IconTrackVideo,
  audio: IconTrackAudio,
  text: IconText,
  caption: IconTrackCaption,
  sticker: IconTrackSticker,
  effect: IconEffects,
  filter: IconFilters,
};

const MOVE_THRESHOLD_PX = 4;

type DragMode =
  | { kind: "scrub" }
  | {
      kind: "marquee-pending";
      originClientX: number;
      originClientY: number;
      additive: boolean;
    }
  | {
      kind: "marquee";
      originClientX: number;
      originClientY: number;
      additive: boolean;
      /** Selection captured when the marquee started (for additive union). */
      baseSelectedIds: string[];
    }
  | {
      kind: "move-pending";
      clipId: string;
      trackId: string;
      originStartMs: number;
      originClientX: number;
      originClientY: number;
      locked: boolean;
      /** Other multi-selected clips dragged with the primary. */
      peerClipIds: string[];
    }
  | {
      kind: "move";
      clipId: string;
      originStartMs: number;
      originClientX: number;
      originClientY: number;
      /** Other multi-selected clips dragged with the primary. */
      peerClipIds: string[];
      /** Stable spill lane id for busy-target cross-lane drags. */
      spillTrackId?: string;
      /** Origin track the spill lane sits beside. */
      spillBesideTrackId?: string;
    }
  | {
      kind: "trim";
      clipId: string;
      edge: "left" | "right";
    }
  | {
      kind: "transition-resize";
      incomingId: string;
      originDurationMs: number;
      originClientX: number;
      /** +1 expands when dragging right; -1 when dragging left handle outward. */
      edgeSign: 1 | -1;
    };

type MarqueeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function normalizeClientRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

/** Whether a clip may be moved onto a destination track (type rules). */
function clipCanRelaneTo(
  clip: Clip,
  from: Track,
  to: Track,
): boolean {
  if (to.locked) return false;
  const avOk =
    isVisualAvTrack(from.type) &&
    isVisualAvTrack(to.type) &&
    (clip.kind === "video" || clip.kind === "image");
  const textOk =
    from.type === "text" && to.type === "text" && clip.kind === "text";
  const captionOk =
    from.type === "caption" &&
    to.type === "caption" &&
    clip.kind === "caption";
  const stickerOk =
    from.type === "sticker" &&
    to.type === "sticker" &&
    clip.kind === "sticker";
  const effectOk =
    from.type === "effect" && to.type === "effect" && clip.kind === "effect";
  const filterOk =
    from.type === "filter" && to.type === "filter" && clip.kind === "filter";
  const audioOk =
    from.type === "audio" && to.type === "audio" && clip.kind === "audio";
  return (
    avOk || textOk || captionOk || stickerOk || effectOk || filterOk || audioOk
  );
}

export function TimelinePanel() {
  const tracks = useEditorStore((s) => s.project.tracks);
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const fps = useEditorStore((s) => s.project.fps);
  const mediaIndex = useEditorStore((s) => s.project.mediaIndex);
  const projectPath = useEditorStore((s) => s.project.projectPath);
  const editorTool = useEditorStore((s) => s.editorTool);
  const setEditorTool = useEditorStore((s) => s.setEditorTool);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const selectedClipIdSet = useMemo(
    () => new Set(selectedClipIds),
    [selectedClipIds],
  );
  const selectedTransitionId = useEditorStore((s) => s.selectedTransitionId);
  const expandedKeyframeClipId = useEditorStore(
    (s) => s.expandedKeyframeClipId,
  );
  const keyframeDrawerMode = useEditorStore((s) => s.keyframeDrawerMode);
  const setExpandedKeyframeClipId = useEditorStore(
    (s) => s.setExpandedKeyframeClipId,
  );
  const pxPerSec = useEditorStore((s) => s.timelinePxPerSec);
  const magnetEnabled = useEditorStore((s) => s.magnetEnabled);
  const mainTrackMagnetEnabled = useEditorStore(
    (s) => s.mainTrackMagnetEnabled,
  );
  const history = useEditorStore((s) => s.history);

  const selectClip = useEditorStore((s) => s.selectClip);
  const toggleClipSelection = useEditorStore((s) => s.toggleClipSelection);
  const setSelectedClipIds = useEditorStore((s) => s.setSelectedClipIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const selectTransition = useEditorStore((s) => s.selectTransition);
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setScrubbing = useEditorStore((s) => s.setScrubbing);
  const setTimelinePxPerSec = useEditorStore((s) => s.setTimelinePxPerSec);
  const toggleMagnet = useEditorStore((s) => s.toggleMagnet);
  const toggleMainTrackMagnet = useEditorStore((s) => s.toggleMainTrackMagnet);
  const setRecordDialogOpen = useEditorStore((s) => s.setRecordDialogOpen);
  const recordDialogOpen = useEditorStore((s) => s.recordDialogOpen);
  const setCropDialogOpen = useEditorStore((s) => s.setCropDialogOpen);
  const commitTracks = useEditorStore((s) => s.commitTracks);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );

  /** Vertical scroller for track lanes (synced with headers). */
  const lanesRef = useRef<HTMLDivElement>(null);
  /** Horizontal scroller nested inside the vertical lanes scroller. */
  const lanesHRef = useRef<HTMLDivElement>(null);
  const lanesInnerRef = useRef<HTMLDivElement>(null);
  const headersScrollRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const rulerInnerRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const dragRef = useRef<DragMode | null>(null);
  const originTracksRef = useRef<Track[] | null>(null);
  const liveTracksRef = useRef<Track[] | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{
    clientX: number;
    clientY: number;
  } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [snapGuideMs, setSnapGuideMs] = useState<number | null>(null);
  const [clipMenu, setClipMenu] = useState<ClipContextMenuState | null>(null);
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [extractBusy, setExtractBusy] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const selected = selectedClipId ? findClip(tracks, selectedClipId) : null;
  const canCrop =
    !!selected &&
    (selected.clip.kind === "video" || selected.clip.kind === "image") &&
    !selected.track.locked;

  const contentDurationMs = timelineDurationMs(tracks);
  const durationMs = Math.max(contentDurationMs, 60_000);
  const laneWidthPx = (durationMs / 1000) * pxPerSec;
  const playheadPx = (playheadMs / 1000) * pxPerSec;
  const tickStepSec = pxPerSec >= 80 ? 1 : pxPerSec >= 40 ? 5 : 10;
  const tickCount = Math.ceil(durationMs / 1000 / tickStepSec) + 1;
  const minFrame = frameDurationMs(fps);

  const viewStartMs = (scrollLeft / pxPerSec) * 1000;
  const viewEndMs = ((scrollLeft + viewportWidth) / pxPerSec) * 1000;

  const mediaById = useMemo(() => {
    return new Map(mediaIndex.map((m) => [m.id, m]));
  }, [mediaIndex]);

  const transitionMarkers = useMemo(
    () => listTransitionMarkers(tracks),
    [tracks],
  );

  const msFromClientX = useCallback(
    (clientX: number) => {
      // Prefer lanes; fall back to ruler (same scroll-synced time axis).
      const el = lanesInnerRef.current ?? rulerInnerRef.current;
      if (!el) return 0;
      const x = clientX - el.getBoundingClientRect().left;
      return Math.max(0, (x / pxPerSec) * 1000);
    },
    [pxPerSec],
  );

  const onLanesVerticalScroll = () => {
    const el = lanesRef.current;
    if (!el || syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    const headers = headersScrollRef.current;
    if (headers && headers.scrollTop !== el.scrollTop) {
      headers.scrollTop = el.scrollTop;
    }
    syncingScrollRef.current = false;
  };

  const onLanesHorizontalScroll = () => {
    const el = lanesHRef.current;
    if (!el) return;
    setScrollLeft(el.scrollLeft);
    setViewportWidth(el.clientWidth);
    if (syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    const ruler = rulerScrollRef.current;
    if (ruler && ruler.scrollLeft !== el.scrollLeft) {
      ruler.scrollLeft = el.scrollLeft;
    }
    syncingScrollRef.current = false;
  };

  const onRulerScroll = () => {
    const ruler = rulerScrollRef.current;
    const lanes = lanesHRef.current;
    if (!ruler || !lanes) return;
    setScrollLeft(ruler.scrollLeft);
    if (syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    if (lanes.scrollLeft !== ruler.scrollLeft) {
      lanes.scrollLeft = ruler.scrollLeft;
    }
    syncingScrollRef.current = false;
  };

  const onHeadersScroll = () => {
    const headers = headersScrollRef.current;
    const lanes = lanesRef.current;
    if (!headers || !lanes || syncingScrollRef.current) return;
    syncingScrollRef.current = true;
    if (lanes.scrollTop !== headers.scrollTop) {
      lanes.scrollTop = headers.scrollTop;
    }
    syncingScrollRef.current = false;
  };

  // Keep viewport width current when the panel resizes (not only on scroll).
  useEffect(() => {
    const el = lanesHRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setViewportWidth(el.clientWidth);
    });
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const applyLiveTracks = (next: Track[]) => {
    liveTracksRef.current = next;
    useEditorStore.setState((s) => ({
      project: { ...s.project, tracks: next },
    }));
  };

  const endDrag = useCallback(() => {
    if (moveRafRef.current != null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
    pendingMoveRef.current = null;
    const mode = dragRef.current;
    dragRef.current = null;
    setSnapGuideMs(null);
    setMarqueeRect(null);
    if (mode?.kind === "scrub") {
      setScrubbing(false);
    }
    if (
      (mode?.kind === "move" ||
        mode?.kind === "trim" ||
        mode?.kind === "transition-resize") &&
      originTracksRef.current &&
      liveTracksRef.current
    ) {
      const label =
        mode.kind === "move"
          ? "Move clip"
          : mode.kind === "trim"
            ? "Trim clip"
            : "Resize transition";
      commitTracksTransition(
        originTracksRef.current,
        liveTracksRef.current,
        label,
      );
    }
    originTracksRef.current = null;
    liveTracksRef.current = null;
  }, [commitTracksTransition, setScrubbing]);

  const captureLane = (pointerId: number) => {
    lanesInnerRef.current?.setPointerCapture(pointerId);
  };

  const beginScrub = (
    e: ReactPointerEvent<HTMLElement>,
    captureEl: HTMLElement | null,
  ) => {
    e.preventDefault();
    dragRef.current = { kind: "scrub" };
    setPlaying(false);
    setScrubbing(true);
    setPlayheadMs(msFromClientX(e.clientX));
    captureEl?.setPointerCapture(e.pointerId);
  };

  const onPointerDownRuler = (e: ReactPointerEvent<HTMLDivElement>) => {
    beginScrub(e, rulerInnerRef.current);
  };

  const onPointerDownLane = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(".timeline-panel__clip") ||
      target.closest(".timeline-panel__transition")
    ) {
      return;
    }

    // Empty-lane: pending marquee; click (no drag) moves the playhead on up.
    e.preventDefault();
    setPlaying(false);
    setClipMenu(null);
    dragRef.current = {
      kind: "marquee-pending",
      originClientX: e.clientX,
      originClientY: e.clientY,
      additive: e.metaKey || e.ctrlKey,
    };
    captureLane(e.pointerId);
  };

  const clientRectToLocalMarquee = (
    client: { left: number; top: number; right: number; bottom: number },
  ): MarqueeRect | null => {
    const root = lanesInnerRef.current;
    if (!root) return null;
    const rootRect = root.getBoundingClientRect();
    return {
      left: client.left - rootRect.left,
      top: client.top - rootRect.top,
      width: Math.max(0, client.right - client.left),
      height: Math.max(0, client.bottom - client.top),
    };
  };

  const clipsIntersectingMarquee = (
    client: { left: number; top: number; right: number; bottom: number },
  ): string[] => {
    const root = lanesInnerRef.current;
    if (!root) return [];
    const rootRect = root.getBoundingClientRect();
    const lanes = root.querySelectorAll<HTMLElement>("[data-track-id]");
    const hit: string[] = [];

    for (const lane of lanes) {
      const trackId = lane.dataset.trackId;
      if (!trackId) continue;
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.hidden) continue;

      const laneRect = lane.getBoundingClientRect();
      const parsed = Number(lane.dataset.laneBarHeight);
      const barH =
        Number.isFinite(parsed) && parsed > 0 ? parsed : laneRect.height;
      const clipH =
        barH <= LANE_COMPACT_HEIGHT ? CLIP_COMPACT_HEIGHT : CLIP_HEIGHT;
      const clipTop = laneRect.top + CLIP_TOP;
      const clipBottom = clipTop + clipH;

      for (const clip of track.clips) {
        const left =
          rootRect.left + (clip.startMs / 1000) * pxPerSec;
        const right =
          rootRect.left +
          ((clip.startMs + clip.durationMs) / 1000) * pxPerSec;
        if (
          rectsIntersect(client, {
            left,
            top: clipTop,
            right,
            bottom: clipBottom,
          })
        ) {
          hit.push(clip.id);
        }
      }
    }
    return hit;
  };

  const applyMarqueeHits = (
    mode: Extract<DragMode, { kind: "marquee" }>,
    clientX: number,
    clientY: number,
  ) => {
    const client = normalizeClientRect(
      mode.originClientX,
      mode.originClientY,
      clientX,
      clientY,
    );
    setMarqueeRect(clientRectToLocalMarquee(client));
    const hits = clipsIntersectingMarquee(client);
    if (mode.additive) {
      const merged = [...mode.baseSelectedIds];
      const seen = new Set(merged);
      for (const id of hits) {
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push(id);
      }
      setSelectedClipIds(merged, hits[hits.length - 1] ?? merged[merged.length - 1] ?? null);
    } else if (hits.length === 0) {
      clearSelection();
    } else {
      setSelectedClipIds(hits, hits[hits.length - 1]!);
    }
  };

  const onContextMenuLane = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(".timeline-panel__clip") ||
      target.closest(".timeline-panel__transition") ||
      target.closest(".timeline-clip-menu")
    ) {
      return;
    }
    e.preventDefault();
    const store = useEditorStore.getState();
    setClipMenu({
      clipId: "",
      trackId: "",
      x: e.clientX,
      y: e.clientY,
      hasKeyframes: false,
      canFreeze: false,
      canExtract: false,
      canReverse: false,
      reverseMode: "with-audio",
      canCopy: false,
      canPaste: store.clipboard.length > 0,
      pasteOnly: true,
    });
  };

  const processPointerMoveLane = (clientX: number, clientY: number) => {
    const mode = dragRef.current;
    if (!mode) return;

    if (mode.kind === "scrub") {
      setPlayheadMs(msFromClientX(clientX));
      return;
    }

    // Empty-lane: pending click → marquee after a small drag threshold.
    if (mode.kind === "marquee-pending") {
      const dx = clientX - mode.originClientX;
      const dy = clientY - mode.originClientY;
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;
      const next: Extract<DragMode, { kind: "marquee" }> = {
        kind: "marquee",
        originClientX: mode.originClientX,
        originClientY: mode.originClientY,
        additive: mode.additive,
        baseSelectedIds: mode.additive
          ? [...useEditorStore.getState().selectedClipIds]
          : [],
      };
      dragRef.current = next;
      applyMarqueeHits(next, clientX, clientY);
      return;
    }

    if (mode.kind === "marquee") {
      applyMarqueeHits(mode, clientX, clientY);
      return;
    }

    // Promote pending click → move after a small drag threshold (X or Y).
    if (mode.kind === "move-pending") {
      if (mode.locked) return;
      const dx = clientX - mode.originClientX;
      const dy = clientY - mode.originClientY;
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;
      originTracksRef.current = structuredClone(
        useEditorStore.getState().project.tracks,
      );
      liveTracksRef.current = null;
      dragRef.current = {
        kind: "move",
        clipId: mode.clipId,
        originStartMs: mode.originStartMs,
        originClientX: mode.originClientX,
        originClientY: mode.originClientY,
        peerClipIds: mode.peerClipIds,
      };
    }

    const active = dragRef.current;
    if (!active) return;
    const origin = originTracksRef.current;
    if (!origin) return;

    if (active.kind === "move") {
      const deltaPx = clientX - active.originClientX;
      const deltaMs = (deltaPx / pxPerSec) * 1000;
      const hoverTrackId = trackIdAtClientY(clientY);
      const originClip = origin
        .flatMap((t) => t.clips.map((c) => ({ t, c })))
        .find((x) => x.c.id === active.clipId);

      let targetTrackId: string | undefined;
      let intentionalLaneMove = false;

      if (hoverTrackId && originClip) {
        // Pointer over the live spill lane — keep aiming at the beside track.
        if (
          active.spillTrackId &&
          hoverTrackId === active.spillTrackId &&
          active.spillBesideTrackId
        ) {
          targetTrackId = active.spillBesideTrackId;
          intentionalLaneMove = true;
        } else {
          const hover = origin.find((t) => t.id === hoverTrackId);
          if (
            hover &&
            clipCanRelaneTo(originClip.c, originClip.t, hover)
          ) {
            targetTrackId = hoverTrackId;
            intentionalLaneMove = hoverTrackId !== originClip.t.id;
          }
        }
      }

      const result = moveClip({
        tracks: origin,
        clipId: active.clipId,
        startMs: active.originStartMs + deltaMs,
        playheadMs,
        magnetEnabled,
        pxPerSec,
        targetTrackId,
        intentionalLaneMove,
        spillTrackId: active.spillTrackId,
        spillBesideTrackId: active.spillBesideTrackId,
        peerClipIds: active.peerClipIds,
      });
      if (result) {
        setSnapGuideMs(result.snapGuideMs);
        applyLiveTracks(result.tracks);
        if (result.usedSpillTrackId) {
          dragRef.current = {
            ...active,
            spillTrackId: result.usedSpillTrackId,
            spillBesideTrackId:
              targetTrackId && targetTrackId !== result.usedSpillTrackId
                ? targetTrackId
                : active.spillBesideTrackId,
          };
        } else if (active.spillTrackId) {
          // Landed on a free origin lane — drop spill cache.
          dragRef.current = {
            ...active,
            spillTrackId: undefined,
            spillBesideTrackId: undefined,
          };
        }
      }
      return;
    }

    if (active.kind === "trim") {
      const originClip = origin
        .flatMap((t) => t.clips)
        .find((c) => c.id === active.clipId);
      const mediaDur = originClip?.mediaId
        ? mediaById.get(originClip.mediaId)?.durationMs
        : undefined;
      const result = trimClipEdge({
        tracks: origin,
        clipId: active.clipId,
        edge: active.edge,
        globalMs: msFromClientX(clientX),
        playheadMs,
        magnetEnabled,
        pxPerSec,
        minDurationMs: minFrame,
        mediaDurationMs: mediaDur,
      });
      if (result) {
        setSnapGuideMs(result.snapGuideMs);
        applyLiveTracks(result.tracks);
      }
      return;
    }

    if (active.kind === "transition-resize") {
      const deltaPx = clientX - active.originClientX;
      const deltaMs = (deltaPx / pxPerSec) * 1000 * active.edgeSign;
      const next = resizeTransitionDuration(
        origin,
        active.incomingId,
        active.originDurationMs + deltaMs * 2,
      );
      if (next) applyLiveTracks(next);
    }
  };

  const onPointerMoveLane = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    if (dragRef.current.kind === "scrub") {
      processPointerMoveLane(e.clientX, e.clientY);
      return;
    }
    pendingMoveRef.current = { clientX: e.clientX, clientY: e.clientY };
    if (moveRafRef.current != null) return;
    moveRafRef.current = requestAnimationFrame(() => {
      moveRafRef.current = null;
      const pending = pendingMoveRef.current;
      pendingMoveRef.current = null;
      if (pending) processPointerMoveLane(pending.clientX, pending.clientY);
    });
  };

  const onPointerUpLane = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    // Flush coalesced move so the drop matches the last pointer position.
    if (moveRafRef.current != null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (
      pending &&
      dragRef.current.kind !== "scrub" &&
      dragRef.current.kind !== "move-pending" &&
      dragRef.current.kind !== "marquee-pending"
    ) {
      processPointerMoveLane(pending.clientX, pending.clientY);
    }

    if (dragRef.current.kind === "scrub") {
      setPlayheadMs(msFromClientX(e.clientX));
    }

    // Empty-lane click (no drag): move playhead; clear selection unless additive.
    if (dragRef.current.kind === "marquee-pending") {
      const additive = dragRef.current.additive;
      setPlayheadMs(msFromClientX(e.clientX));
      if (!additive) clearSelection();
      dragRef.current = null;
      setMarqueeRect(null);
      setSnapGuideMs(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    // Marquee finished — selection already applied live during drag.
    if (dragRef.current.kind === "marquee") {
      dragRef.current = null;
      setMarqueeRect(null);
      setSnapGuideMs(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    // Click-only on a clip: keep selection; do not treat as a move commit.
    if (dragRef.current.kind === "move-pending") {
      dragRef.current = null;
      originTracksRef.current = null;
      liveTracksRef.current = null;
      setSnapGuideMs(null);
    } else {
      endDrag();
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const selectClipsInTrackRange = (
    track: Track,
    fromId: string,
    toId: string,
  ) => {
    const ordered = [...track.clips].sort((a, b) => a.startMs - b.startMs);
    const i = ordered.findIndex((c) => c.id === fromId);
    const j = ordered.findIndex((c) => c.id === toId);
    if (i < 0 || j < 0) {
      selectClip(toId, track.id);
      return;
    }
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    const ids = ordered.slice(lo, hi + 1).map((c) => c.id);
    setSelectedClipIds(ids, toId);
  };

  const startClipPointer = (
    e: ReactPointerEvent,
    clip: Clip,
    track: Track,
  ) => {
    // Ignore right/middle click so the clip context menu can open.
    if (e.button !== 0) return;
    e.stopPropagation();
    setPlaying(false);

    if (useEditorStore.getState().editorTool === "blade") {
      if (track.locked) return;
      selectClip(clip.id, track.id);
      const clickMs = msFromClientX(e.clientX);
      setPlayheadMs(clickMs);
      const result = splitClipAt({
        tracks: useEditorStore.getState().project.tracks,
        clipId: clip.id,
        globalMs: clickMs,
        minDurationMs: 1000 / Math.max(1, useEditorStore.getState().project.fps),
      });
      if (result) {
        commitTracks(result.tracks, "Blade split", {
          clipId: result.rightClipId,
        });
        selectClip(result.rightClipId);
      }
      useEditorStore.getState().setEditorTool("select");
      return;
    }

    const additive = e.metaKey || e.ctrlKey;
    const range = e.shiftKey;
    const store = useEditorStore.getState();
    const alreadySelected = store.selectedClipIds.includes(clip.id);

    if (additive) {
      toggleClipSelection(clip.id, track.id);
      return;
    }
    if (range && store.selectedClipId) {
      const anchorTrack =
        store.selectedTrackId != null
          ? store.project.tracks.find((t) => t.id === store.selectedTrackId)
          : null;
      if (anchorTrack && anchorTrack.id === track.id) {
        selectClipsInTrackRange(track, store.selectedClipId, clip.id);
      } else {
        selectClip(clip.id, track.id);
      }
      return;
    }

    if (!alreadySelected) {
      selectClip(clip.id, track.id);
    }

    originTracksRef.current = null;
    liveTracksRef.current = null;
    dragRef.current = {
      kind: "move-pending",
      clipId: clip.id,
      trackId: track.id,
      originStartMs: clip.startMs,
      originClientX: e.clientX,
      originClientY: e.clientY,
      locked: track.locked,
      peerClipIds: alreadySelected
        ? store.selectedClipIds.filter((id) => id !== clip.id)
        : [],
    };
    captureLane(e.pointerId);
  };

  const startTrim = (
    e: ReactPointerEvent,
    clip: Clip,
    track: Track,
  ) => {
    if (e.button !== 0) return;
    if (track.locked) return;
    e.stopPropagation();
    selectClip(clip.id, track.id);
    setPlaying(false);
    originTracksRef.current = structuredClone(
      useEditorStore.getState().project.tracks,
    );
    liveTracksRef.current = null;
    const edge =
      (e.currentTarget as HTMLElement).classList.contains(
        "timeline-panel__trim--left",
      )
        ? "left"
        : "right";
    dragRef.current = { kind: "trim", clipId: clip.id, edge };
    captureLane(e.pointerId);
  };

  const startTransitionResize = (
    e: ReactPointerEvent,
    marker: TransitionMarker,
    edge: "left" | "right",
  ) => {
    const track = tracks.find((t) => t.id === marker.trackId);
    if (!track || track.locked) return;
    e.stopPropagation();
    e.preventDefault();
    selectTransition(marker.incomingId, marker.trackId);
    setPlaying(false);
    originTracksRef.current = structuredClone(
      useEditorStore.getState().project.tracks,
    );
    liveTracksRef.current = null;
    dragRef.current = {
      kind: "transition-resize",
      incomingId: marker.incomingId,
      originDurationMs: marker.durationMs,
      originClientX: e.clientX,
      // Dragging the left handle left (negative delta) should expand duration.
      edgeSign: edge === "left" ? -1 : 1,
    };
    captureLane(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      setTimelinePxPerSec(pxPerSec * factor);
    }
  };

  const toggleFlag = (
    trackId: string,
    flag: "locked" | "hidden" | "muted" | "solo",
    current: boolean,
  ) => {
    const next = setTrackFlags(tracks, trackId, { [flag]: !current });
    commitTracks(next, `Toggle ${flag}`);
  };

  /**
   * Nearest clip-bar lane under client Y (ignores keyframe drawer height).
   * Always returns the closest lane so cross-lane aiming stays snappy at edges.
   */
  const trackIdAtClientY = (clientY: number): string | null => {
    const root = lanesInnerRef.current;
    if (!root) return null;
    const originIds = originTracksRef.current
      ? new Set(originTracksRef.current.map((t) => t.id))
      : null;
    const spillId =
      dragRef.current?.kind === "move"
        ? dragRef.current.spillTrackId
        : undefined;
    const lanes = root.querySelectorAll<HTMLElement>("[data-track-id]");
    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const lane of lanes) {
      const id = lane.dataset.trackId;
      if (!id) continue;
      // Prefer origin lanes; still allow the live spill lane so hover sticks.
      if (originIds && !originIds.has(id) && id !== spillId) continue;
      const rect = lane.getBoundingClientRect();
      const parsed = Number(lane.dataset.laneBarHeight);
      const barH =
        Number.isFinite(parsed) && parsed > 0 ? parsed : rect.height;
      const center = rect.top + barH / 2;
      const dist = Math.abs(clientY - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return bestId;
  };

  return (
    <div className="timeline-panel" onWheel={onWheel}>
      <div className="timeline-panel__toolbar">
        <div className="timeline-panel__tools">
          <ToolButton
            label="Select (A)"
            active={editorTool === "select"}
            onClick={() => setEditorTool("select")}
          >
            <IconSelect />
          </ToolButton>
          <ToolButton
            label="Blade (B)"
            active={editorTool === "blade"}
            onClick={() => setEditorTool("blade")}
          >
            <IconBlade />
          </ToolButton>
          <ToolButton
            label="Split"
            disabled={!selectedClipId}
            onClick={() => cmdSplit()}
          >
            <IconSplit />
          </ToolButton>
          <span className="timeline-panel__sep" />
          <ToolButton
            label="Undo"
            disabled={history.undoStack.length === 0}
            onClick={() => cmdUndo()}
          >
            <IconUndo />
          </ToolButton>
          <ToolButton
            label="Redo"
            disabled={history.redoStack.length === 0}
            onClick={() => cmdRedo()}
          >
            <IconRedo />
          </ToolButton>
          <span className="timeline-panel__sep" />
          <ToolButton
            label="Delete"
            disabled={!selectedClipId && !selectedTransitionId}
            onClick={() => cmdRippleDelete()}
          >
            <IconTrash />
          </ToolButton>
          <span className="timeline-panel__sep" />
          <ToolButton
            label="Auto snapping"
            active={magnetEnabled}
            onClick={() => toggleMagnet()}
          >
            <IconMagnet />
          </ToolButton>
          <ToolButton
            label="Auto magnet"
            title="Auto magnet (main track only)"
            active={mainTrackMagnetEnabled}
            onClick={() => toggleMainTrackMagnet()}
          >
            <IconMainTrackMagnet />
          </ToolButton>
          <ToolButton
            label="Freeze frame"
            disabled={freezeBusy || !canCmdFreezeFrame()}
            onClick={() => {
              if (freezeBusy) return;
              setFreezeBusy(true);
              void cmdFreezeFrame()
                .catch((err) => {
                  console.error("Freeze frame failed", err);
                })
                .finally(() => setFreezeBusy(false));
            }}
          >
            <IconFreeze />
          </ToolButton>
          <span className="timeline-panel__sep" />
          <ToolButton
            label="Record voiceover"
            active={recordDialogOpen}
            onClick={() => setRecordDialogOpen(true)}
          >
            <IconMic />
          </ToolButton>
        </div>
        <div className="timeline-panel__zoom">
          <ToolButton
            label="Crop"
            disabled={!canCrop}
            onClick={() => setCropDialogOpen(true)}
          >
            <IconCrop size={14} />
          </ToolButton>
          <span className="timeline-panel__sep" />
          <span className="timeline-panel__zoom-label">Zoom</span>
          <input
            type="range"
            className="timeline-panel__zoom-slider"
            min={TIMELINE_PX_PER_SEC_MIN}
            max={TIMELINE_PX_PER_SEC_MAX}
            step={1}
            value={pxPerSec}
            onChange={(e) => setTimelinePxPerSec(Number(e.target.value))}
            aria-label="Timeline zoom"
          />
        </div>
      </div>

      <div className="timeline-panel__workspace">
        <div className="timeline-panel__corner" aria-hidden />

        <div
          ref={rulerScrollRef}
          className="timeline-panel__ruler-scroll"
          onScroll={onRulerScroll}
        >
          <div
            ref={rulerInnerRef}
            className="timeline-panel__ruler"
            style={{ width: Math.max(laneWidthPx, 480) }}
            role="slider"
            aria-label="Timeline playhead"
            aria-valuemin={0}
            aria-valuemax={Math.round(durationMs)}
            aria-valuenow={Math.round(playheadMs)}
            aria-valuetext={formatTick(playheadMs / 1000)}
            tabIndex={0}
            onPointerDown={onPointerDownRuler}
            onPointerMove={onPointerMoveLane}
            onPointerUp={onPointerUpLane}
            onPointerCancel={onPointerUpLane}
            onKeyDown={(e) => {
              const step = e.shiftKey ? minFrame * 10 : minFrame;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setPlayheadMs(Math.max(0, playheadMs - step));
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setPlayheadMs(playheadMs + step);
              } else if (e.key === "Home") {
                e.preventDefault();
                setPlayheadMs(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setPlayheadMs(contentDurationMs);
              }
            }}
          >
            {Array.from({ length: tickCount }, (_, i) => (
              <span
                key={i}
                className="timeline-panel__tick"
                style={{ left: i * tickStepSec * pxPerSec }}
              >
                {formatTick(i * tickStepSec)}
              </span>
            ))}
            <div
              className="timeline-panel__ruler-playhead"
              style={{ left: playheadPx }}
              aria-hidden
            />
          </div>
        </div>

        <div
          ref={headersScrollRef}
          className="timeline-panel__headers"
          onScroll={onHeadersScroll}
        >
          <div className="timeline-panel__headers-inner">
            {tracks.map((track) => {
              const TypeIcon = TRACK_TYPE_ICON[track.type];
              const compact = isCompactTrack(track.type);
              const expandedClip = track.clips.find(
                (c) => c.id === expandedKeyframeClipId,
              );
              const drawerExtra = expandedClip
                ? keyframeDrawerExtraHeight(expandedClip, keyframeDrawerMode)
                : 0;
              const baseH = compact ? LANE_COMPACT_HEIGHT : LANE_BASE_HEIGHT;
              return (
                <div
                  key={track.id}
                  className={[
                    "timeline-panel__track-header",
                    compact ? "timeline-panel__track-header--compact" : "",
                    track.locked ? "timeline-panel__track-header--locked" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={
                    drawerExtra > 0
                      ? { height: baseH + drawerExtra }
                      : undefined
                  }
                  title={TRACK_LABEL[track.type]}
                >
                  <div className="timeline-panel__track-header-row">
                    <span
                      className="timeline-panel__track-type"
                      style={{ color: TRACK_SWATCH[track.type] }}
                      aria-label={TRACK_LABEL[track.type]}
                    >
                      <TypeIcon size={14} />
                    </span>
                    <div className="timeline-panel__track-flags">
                      <HeaderFlag
                        label={track.locked ? "Unlock" : "Lock"}
                        active={track.locked}
                        onClick={() =>
                          toggleFlag(track.id, "locked", track.locked)
                        }
                      >
                        <IconLock size={12} />
                      </HeaderFlag>
                      <HeaderFlag
                        label={track.hidden ? "Show" : "Hide"}
                        active={track.hidden}
                        onClick={() =>
                          toggleFlag(track.id, "hidden", track.hidden)
                        }
                      >
                        <IconEye size={12} />
                      </HeaderFlag>
                      <HeaderFlag
                        label={track.muted ? "Unmute" : "Mute"}
                        active={Boolean(track.muted)}
                        onClick={() =>
                          toggleFlag(track.id, "muted", Boolean(track.muted))
                        }
                      >
                        <IconMute size={12} />
                      </HeaderFlag>
                      <HeaderFlag
                        label={track.solo ? "Unsolo" : "Solo"}
                        active={Boolean(track.solo)}
                        onClick={() =>
                          toggleFlag(track.id, "solo", Boolean(track.solo))
                        }
                      >
                        <IconSolo size={12} />
                      </HeaderFlag>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          ref={lanesRef}
          className="timeline-panel__lanes"
          onScroll={onLanesVerticalScroll}
          onDragOver={(e: DragEvent) => {
            const types = e.dataTransfer.types;
            if (
              types.includes(MEDIA_DRAG_MIME) ||
              types.includes(SOUND_EFFECT_DRAG_MIME) ||
              types.includes(TEXT_DRAG_MIME) ||
              types.includes(TEXT_TEMPLATE_DRAG_MIME) ||
              types.includes(STICKER_DRAG_MIME) ||
              types.includes(EFFECT_DRAG_MIME) ||
              types.includes(FILTER_DRAG_MIME) ||
              types.includes(TRANSITION_DRAG_MIME)
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            const target = (e.target as HTMLElement).closest(
              "[data-track-id]",
            ) as HTMLElement | null;
            const trackId = target?.dataset.trackId;
            const mediaId = e.dataTransfer.getData(MEDIA_DRAG_MIME);
            if (mediaId) {
              addMediaToTimeline(mediaId, trackId);
              return;
            }
            const sfxId = e.dataTransfer.getData(SOUND_EFFECT_DRAG_MIME);
            if (sfxId) {
              void addSoundEffectToTimeline(sfxId, trackId);
              return;
            }
            const textPreset = e.dataTransfer.getData(TEXT_DRAG_MIME);
            if (textPreset) {
              addTextToTimeline(textPreset as TextPresetId, trackId);
              return;
            }
            const textTemplateId = e.dataTransfer.getData(TEXT_TEMPLATE_DRAG_MIME);
            if (textTemplateId) {
              addTextTemplateToTimeline(textTemplateId, trackId);
              return;
            }
            const stickerId = e.dataTransfer.getData(STICKER_DRAG_MIME);
            if (stickerId) {
              void addStickerToTimeline(stickerId, trackId);
              return;
            }
            const effectId = e.dataTransfer.getData(EFFECT_DRAG_MIME);
            if (effectId) {
              void addEffectToTimeline(effectId, trackId);
              return;
            }
            const filterId = e.dataTransfer.getData(FILTER_DRAG_MIME);
            if (filterId) {
              void applyOrPlaceFilter(filterId, trackId);
              return;
            }
            const transitionId = e.dataTransfer.getData(TRANSITION_DRAG_MIME);
            if (transitionId) {
              void attachTransitionPreset(transitionId, {
                dropTrackId: trackId,
              });
            }
          }}
        >
          <div
            ref={lanesHRef}
            className="timeline-panel__lanes-h"
            onScroll={onLanesHorizontalScroll}
          >
            <div
              ref={lanesInnerRef}
              className="timeline-panel__lanes-inner"
              style={{ width: Math.max(laneWidthPx, 480) }}
              onPointerDown={onPointerDownLane}
              onPointerMove={onPointerMoveLane}
              onPointerUp={onPointerUpLane}
              onPointerCancel={onPointerUpLane}
              onContextMenu={onContextMenuLane}
            >
              <div
                className="timeline-panel__playhead"
                style={{ left: playheadPx }}
                aria-hidden
              />
              {snapGuideMs != null && (
                <div
                  className="timeline-panel__snap-guide"
                  style={{ left: (snapGuideMs / 1000) * pxPerSec }}
                  aria-hidden
                />
              )}
              {marqueeRect && (
                <div
                  className="timeline-panel__marquee"
                  style={{
                    left: marqueeRect.left,
                    top: marqueeRect.top,
                    width: marqueeRect.width,
                    height: marqueeRect.height,
                  }}
                  aria-hidden
                />
              )}
              {tracks.map((track) => {
              const compact = isCompactTrack(track.type);
              const expandedClip = track.clips.find(
                (c) => c.id === expandedKeyframeClipId,
              );
              const drawerExtra = expandedClip
                ? keyframeDrawerExtraHeight(expandedClip, keyframeDrawerMode)
                : 0;
              const baseH = compact ? LANE_COMPACT_HEIGHT : LANE_BASE_HEIGHT;
              const clipBarH = compact ? CLIP_COMPACT_HEIGHT : CLIP_HEIGHT;
              return (
              <div
                key={track.id}
                data-track-id={track.id}
                data-lane-bar-height={baseH}
                className={[
                  "timeline-panel__lane",
                  track.type === "audio"
                    ? "timeline-panel__lane--audio"
                    : "timeline-panel__lane--video",
                  compact ? "timeline-panel__lane--compact" : "",
                  track.hidden ? "timeline-panel__lane--hidden" : "",
                  track.locked ? "timeline-panel__lane--locked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  boxShadow: `inset 3px 0 0 ${TRACK_SWATCH[track.type]}`,
                  ...(drawerExtra > 0
                    ? { height: baseH + drawerExtra }
                    : {}),
                }}
              >
                {track.clips.map((clip) => {
                  const clipEnd = clip.startMs + clip.durationMs;
                  if (
                    clipEnd < viewStartMs - 500 ||
                    clip.startMs > viewEndMs + 500
                  ) {
                    return null;
                  }

                  const left = (clip.startMs / 1000) * pxPerSec;
                  const width = Math.max(
                    (clip.durationMs / 1000) * pxPerSec,
                    8,
                  );
                  const selected =
                    !selectedTransitionId && selectedClipIdSet.has(clip.id);
                  const asset = clip.mediaId
                    ? mediaById.get(clip.mediaId)
                    : undefined;
                  const visStart = Math.max(0, viewStartMs - clip.startMs);
                  const visEnd = Math.min(
                    clip.durationMs,
                    viewEndMs - clip.startMs,
                  );
                  const hasKeys = listKeyedAnimatablePaths(clip).length > 0;
                  const drawerOpen =
                    expandedKeyframeClipId === clip.id && hasKeys;
                  const clipClass = [
                    "timeline-panel__clip",
                    selected ? "timeline-panel__clip--selected" : "",
                    clip.linkedClipId ? "timeline-panel__clip--linked" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  const captionCueCount = clip.caption?.cues.length ?? 0;
                  const captionTitle =
                    captionCueCount === 0
                      ? "Captions"
                      : `Captions · ${captionCueCount} cue${captionCueCount === 1 ? "" : "s"}`;

                  return (
                    <Fragment key={clip.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      className={clipClass}
                      style={{
                        left,
                        width,
                        background: TRACK_SWATCH[track.type],
                      }}
                      title={
                        clip.kind === "text"
                          ? clip.text?.content || "Text"
                          : clip.kind === "caption"
                            ? captionTitle
                            : clip.kind === "sticker"
                              ? stickerDisplayName(clip.stickerId || "Sticker")
                              : clip.kind === "effect"
                                ? clip.effect?.effectId || "Effect"
                                : clip.kind === "filter"
                                  ? clip.filter?.lutId || "Filter"
                                  : clip.transition
                                    ? `${asset?.name ?? clip.kind} · ${clip.transition.presetId}`
                                    : (asset?.name ?? clip.kind)
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        // Selection is handled in pointerdown (supports multi-select).
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const store = useEditorStore.getState();
                        const inSelection = store.selectedClipIds.includes(
                          clip.id,
                        );
                        if (!inSelection) {
                          selectClip(clip.id, track.id);
                        }
                        setClipMenu({
                          clipId: clip.id,
                          trackId: track.id,
                          x: e.clientX,
                          y: e.clientY,
                          hasKeyframes: hasKeys,
                          canFreeze: canFreezeFrameAt({
                            tracks,
                            clipId: clip.id,
                            globalMs: playheadMs,
                            minDurationMs: minFrame,
                          }),
                          canExtract:
                            clip.kind === "video" &&
                            asset?.kind === "video" &&
                            asset.hasAudio !== false &&
                            !clip.muteAudio,
                          canReverse: clip.kind === "video",
                          reverseMode: reverseModeOf(clip),
                          canCopy: true,
                          canPaste: store.clipboard.length > 0,
                        });
                      }}
                      onPointerDown={(e) => startClipPointer(e, clip, track)}
                    >
                      <span
                        className={[
                          "timeline-panel__trim",
                          "timeline-panel__trim--left",
                          canExtendClipLeft(clip, asset?.durationMs)
                            ? "timeline-panel__trim--can-extend"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onPointerDown={(e) => startTrim(e, clip, track)}
                        title={
                          canExtendClipLeft(clip, asset?.durationMs)
                            ? "Drag to trim or extend start"
                            : "Drag to trim start"
                        }
                      />
                      {track.type === "audio" ? (
                        <WaveformClip
                          clip={clip}
                          asset={asset}
                          projectPath={projectPath}
                          pxPerSec={pxPerSec}
                          visibleStartMs={visStart}
                          visibleEndMs={Math.max(visStart, visEnd)}
                        />
                      ) : clip.kind === "caption" ? (
                        <CaptionCueBandsClip
                          clip={clip}
                          trackId={track.id}
                          pxPerSec={pxPerSec}
                          visibleStartMs={visStart}
                          visibleEndMs={Math.max(visStart, visEnd)}
                        />
                      ) : clip.kind === "text" ||
                        clip.kind === "sticker" ||
                        clip.kind === "effect" ||
                        clip.kind === "filter" ? (
                        <OverlayLabelClip
                          clip={clip}
                          label={
                            clip.kind === "text"
                              ? clip.text?.content || "Text"
                              : clip.kind === "sticker"
                                ? stickerDisplayName(clip.stickerId || "Sticker")
                                : clip.kind === "effect"
                                  ? clip.effect?.effectId || "Effect"
                                  : clip.filter?.lutId || "Filter"
                          }
                        />
                      ) : (
                        <FilmstripClip
                          clip={clip}
                          asset={asset}
                          projectPath={projectPath}
                          pxPerSec={pxPerSec}
                          visibleStartMs={visStart}
                          visibleEndMs={Math.max(visStart, visEnd)}
                        />
                      )}
                      <TimelineSummaryKeyframes clip={clip} />
                      <span
                        className={[
                          "timeline-panel__trim",
                          "timeline-panel__trim--right",
                          canExtendClipRight(clip, asset?.durationMs)
                            ? "timeline-panel__trim--can-extend"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onPointerDown={(e) => startTrim(e, clip, track)}
                        title={
                          canExtendClipRight(clip, asset?.durationMs)
                            ? "Drag to trim or extend end"
                            : "Drag to trim end"
                        }
                      />
                    </div>
                    {drawerOpen && (
                      <TimelineKeyframeDrawer
                        clip={clip}
                        left={left}
                        width={width}
                        top={CLIP_TOP + clipBarH + 2}
                        contentWidth={Math.max(laneWidthPx, 480)}
                      />
                    )}
                    </Fragment>
                  );
                })}
                {transitionMarkers
                  .filter((m) => m.trackId === track.id)
                  .map((marker) => {
                    const endMs = marker.startMs + marker.durationMs;
                    if (
                      endMs < viewStartMs - 500 ||
                      marker.startMs > viewEndMs + 500
                    ) {
                      return null;
                    }
                    const left = (marker.startMs / 1000) * pxPerSec;
                    const width = Math.max(
                      (marker.durationMs / 1000) * pxPerSec,
                      18,
                    );
                    const selected =
                      marker.incomingId === selectedTransitionId;
                    return (
                      <div
                        key={`tr_${marker.incomingId}`}
                        role="button"
                        tabIndex={0}
                        className={[
                          "timeline-panel__transition",
                          selected
                            ? "timeline-panel__transition--selected"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ left, width }}
                        title={`${marker.presetId} · ${marker.durationMs}ms`}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectTransition(
                            marker.incomingId,
                            marker.trackId,
                          );
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          selectTransition(
                            marker.incomingId,
                            marker.trackId,
                          );
                        }}
                      >
                        <span
                          className="timeline-panel__transition-handle timeline-panel__transition-handle--left"
                          onPointerDown={(e) =>
                            startTransitionResize(e, marker, "left")
                          }
                        />
                        <span className="timeline-panel__transition-icon" aria-hidden>
                          <IconTransitionBowtie size={12} />
                        </span>
                        <span
                          className="timeline-panel__transition-handle timeline-panel__transition-handle--right"
                          onPointerDown={(e) =>
                            startTransitionResize(e, marker, "right")
                          }
                        />
                      </div>
                    );
                  })}
              </div>
              );
              })}
            </div>
          </div>
        </div>
      </div>
      {clipMenu && (
        <ClipContextMenu
          menu={clipMenu}
          onClose={() => setClipMenu(null)}
          onCopy={() => {
            const store = useEditorStore.getState();
            if (
              clipMenu.clipId &&
              !store.selectedClipIds.includes(clipMenu.clipId)
            ) {
              selectClip(clipMenu.clipId, clipMenu.trackId);
            }
            queueMicrotask(() => cmdCopy());
          }}
          onPaste={() => {
            cmdPaste();
          }}
          onDelete={() => {
            const store = useEditorStore.getState();
            if (
              clipMenu.clipId &&
              !store.selectedClipIds.includes(clipMenu.clipId)
            ) {
              selectClip(clipMenu.clipId, clipMenu.trackId);
            }
            // Defer so selection is applied before delete reads store.
            queueMicrotask(() => cmdRippleDelete());
          }}
          onShowKeyframes={() => {
            selectClip(clipMenu.clipId, clipMenu.trackId);
            setExpandedKeyframeClipId(clipMenu.clipId);
          }}
          onFreeze={() => {
            selectClip(clipMenu.clipId, clipMenu.trackId);
            if (freezeBusy) return;
            setFreezeBusy(true);
            void cmdFreezeFrame(clipMenu.clipId)
              .catch((err) => {
                console.error("Freeze frame failed", err);
              })
              .finally(() => setFreezeBusy(false));
          }}
          onExtractAudio={() => {
            selectClip(clipMenu.clipId, clipMenu.trackId);
            if (extractBusy) return;
            setExtractBusy(true);
            void extractAudioFromVideoClip(clipMenu.clipId)
              .catch((err) => {
                console.error("Extract audio failed", err);
              })
              .finally(() => setExtractBusy(false));
          }}
          onReverse={(mode) => {
            selectClip(clipMenu.clipId, clipMenu.trackId);
            const tracksNow = useEditorStore.getState().project.tracks;
            const found = findClip(tracksNow, clipMenu.clipId);
            const turningOff = found
              ? reverseModeOf(found.clip) === mode
              : false;
            const next = applyReverseToClip(
              tracksNow,
              clipMenu.clipId,
              mode,
            );
            commitTracks(
              next,
              turningOff
                ? "Unreverse clip"
                : mode === "with-audio"
                  ? "Reverse with audio"
                  : "Reverse without audio",
            );
          }}
        />
      )}
    </div>
  );
}

function ToolButton({
  children,
  label,
  title,
  active = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  label: string;
  /** Overrides `label` for the native tooltip when provided. */
  title?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const tip = title ?? label;
  return (
    <button
      type="button"
      className={
        active
          ? "timeline-panel__tool timeline-panel__tool--active"
          : "timeline-panel__tool"
      }
      title={tip}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

function HeaderFlag({
  children,
  label,
  active,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={
        active
          ? "timeline-panel__flag timeline-panel__flag--active"
          : "timeline-panel__flag"
      }
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function formatTick(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
