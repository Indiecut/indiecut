import localforage from "localforage";
import type { CommandId } from "../shortcuts/commandIds";
import type { ShortcutBindings } from "../shortcuts/defaultKeymap";
import { platformDefaultKeymap } from "../shortcuts/defaultKeymap";

export type RecentProject = {
  path: string;
  title: string;
  openedAt: string;
};

const RECENTS_KEY = "recents_v1";
const LAST_PATH_KEY = "lastProjectPath_v1";
const SHORTCUTS_KEY = "shortcuts_v1";
const CHAT_UI_KEY = "chatUi_v1";
const SKIPPED_UPDATE_KEY = "skippedUpdateVersion_v1";
/** Stored recent projects (shown fully in the Recents dialog). */
const MAX_RECENTS = 50;
/** Max recents listed inline in the Menu dropdown. */
export const MENU_RECENTS_VISIBLE = 4;

export type ChatUiPrefs = {
  open: boolean;
  /** Chat panel width as percent of the body row (1–100). */
  widthPercent: number;
};

export const CHAT_DEFAULT_WIDTH_PERCENT = 28;
export const CHAT_MIN_WIDTH_PERCENT = 18;
export const CHAT_MAX_WIDTH_PERCENT = 42;

const DEFAULT_CHAT_UI: ChatUiPrefs = {
  open: false,
  widthPercent: CHAT_DEFAULT_WIDTH_PERCENT,
};

/** Sync cache — hydrated in loadChatUiPrefs during app boot. */
let chatUiCache: ChatUiPrefs = { ...DEFAULT_CHAT_UI };

function clampChatWidth(n: number): number {
  if (!Number.isFinite(n)) return CHAT_DEFAULT_WIDTH_PERCENT;
  return Math.min(
    CHAT_MAX_WIDTH_PERCENT,
    Math.max(CHAT_MIN_WIDTH_PERCENT, Math.round(n)),
  );
}

const prefs = localforage.createInstance({
  name: "indiecut",
  storeName: "settings",
  description: "IndieCut app settings and recent projects",
});

/** In-memory cache so the keydown listener stays sync. */
let shortcutCache: ShortcutBindings = {};

export async function getRecents(): Promise<RecentProject[]> {
  try {
    const value = await prefs.getItem<RecentProject[]>(RECENTS_KEY);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function pushRecent(
  entry: Omit<RecentProject, "openedAt"> & { openedAt?: string },
): Promise<RecentProject[]> {
  const openedAt = entry.openedAt ?? new Date().toISOString();
  const current = await getRecents();
  const next = [
    { path: entry.path, title: entry.title, openedAt },
    ...current.filter((r) => r.path !== entry.path),
  ].slice(0, MAX_RECENTS);
  await prefs.setItem(RECENTS_KEY, next);
  return next;
}

export async function removeRecent(path: string): Promise<RecentProject[]> {
  const current = await getRecents();
  const next = current.filter((r) => r.path !== path);
  await prefs.setItem(RECENTS_KEY, next);
  return next;
}

export async function getLastProjectPath(): Promise<string | null> {
  try {
    const value = await prefs.getItem<string>(LAST_PATH_KEY);
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function setLastProjectPath(path: string | null): Promise<void> {
  if (!path) {
    await prefs.removeItem(LAST_PATH_KEY);
    return;
  }
  await prefs.setItem(LAST_PATH_KEY, path);
}

export function getShortcutBindings(): ShortcutBindings {
  return shortcutCache;
}

export async function loadShortcutBindings(): Promise<ShortcutBindings> {
  try {
    const value = await prefs.getItem<ShortcutBindings>(SHORTCUTS_KEY);
    shortcutCache =
      value && typeof value === "object" ? { ...value } : {};
  } catch {
    shortcutCache = {};
  }
  return shortcutCache;
}

export async function saveShortcutBindings(
  bindings: ShortcutBindings,
): Promise<void> {
  shortcutCache = { ...bindings };
  await prefs.setItem(SHORTCUTS_KEY, shortcutCache);
}

export async function resetShortcutBindings(): Promise<ShortcutBindings> {
  shortcutCache = {};
  await prefs.removeItem(SHORTCUTS_KEY);
  return platformDefaultKeymap();
}

export function effectiveShortcutMap(): Record<CommandId, string> {
  return { ...platformDefaultKeymap(), ...shortcutCache };
}

export function getChatUiPrefs(): ChatUiPrefs {
  return { ...chatUiCache };
}

export async function loadChatUiPrefs(): Promise<ChatUiPrefs> {
  clearLegacyChatUiDebris();
  try {
    const value = await prefs.getItem<Partial<ChatUiPrefs>>(CHAT_UI_KEY);
    if (value && typeof value === "object") {
      chatUiCache = {
        open: Boolean(value.open),
        widthPercent: clampChatWidth(
          typeof value.widthPercent === "number"
            ? value.widthPercent
            : CHAT_DEFAULT_WIDTH_PERCENT,
        ),
      };
    } else {
      chatUiCache = { ...DEFAULT_CHAT_UI };
    }
  } catch {
    chatUiCache = { ...DEFAULT_CHAT_UI };
  }
  return getChatUiPrefs();
}

export async function saveChatUiPrefs(
  patch: Partial<ChatUiPrefs>,
): Promise<ChatUiPrefs> {
  chatUiCache = {
    open:
      typeof patch.open === "boolean" ? patch.open : chatUiCache.open,
    widthPercent:
      typeof patch.widthPercent === "number"
        ? clampChatWidth(patch.widthPercent)
        : chatUiCache.widthPercent,
  };
  try {
    await prefs.setItem(CHAT_UI_KEY, chatUiCache);
  } catch {
    /* ignore */
  }
  return getChatUiPrefs();
}

export async function getSkippedUpdateVersion(): Promise<string | null> {
  try {
    const value = await prefs.getItem<string>(SKIPPED_UPDATE_KEY);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function setSkippedUpdateVersion(
  version: string | null,
): Promise<void> {
  if (!version?.trim()) {
    await prefs.removeItem(SKIPPED_UPDATE_KEY);
    return;
  }
  await prefs.setItem(SKIPPED_UPDATE_KEY, version.trim());
}

/** Drop abandoned localStorage keys from earlier chat-panel persistence attempts. */
function clearLegacyChatUiDebris(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const keys = [
      "indiecut.chatUi.v1",
      "indiecut.chatUi.v2",
      "react-resizable-panels:indiecut-body-with-chat-v1",
      "react-resizable-panels:indiecut-body-with-chat-v2",
      "react-resizable-panels:indiecut-body-with-chat-v3",
      "react-resizable-panels:indiecut-body-with-chat-v4",
    ];
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
