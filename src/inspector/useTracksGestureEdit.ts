import { useCallback, useRef } from "react";
import type { Track } from "../project/types";
import { useEditorStore } from "../store/editorStore";

/**
 * Coalesce continuous track-level edits (e.g. speed with linked sync) into one undo.
 */
export function useTracksGestureEdit(label = "Edit") {
  const beforeRef = useRef<Track[] | null>(null);
  const patchTracksLive = useEditorStore((s) => s.patchTracksLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );

  const begin = useCallback(() => {
    beforeRef.current = structuredClone(
      useEditorStore.getState().project.tracks,
    );
  }, []);

  const live = useCallback(
    (tracks: Track[]) => {
      if (!beforeRef.current) {
        beforeRef.current = structuredClone(
          useEditorStore.getState().project.tracks,
        );
      }
      patchTracksLive(tracks);
    },
    [patchTracksLive],
  );

  const end = useCallback(() => {
    const before = beforeRef.current;
    beforeRef.current = null;
    if (!before) return;
    const after = useEditorStore.getState().project.tracks;
    commitTracksTransition(before, after, label);
  }, [commitTracksTransition, label]);

  const commit = useCallback(
    (tracks: Track[], commitLabel = label) => {
      const before = structuredClone(
        useEditorStore.getState().project.tracks,
      );
      patchTracksLive(tracks);
      const after = useEditorStore.getState().project.tracks;
      commitTracksTransition(before, after, commitLabel);
    },
    [commitTracksTransition, label, patchTracksLive],
  );

  return { begin, live, end, commit };
}
