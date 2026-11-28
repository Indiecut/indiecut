import { useEffect, useState } from "react";
import { getRecents, type RecentProject } from "../prefs/appPrefs";
import { openProjectAt } from "../project/session";
import { useEditorStore } from "../store/editorStore";
import "./AppModal.css";

function formatOpenedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function RecentsDialog() {
  const open = useEditorStore((s) => s.recentsDialogOpen);
  const setOpen = useEditorStore((s) => s.setRecentsDialogOpen);
  const [items, setItems] = useState<RecentProject[]>([]);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusyPath(null);
    void getRecents().then(setItems);
  }, [open]);

  if (!open) return null;

  const onClose = () => {
    if (busyPath) return;
    setOpen(false);
  };

  const onOpenProject = async (path: string) => {
    setBusyPath(path);
    setError(null);
    try {
      await openProjectAt(path);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open project");
    } finally {
      setBusyPath(null);
    }
  };

  return (
    <div
      className="app-modal"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="app-modal__dialog app-modal__dialog--recents"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recents-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal__header">
          <h2 id="recents-dialog-title" className="app-modal__title">
            Recent projects
          </h2>
        </div>
        <div className="app-modal__body app-modal__body--recents">
          {items.length === 0 ? (
            <p className="app-modal__message">No recent projects yet.</p>
          ) : (
            <div className="app-modal__recents-list" role="list">
              {items.map((r) => {
                const opened = formatOpenedAt(r.openedAt);
                const busy = busyPath === r.path;
                return (
                  <button
                    key={r.path}
                    type="button"
                    className="app-modal__recent-item"
                    role="listitem"
                    title={r.path}
                    disabled={Boolean(busyPath)}
                    onClick={() => void onOpenProject(r.path)}
                  >
                    <span className="app-modal__recent-item-title">
                      {busy ? "Opening…" : r.title}
                    </span>
                    <span className="app-modal__recent-item-path">{r.path}</span>
                    {opened ? (
                      <span className="app-modal__recent-item-meta">
                        Opened {opened}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {error ? (
            <p className="app-modal__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="app-modal__footer">
          <button
            type="button"
            className="app-modal__btn app-modal__btn--ghost"
            onClick={onClose}
            disabled={Boolean(busyPath)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
