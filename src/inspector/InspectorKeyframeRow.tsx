import { useState, type ReactNode } from "react";
import {
  diamondState,
  getAnimatable,
  type AnimatablePath,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import type { EasingPresetId } from "../project/types";
import { findClip, useEditorStore } from "../store/editorStore";
import { EasingPresetPopover } from "./EasingPresetPopover";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clipId: string;
  path: AnimatablePath;
  label: string;
  disabled?: boolean;
  children: ReactNode;
};

/**
 * Inspector leaf row: label + diamond/nav + control children.
 * Diamond: dim (no keys) / hollow+arrows (keys elsewhere) / solid (on key).
 */
export function InspectorKeyframeRow({
  clipId,
  path,
  label,
  disabled,
  children,
}: Props) {
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const fps = useEditorStore((s) => s.project.fps);
  const tracks = useEditorStore((s) => s.project.tracks);
  const toggleKeyframe = useEditorStore((s) => s.toggleKeyframe);
  const jumpToPrevKeyframe = useEditorStore((s) => s.jumpToPrevKeyframe);
  const jumpToNextKeyframe = useEditorStore((s) => s.jumpToNextKeyframe);
  const focusedPath = useEditorStore((s) => s.focusedAnimatablePath);
  const setFocusedAnimatablePath = useEditorStore(
    (s) => s.setFocusedAnimatablePath,
  );
  const selectedSeg = useEditorStore((s) => s.selectedEasingSegment);
  const selectedKey = useEditorStore((s) => s.selectedTimelineKeyframe);
  const selectEasingSegment = useEditorStore((s) => s.selectEasingSegment);
  const applyEasingPreset = useEditorStore((s) => s.applyEasingPreset);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );
  const gesture = useClipGestureEdit(clipId, "Keyframe");

  const [graphsAnchor, setGraphsAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const found = findClip(tracks, clipId);
  const localMs = found ? clipLocalMs(playheadMs, found.clip) : null;
  const prop = found ? getAnimatable(found.clip, path) : undefined;
  const state =
    localMs === null ? "dim" : diamondState(prop, localMs, fps);
  const offClip = localMs === null || Boolean(disabled);
  const focused = focusedPath === path;
  const keys = prop?.keyframes ?? [];
  const canGraphs = keys.length >= 2;

  /** Resolve left key for Graphs: selected segment, else selected key's left neighbor, else playhead segment. */
  const resolveLeftKeyId = (): string | null => {
    if (
      selectedSeg?.clipId === clipId &&
      selectedSeg.path === path
    ) {
      return selectedSeg.leftKeyId;
    }
    if (
      selectedKey?.clipId === clipId &&
      selectedKey.path === path
    ) {
      const sorted = [...keys].sort(
        (a, b) => a.timeOffsetMs - b.timeOffsetMs,
      );
      const idx = sorted.findIndex((k) => k.id === selectedKey.keyId);
      if (idx >= 0 && idx < sorted.length - 1) return sorted[idx]!.id;
      if (idx > 0) return sorted[idx - 1]!.id;
    }
    if (localMs === null || keys.length < 2) return null;
    const sorted = [...keys].sort(
      (a, b) => a.timeOffsetMs - b.timeOffsetMs,
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const left = sorted[i]!;
      const right = sorted[i + 1]!;
      if (localMs >= left.timeOffsetMs && localMs <= right.timeOffsetMs) {
        return left.id;
      }
    }
    return sorted[0]?.id ?? null;
  };

  const activeLeftId =
    selectedSeg?.clipId === clipId && selectedSeg.path === path
      ? selectedSeg.leftKeyId
      : null;
  const activePresetId = activeLeftId
    ? keys.find((k) => k.id === activeLeftId)?.easingPresetId
    : undefined;

  return (
    <label
      className={
        focused
          ? "inspector-field inspector-field--kf-focused"
          : "inspector-field"
      }
      onPointerDown={() => setFocusedAnimatablePath(path)}
    >
      <span className="inspector-field__label">
        {label}
        <span className="inspector-kf-nav" data-state={state}>
          {state !== "dim" && (
            <button
              type="button"
              className="inspector-kf-nav__arrow"
              disabled={offClip}
              title="Previous keyframe"
              aria-label="Previous keyframe"
              onClick={(e) => {
                e.preventDefault();
                jumpToPrevKeyframe(clipId, path);
              }}
            >
              ‹
            </button>
          )}
          <button
            type="button"
            className="inspector-kf"
            data-state={state}
            disabled={offClip}
            title={
              state === "solid"
                ? "Remove keyframe"
                : state === "hollow"
                  ? "Add keyframe"
                  : "Add keyframe"
            }
            aria-label={
              state === "solid" ? "Remove keyframe" : "Add keyframe"
            }
            onClick={(e) => {
              e.preventDefault();
              if (offClip) return;
              gesture.begin();
              toggleKeyframe(clipId, path);
              gesture.end();
            }}
          >
            {state === "solid" ? "◆" : "◇"}
          </button>
          {state !== "dim" && (
            <button
              type="button"
              className="inspector-kf-nav__arrow"
              disabled={offClip}
              title="Next keyframe"
              aria-label="Next keyframe"
              onClick={(e) => {
                e.preventDefault();
                jumpToNextKeyframe(clipId, path);
              }}
            >
              ›
            </button>
          )}
          {canGraphs && (
            <button
              type="button"
              className="inspector-kf-graphs"
              disabled={offClip}
              title="Graphs — easing presets"
              aria-label="Graphs easing presets"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const leftId = resolveLeftKeyId();
                if (!leftId) return;
                selectEasingSegment({
                  clipId,
                  path,
                  leftKeyId: leftId,
                });
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                setGraphsAnchor({ x: rect.left, y: rect.bottom + 4 });
              }}
            >
              ⌒
            </button>
          )}
        </span>
      </span>
      <div className="inspector-field__controls">{children}</div>
      {graphsAnchor &&
        (() => {
          const leftId = resolveLeftKeyId();
          return (
            <EasingPresetPopover
              anchor={graphsAnchor}
              activePresetId={
                activePresetId && activePresetId !== "custom"
                  ? (activePresetId as Exclude<EasingPresetId, "custom">)
                  : undefined
              }
              segmentEdit={
                leftId
                  ? { clipId, path, leftKeyId: leftId }
                  : undefined
              }
              onSelect={(preset) => {
                if (!leftId) {
                  setGraphsAnchor(null);
                  return;
                }
                const before = structuredClone(
                  useEditorStore.getState().project.tracks,
                );
                applyEasingPreset(clipId, path, leftId, preset);
                const after = useEditorStore.getState().project.tracks;
                commitTracksTransition(before, after, "Apply easing preset");
                setGraphsAnchor(null);
              }}
              onClose={() => setGraphsAnchor(null)}
            />
          );
        })()}
    </label>
  );
}
