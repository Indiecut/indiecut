import { useEffect, useRef, useState } from "react";
import { IconKeyboard, IconSettings, IconChevronDown } from "../icons/Icons";
import { getRecents, type RecentProject } from "../prefs/appPrefs";
import {
  openProjectAt,
  prepareNewProjectFlow,
} from "../project/session";
import { useEditorStore } from "../store/editorStore";
import "./Header.css";
import { getPlatform } from "@indiecut/platform";

function formatAutosaveTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function Header() {
  const title = useEditorStore((s) => s.project.title);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const setExportOpen = useEditorStore((s) => s.setExportOpen);
  const setShortcutsOpen = useEditorStore((s) => s.setShortcutsOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    void getRecents().then(setRecents);
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const onNew = async () => {
    setMenuOpen(false);
    // Flush current project to disk first — do NOT clear the in-memory
    // project. Canceling the New project dialog must leave the old one open.
    await prepareNewProjectFlow();
    setSettingsOpen(true, "create");
  };

  const onOpen = async () => {
    setMenuOpen(false);
    try {
      const path = await getPlatform()?.dialog.pickProjectFolder();
      if (!path) return;
      await openProjectAt(path);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not open project");
    }
  };

  const onOpenRecent = async (path: string) => {
    setMenuOpen(false);
    try {
      await openProjectAt(path);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not open project");
    }
  };

  // Traffic-light inset only for the desktop shell (hiddenInset title bar), not web/PWA.
  const isMacDesktop =
    typeof navigator !== "undefined" &&
    /Mac/.test(navigator.platform) &&
    Boolean(getPlatform()?.capabilities?.revealInFolder);

  return (
    <header className={`app-header${isMacDesktop ? " app-header--mac" : ""}`}>
      <div className="app-header__left">
        <span className="app-header__brand">
          <img
            className="app-header__brand-icon"
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
            width={20}
            height={20}
            draggable={false}
          />
          IndieCut
        </span>
        <div className="app-header__menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="app-header__menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            Menu
            <IconChevronDown size={12} className="app-header__chevron" />
          </button>
          {menuOpen ? (
            <div className="app-header__dropdown" role="menu">
              <button
                type="button"
                className="app-header__dropdown-item"
                role="menuitem"
                onClick={() => void onNew()}
              >
                New project…
              </button>
              <button
                type="button"
                className="app-header__dropdown-item"
                role="menuitem"
                onClick={() => void onOpen()}
              >
                Open…
              </button>
              {recents.length > 0 ? (
                <>
                  <div className="app-header__dropdown-sep" />
                  <div className="app-header__dropdown-label">Recent</div>
                  {recents.map((r) => (
                    <button
                      key={r.path}
                      type="button"
                      className="app-header__dropdown-item app-header__dropdown-item--recent"
                      role="menuitem"
                      title={r.path}
                      onClick={() => void onOpenRecent(r.path)}
                    >
                      <span className="app-header__recent-title">{r.title}</span>
                      <span className="app-header__recent-path">{r.path}</span>
                    </button>
                  ))}
                </>
              ) : null}
              <div className="app-header__dropdown-sep" />
              <button
                type="button"
                className="app-header__dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setShortcutsOpen(true);
                }}
              >
                Help → Shortcut
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="app-header__center">
        <span className="app-header__project">{title}</span>
        <span className="app-header__autosave">
          <span className="app-header__autosave-dot" aria-hidden />
          Auto saved: {formatAutosaveTime(lastSavedAt)}
        </span>
      </div>

      <div className="app-header__right">
        <button
          type="button"
          className="app-header__icon-btn"
          title="Shortcuts"
          aria-label="Shortcuts"
          onClick={() => setShortcutsOpen(true)}
        >
          <IconKeyboard />
        </button>
        <button
          type="button"
          className="app-header__icon-btn"
          title="Settings"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <IconSettings />
        </button>
        <button
          type="button"
          className="app-header__export"
          onClick={() => setExportOpen(true)}
        >
          Export
        </button>
      </div>
    </header>
  );
}
