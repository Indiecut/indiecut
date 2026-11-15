import { useCallback, useRef } from "react";
import type { Clip, Track } from "../project/types";
import { useEditorStore } from "../store/editorStore";

/**
 * Coalesce continuous inspector edits into one undo entry.
 * pointerdown/focus → snapshot; input → patchClipLive; pointerup/blur → commit.
 */
export function useClipGestureEdit(clipId: string, label = "Transform") {
  const beforeRef = useRef<Track[] | null>(null);
  const patchClipLive = useEditorStore((s) => s.patchClipLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );

  const begin = useCallback(() => {
    beforeRef.current = structuredClone(
      useEditorStore.getState().project.tracks,
    );
  }, []);

  /** Snapshot once for a gesture if not already open (does not reset baseline). */
  const ensureBegin = useCallback(() => {
    if (!beforeRef.current) {
      beforeRef.current = structuredClone(
        useEditorStore.getState().project.tracks,
      );
    }
  }, []);

  const live = useCallback(
    (patch: Partial<Clip>) => {
      ensureBegin();
      patchClipLive(clipId, patch);
    },
    [clipId, ensureBegin, patchClipLive],
  );

  const end = useCallback(() => {
    const before = beforeRef.current;
    beforeRef.current = null;
    if (!before) return;
    const after = useEditorStore.getState().project.tracks;
    commitTracksTransition(before, after, label);
  }, [commitTracksTransition, label]);

  /** Discrete one-shot edit (checkbox, select, alignment) with undo. */
  const commit = useCallback(
    (patch: Partial<Clip>, commitLabel = label) => {
      const before = structuredClone(
        useEditorStore.getState().project.tracks,
      );
      patchClipLive(clipId, patch);
      const after = useEditorStore.getState().project.tracks;
      commitTracksTransition(before, after, commitLabel);
    },
    [clipId, commitTracksTransition, label, patchClipLive],
  );

  return { begin, ensureBegin, live, end, commit };
}
