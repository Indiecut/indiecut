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
const MAX_RECENTS = 10;

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
