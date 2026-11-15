import type { Track } from "../project/types";

export type TracksPatch = {
  label: string;
  before: { tracks: Track[] };
  after: { tracks: Track[] };
};

const MAX_STACK = 100;

export type HistoryState = {
  undoStack: TracksPatch[];
  redoStack: TracksPatch[];
};

export function createHistoryState(): HistoryState {
  return { undoStack: [], redoStack: [] };
}

export function pushPatch(
  state: HistoryState,
  patch: TracksPatch,
): HistoryState {
  const undoStack = [...state.undoStack, patch];
  if (undoStack.length > MAX_STACK) {
    undoStack.splice(0, undoStack.length - MAX_STACK);
  }
  return { undoStack, redoStack: [] };
}

export function undo(
  state: HistoryState,
): { state: HistoryState; tracks: Track[] } | null {
  if (state.undoStack.length === 0) return null;
  const patch = state.undoStack[state.undoStack.length - 1]!;
  return {
    state: {
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, patch],
    },
    tracks: structuredClone(patch.before.tracks),
  };
}

export function redo(
  state: HistoryState,
): { state: HistoryState; tracks: Track[] } | null {
  if (state.redoStack.length === 0) return null;
  const patch = state.redoStack[state.redoStack.length - 1]!;
  return {
    state: {
      undoStack: [...state.undoStack, patch],
      redoStack: state.redoStack.slice(0, -1),
    },
    tracks: structuredClone(patch.after.tracks),
  };
}

export function clearHistory(): HistoryState {
  return createHistoryState();
}
