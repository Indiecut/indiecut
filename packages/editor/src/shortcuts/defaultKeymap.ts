import type { CommandId } from "./commandIds";

export type ShortcutBindings = Partial<Record<CommandId, string>>;

/** Mac defaults (Command / Option). */
export const MAC_DEFAULT_KEYMAP: Record<CommandId, string> = {
  "playback.toggle": "Space",
  "playback.shuttleReverse": "KeyJ",
  "playback.shuttlePause": "KeyK",
  "playback.shuttleForward": "KeyL",
  "playback.stepBack": "ArrowLeft",
  "playback.stepForward": "ArrowRight",
  "playback.jumpPrevCut": "ArrowUp",
  "playback.jumpNextCut": "ArrowDown",
  "playback.gotoStart": "Home",
  "playback.gotoEnd": "End",
  "playback.fullscreen": "Meta+Shift+KeyF",
  "playback.exitFullscreen": "Escape",
  "edit.split": "Meta+KeyB",
  "edit.splitAll": "Meta+Shift+KeyB",
  "edit.rippleTrimLeft": "KeyQ",
  "edit.rippleTrimRight": "KeyW",
  "edit.rippleDelete": "Backspace",
  "edit.undo": "Meta+KeyZ",
  "edit.redo": "Meta+Shift+KeyZ",
  "edit.copy": "Meta+KeyC",
  "edit.cut": "Meta+KeyX",
  "edit.paste": "Meta+KeyV",
  "edit.detachAudio": "Meta+KeyM",
  "edit.addText": "Meta+KeyT",
  "edit.group": "Meta+KeyG",
  "edit.ungroup": "Meta+Shift+KeyG",
  "tool.select": "KeyA",
  "tool.blade": "KeyB",
  "timeline.zoomIn": "Meta+Equal",
  "timeline.zoomOut": "Meta+Minus",
  "timeline.zoomFit": "Shift+KeyZ",
  "timeline.toggleKeyframeGraph": "Alt+KeyK",
};

/** Windows / Linux defaults (Ctrl / Alt). */
export const WIN_DEFAULT_KEYMAP: Record<CommandId, string> = {
  ...MAC_DEFAULT_KEYMAP,
  "playback.fullscreen": "Ctrl+Shift+KeyF",
  "edit.split": "Ctrl+KeyB",
  "edit.splitAll": "Ctrl+Shift+KeyB",
  "edit.undo": "Ctrl+KeyZ",
  "edit.redo": "Ctrl+Shift+KeyZ",
  "edit.copy": "Ctrl+KeyC",
  "edit.cut": "Ctrl+KeyX",
  "edit.paste": "Ctrl+KeyV",
  "edit.detachAudio": "Ctrl+KeyM",
  "edit.addText": "Ctrl+KeyT",
  "edit.group": "Ctrl+KeyG",
  "edit.ungroup": "Ctrl+Shift+KeyG",
  "timeline.zoomIn": "Ctrl+Equal",
  "timeline.zoomOut": "Ctrl+Minus",
};

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function platformDefaultKeymap(): Record<CommandId, string> {
  return isMacPlatform() ? { ...MAC_DEFAULT_KEYMAP } : { ...WIN_DEFAULT_KEYMAP };
}

/** Normalize a KeyboardEvent into a binding string comparable to keymap values. */
export function eventToBinding(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push("Meta");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  // Prefer code for letters/digits; keep Space/Arrows/Home/End as key
  let keyPart = e.code;
  if (e.key === " " || e.code === "Space") keyPart = "Space";
  else if (
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight" ||
    e.key === "ArrowUp" ||
    e.key === "ArrowDown" ||
    e.key === "Home" ||
    e.key === "End" ||
    e.key === "Escape" ||
    e.key === "Backspace" ||
    e.key === "Delete"
  ) {
    keyPart = e.key === "Delete" ? "Backspace" : e.key;
  }
  parts.push(keyPart);
  return parts.join("+");
}

/** Human-readable binding for the Shortcuts panel. */
export function formatBinding(binding: string): string {
  const mac = isMacPlatform();
  return binding
    .split("+")
    .map((p) => {
      if (p === "Meta") return mac ? "⌘" : "Win";
      if (p === "Ctrl") return mac ? "⌃" : "Ctrl";
      if (p === "Alt") return mac ? "⌥" : "Alt";
      if (p === "Shift") return mac ? "⇧" : "Shift";
      if (p === "Space") return "Space";
      if (p.startsWith("Key")) return p.slice(3);
      if (p.startsWith("Digit")) return p.slice(5);
      if (p === "Equal") return "=";
      if (p === "Minus") return "−";
      if (p === "Backspace") return "Delete";
      return p.replace("Arrow", "");
    })
    .join(mac ? "" : "+");
}

export function findBindingConflicts(
  bindings: ShortcutBindings,
): Map<string, CommandId[]> {
  const byBinding = new Map<string, CommandId[]>();
  for (const [id, binding] of Object.entries(bindings) as [
    CommandId,
    string,
  ][]) {
    if (!binding) continue;
    const list = byBinding.get(binding) ?? [];
    list.push(id);
    byBinding.set(binding, list);
  }
  const conflicts = new Map<string, CommandId[]>();
  for (const [binding, ids] of byBinding) {
    if (ids.length > 1) conflicts.set(binding, ids);
  }
  return conflicts;
}
