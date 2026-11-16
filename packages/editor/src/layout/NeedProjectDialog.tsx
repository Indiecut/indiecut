import { useState } from "react";
import { getPlatform } from "@indiecut/platform";
import {
  openProjectAt,
  prepareNewProjectFlow,
} from "../project/session";
import { useEditorStore } from "../store/editorStore";
import "./AppModal.css";

export function NeedProjectDialog() {
  const open = useEditorStore((s) => s.needProjectDialogOpen);
  const message = useEditorStore((s) => s.needProjectDialogMessage);
  const setOpen = useEditorStore((s) => s.setNeedProjectDialogOpen);
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onCancel = () => {
    if (busy) return;
    setError(null);
    setOpen(false);
  };

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await prepareNewProjectFlow();
      setOpen(false);
      setSettingsOpen(true, "create");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start new project");
    } finally {
      setBusy(false);
    }
  };

  const onOpen = async () => {
    setBusy(true);
    setError(null);
    try {
      const path = await getPlatform()?.dialog.pickProjectFolder();
      if (!path) return;
      await openProjectAt(path);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="app-modal"
      role="presentation"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        className="app-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="need-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal__header">
          <h2 id="need-project-title" className="app-modal__title">
            Project required
          </h2>
        </div>
        <div className="app-modal__body">
          <p className="app-modal__message">{message}</p>
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
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="app-modal__btn app-modal__btn--secondary"
            onClick={() => void onOpen()}
            disabled={busy}
          >
            Open…
          </button>
          <button
            type="button"
            className="app-modal__btn app-modal__btn--primary"
            onClick={() => void onCreate()}
            disabled={busy}
          >
            Create project…
          </button>
        </div>
      </div>
    </div>
  );
}
