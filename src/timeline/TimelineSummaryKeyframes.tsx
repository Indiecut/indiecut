import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  collectKeyframeClusters,
  frameEpsilonMs,
  moveKeyframeCluster as moveClusterOnClip,
} from "../engine/animatable";
import type { Clip, Track } from "../project/types";
import { useEditorStore } from "../store/editorStore";

type Props = {
  clip: Clip;
};

function applyClusterMove(
  tracks: Track[],
  clipId: string,
  fromLocalMs: number,
  toLocalMs: number,
  fps: number,
): Track[] {
  return tracks.map((track) => ({
    ...track,
    clips: track.clips.map((c) => {
      if (c.id !== clipId) return c;
      const patch = moveClusterOnClip(c, fromLocalMs, toLocalMs, fps);
      return Object.keys(patch).length === 0 ? c : { ...c, ...patch };
    }),
  }));
}

/**
 * Summary diamonds on a collapsed clip bar — one marker per ±1-frame cluster.
 * Drag retimes all keys in the cluster; Backspace deletes when selected.
 */
export function TimelineSummaryKeyframes({ clip }: Props) {
  const fps = useEditorStore((s) => s.project.fps);
  const selected = useEditorStore((s) => s.selectedKeyframeCluster);
  const selectCluster = useEditorStore((s) => s.selectKeyframeCluster);
  const patchTracksLive = useEditorStore((s) => s.patchTracksLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );
  const pxPerMs = useEditorStore((s) => s.timelinePxPerSec) / 1000;

  const clusters = useMemo(
    () => collectKeyframeClusters(clip, fps),
    [clip, fps],
  );

  const dragRef = useRef<{
    fromLocalMs: number;
    startX: number;
    tracksBefore: Track[];
    moved: boolean;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent, localMs: number) => {
      // Left-drag only — right-click bubbles to the clip for Delete / Show keyframe.
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      // selectKeyframeCluster clears per-path / segment selection
      selectCluster({ clipId: clip.id, localMs });
      dragRef.current = {
        fromLocalMs: localMs,
        startX: e.clientX,
        tracksBefore: structuredClone(
          useEditorStore.getState().project.tracks,
        ),
        moved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [clip.id, selectCluster],
  );

  const onPointerMove = useCallback(
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
      const next = applyClusterMove(
        structuredClone(drag.tracksBefore),
        clip.id,
        drag.fromLocalMs,
        toLocal,
        fps,
      );
      patchTracksLive(next);
      selectCluster({ clipId: clip.id, localMs: toLocal });
    },
    [
      clip.durationMs,
      clip.id,
      fps,
      patchTracksLive,
      pxPerMs,
      selectCluster,
    ],
  );

  const onPointerUp = useCallback(
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
        commitTracksTransition(drag.tracksBefore, after, "Move keyframes");
      }
      dragRef.current = null;
    },
    [commitTracksTransition],
  );

  if (clusters.length === 0 || clip.durationMs <= 0) return null;

  const eps = frameEpsilonMs(fps);

  return (
    <div className="timeline-kf-summary">
      {clusters.map((cluster) => {
        const pct = (cluster.localMs / clip.durationMs) * 100;
        const isSelected =
          selected?.clipId === clip.id &&
          Math.abs((selected.localMs ?? 0) - cluster.localMs) <= eps;
        const title = cluster.labels.join(", ");
        return (
          <button
            key={`${cluster.localMs}-${cluster.paths.join("|")}`}
            type="button"
            className={
              isSelected
                ? "timeline-kf-summary__diamond timeline-kf-summary__diamond--selected"
                : "timeline-kf-summary__diamond"
            }
            style={{ left: `${pct}%` }}
            title={title}
            aria-label={`Keyframes: ${title}`}
            onPointerDown={(e) => onPointerDown(e, cluster.localMs)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => e.stopPropagation()}
          >
            ◆
          </button>
        );
      })}
    </div>
  );
}
