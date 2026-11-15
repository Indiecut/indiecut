import {
  groupDiamondState,
  type AnimatablePath,
} from "../engine/animatable";
import { clipLocalMs } from "../engine/time";
import { findClip, useEditorStore } from "../store/editorStore";
import { useClipGestureEdit } from "./useClipGestureEdit";

type Props = {
  clipId: string;
  paths: AnimatablePath[];
  /** Optional className on the diamond button wrapper. */
  className?: string;
};

/**
 * Section-header group diamond — toggles keyframes on all child paths at playhead.
 * Solid only when every child has a key at the playhead.
 */
export function InspectorKeyframeGroup({ clipId, paths, className }: Props) {
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const fps = useEditorStore((s) => s.project.fps);
  const tracks = useEditorStore((s) => s.project.tracks);
  const toggleKeyframeGroup = useEditorStore((s) => s.toggleKeyframeGroup);
  const gesture = useClipGestureEdit(clipId, "Keyframe");

  const found = findClip(tracks, clipId);
  const localMs = found ? clipLocalMs(playheadMs, found.clip) : null;
  const state =
    localMs === null || !found
      ? "dim"
      : groupDiamondState(found.clip, paths, localMs, fps);
  const offClip = localMs === null;

  return (
    <span className={className ?? "inspector-kf-nav"} data-state={state}>
      <button
        type="button"
        className="inspector-kf"
        data-state={state}
        disabled={offClip || paths.length === 0}
        title={
          state === "solid"
            ? "Remove keyframes"
            : "Add keyframes for all properties"
        }
        aria-label={
          state === "solid" ? "Remove group keyframes" : "Add group keyframes"
        }
        onClick={(e) => {
          e.preventDefault();
          if (offClip) return;
          gesture.begin();
          toggleKeyframeGroup(clipId, paths);
          gesture.commit({}, "Keyframe");
        }}
      >
        ◆
      </button>
    </span>
  );
}
