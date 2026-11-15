import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  getAnimatable,
  moveKeyframe as moveKeyOnClip,
  type AnimatablePath,
} from "../engine/animatable";
import { EasingPresetPopover } from "../inspector/EasingPresetPopover";
import type { Clip, Track } from "../project/types";
import { useEditorStore } from "../store/editorStore";

type Props = {
  clip: Clip;
  path: AnimatablePath;
  label: string;
};

function applyKeyMove(
  tracks: Track[],
  clipId: string,
  path: AnimatablePath,
  keyId: string,
  toLocalMs: number,
  fps: number,
): Track[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((c) => {
      if (c.id !== clipId) return c;
      const patch = moveKeyOnClip(c, path, keyId, toLocalMs, fps);
      return Object.keys(patch).length === 0 ? c : { ...c, ...patch };
    }),
  }));
}

/**
 * One dope-sheet property lane: segment hit targets + draggable diamonds.
 */
export function KeyframeTrackLane({ clip, path, label }: Props) {
  const fps = useEditorStore((s) => s.project.fps);
  const selectedKey = useEditorStore((s) => s.selectedTimelineKeyframe);
  const selectedSeg = useEditorStore((s) => s.selectedEasingSegment);
  const focusedPath = useEditorStore((s) => s.focusedAnimatablePath);
  const selectTimelineKeyframe = useEditorStore((s) => s.selectTimelineKeyframe);
  const selectEasingSegment = useEditorStore((s) => s.selectEasingSegment);
  const patchTracksLive = useEditorStore((s) => s.patchTracksLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );
  const applyEasingPreset = useEditorStore((s) => s.applyEasingPreset);
  const pxPerMs = useEditorStore((s) => s.timelinePxPerSec) / 1000;

  const [popover, setPopover] = useState<{
    leftKeyId: string;
    x: number;
    y: number;
  } | null>(null);

  const prop = getAnimatable(clip, path);
  const keys = useMemo(
    () =>
      [...(prop?.keyframes ?? [])].sort(
        (a, b) => a.timeOffsetMs - b.timeOffsetMs,
      ),
    [prop?.keyframes],
  );

  const dragRef = useRef<{
    keyId: string;
    fromLocalMs: number;
    startX: number;
    tracksBefore: Track[];
    moved: boolean;
  } | null>(null);

  const laneFocused = focusedPath === path;

  const onKeyPointerDown = useCallback(
    (e: ReactPointerEvent, keyId: string, localMs: number) => {
      e.preventDefault();
      e.stopPropagation();
      selectTimelineKeyframe({ clipId: clip.id, path, keyId });
      dragRef.current = {
        keyId,
        fromLocalMs: localMs,
        startX: e.clientX,
        tracksBefore: structuredClone(
          useEditorStore.getState().project.tracks,
        ),
        moved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [clip.id, path, selectTimelineKeyframe],
  );

  const onKeyPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) < 2) return;
      drag.moved = true;
      const deltaMs = dx / Math.max(1e-6, pxPerMs);
      const toLocal = Math.min(
        Math.max(0, drag.fromLocalMs + deltaMs),
        Math.max(0, clip.durationMs),
      );
      const next = applyKeyMove(
        structuredClone(drag.tracksBefore),
        clip.id,
        path,
        drag.keyId,
        toLocal,
        fps,
      );
      patchTracksLive(next);
      selectTimelineKeyframe({
        clipId: clip.id,
        path,
        keyId: drag.keyId,
      });
    },
    [
      clip.durationMs,
      clip.id,
      fps,
      patchTracksLive,
      path,
      pxPerMs,
      selectTimelineKeyframe,
    ],
  );

  const onKeyPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (drag.moved) {
        const after = useEditorStore.getState().project.tracks;
        commitTracksTransition(drag.tracksBefore, after, "Move keyframe");
      }
      dragRef.current = null;
    },
    [commitTracksTransition],
  );

  const onSegmentClick = useCallback(
    (e: React.MouseEvent, leftKeyId: string) => {
      e.preventDefault();
      e.stopPropagation();
      selectEasingSegment({ clipId: clip.id, path, leftKeyId });
    },
    [clip.id, path, selectEasingSegment],
  );

  const onSegmentContextMenu = useCallback(
    (e: React.MouseEvent, leftKeyId: string) => {
      e.preventDefault();
      e.stopPropagation();
      selectEasingSegment({ clipId: clip.id, path, leftKeyId });
      setPopover({ leftKeyId, x: e.clientX, y: e.clientY });
    },
    [clip.id, path, selectEasingSegment],
  );

  if (keys.length === 0 || clip.durationMs <= 0) return null;

  const activePresetId = (() => {
    const leftId =
      selectedSeg?.clipId === clip.id && selectedSeg.path === path
        ? selectedSeg.leftKeyId
        : popover?.leftKeyId;
    if (!leftId) return undefined;
    return keys.find((k) => k.id === leftId)?.easingPresetId;
  })();

  return (
    <div
      className={
        laneFocused
          ? "timeline-kf-lane timeline-kf-lane--focused"
          : "timeline-kf-lane"
      }
    >
      <span className="timeline-kf-lane__label" title={label}>
        {label}
      </span>
      <div className="timeline-kf-lane__track">
        {keys.slice(0, -1).map((left, i) => {
          const right = keys[i + 1]!;
          const leftPct = (left.timeOffsetMs / clip.durationMs) * 100;
          const rightPct = (right.timeOffsetMs / clip.durationMs) * 100;
          const isSegSelected =
            selectedSeg?.clipId === clip.id &&
            selectedSeg.path === path &&
            selectedSeg.leftKeyId === left.id;
          return (
            <button
              key={`seg-${left.id}`}
              type="button"
              className={
                isSegSelected
                  ? "timeline-kf-lane__segment timeline-kf-lane__segment--selected"
                  : "timeline-kf-lane__segment"
              }
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(0, rightPct - leftPct)}%`,
              }}
              title={`Easing: ${left.easingPresetId}`}
              aria-label={`Easing segment ${left.easingPresetId}`}
              onClick={(e) => onSegmentClick(e, left.id)}
              onContextMenu={(e) => onSegmentContextMenu(e, left.id)}
            />
          );
        })}
        {keys.map((k) => {
          const pct = (k.timeOffsetMs / clip.durationMs) * 100;
          const isSelected =
            selectedKey?.clipId === clip.id &&
            selectedKey.path === path &&
            selectedKey.keyId === k.id;
          return (
            <button
              key={k.id}
              type="button"
              className={
                isSelected
                  ? "timeline-kf-lane__diamond timeline-kf-lane__diamond--selected"
                  : "timeline-kf-lane__diamond"
              }
              style={{ left: `${pct}%` }}
              title={`${label} @ ${Math.round(k.timeOffsetMs)}ms`}
              aria-label={`Keyframe ${label}`}
              onPointerDown={(e) =>
                onKeyPointerDown(e, k.id, k.timeOffsetMs)
              }
              onPointerMove={onKeyPointerMove}
              onPointerUp={onKeyPointerUp}
              onPointerCancel={onKeyPointerUp}
              onClick={(e) => e.stopPropagation()}
            >
              ◆
            </button>
          );
        })}
      </div>
      {popover && (
        <EasingPresetPopover
          anchor={{ x: popover.x, y: popover.y }}
          activePresetId={
            activePresetId === "custom" ? undefined : activePresetId
          }
          segmentEdit={{
            clipId: clip.id,
            path,
            leftKeyId: popover.leftKeyId,
          }}
          onSelect={(preset) => {
            const before = structuredClone(
              useEditorStore.getState().project.tracks,
            );
            applyEasingPreset(clip.id, path, popover.leftKeyId, preset);
            const after = useEditorStore.getState().project.tracks;
            commitTracksTransition(before, after, "Apply easing preset");
            setPopover(null);
          }}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
