import { useEffect, useRef } from "react";
import {
  getShortcutBindings,
  loadShortcutBindings,
} from "../prefs/appPrefs";
import type { CommandId } from "./commandIds";
import { eventToBinding, platformDefaultKeymap } from "./defaultKeymap";
import { dispatchBridge } from "./dispatchBridge";
// Side-effect: register dispatchBridge.dispatch (HMR-safe).
import "./dispatch";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/** True when the user has highlighted DOM text (e.g. chat transcript). */
function hasDomTextSelection(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  return sel.toString().length > 0;
}

type ShortcutHost = {
  getTimelineViewportWidth: () => number;
};

/** Single shared host so we never stack duplicate window keydown listeners. */
const host: ShortcutHost = {
  getTimelineViewportWidth: () => 800,
};

const LISTENER_KEY = "__indiecutEditorKeydown";

function onEditorKeyDown(e: KeyboardEvent): void {
  if (isTypingTarget(e.target)) return;

  const binding = eventToBinding(e);
  const map = { ...platformDefaultKeymap(), ...getShortcutBindings() };

  let matched: CommandId | null = null;
  for (const [id, b] of Object.entries(map) as [CommandId, string][]) {
    if (b === binding) {
      matched = id;
      break;
    }
  }
  // Also match Delete → ripple delete (Mac Forward Delete)
  if (!matched && (e.key === "Delete" || e.key === "d" || e.key === "D")) {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      matched = "edit.rippleDelete";
    }
  }

  if (!matched) return;

  // Prefer native clipboard when text is highlighted (chat, inspector labels,
  // etc.). Otherwise Cmd/Ctrl+C steals the event for timeline clip copy.
  if (
    (matched === "edit.copy" || matched === "edit.cut") &&
    hasDomTextSelection()
  ) {
    return;
  }

  e.preventDefault();
  dispatchBridge.dispatch(matched, {
    getTimelineViewportWidth: () => host.getTimelineViewportWidth(),
  });
}

function ensureShortcutListener(): void {
  const w = window as Window & {
    [LISTENER_KEY]?: (e: KeyboardEvent) => void;
  };
  // Replace any prior listener (HMR / StrictMode) so Delete can't run twice.
  if (w[LISTENER_KEY]) {
    window.removeEventListener("keydown", w[LISTENER_KEY]);
  }
  w[LISTENER_KEY] = onEditorKeyDown;
  window.addEventListener("keydown", onEditorKeyDown);
}

/**
 * Data-driven shortcuts. Bindings load from app prefs (or platform defaults).
 */
export function useEditorShortcuts(getTimelineViewportWidth: () => number) {
  const getWidth = useRef(getTimelineViewportWidth);
  getWidth.current = getTimelineViewportWidth;
  host.getTimelineViewportWidth = () => getWidth.current();

  useEffect(() => {
    void loadShortcutBindings();
  }, []);

  useEffect(() => {
    ensureShortcutListener();
  }, []);
}
