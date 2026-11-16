import { useState } from "react";
import { deleteCurrentProject } from "../project/session";
import { useEditorStore } from "../store/editorStore";
import "./AppModal.css";

export function DeleteProjectDialog() {
  const open = useEditorStore((s) => s.deleteProjectDialogOpen);
  const setOpen = useEditorStore((s) => s.setDeleteProjectDialogOpen);
  const title = useEditorStore((s) => s.project.title);
  const projectPath = useEditorStore((s) => s.project.projectPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const onCancel = () => {
    if (busy) return;
    setError(null);
    setOpen(false);
  };

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteCurrentProject();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete project");
    } finally {
      setBusy(false);
    }
  };

  const label = title.trim() || "Untitled";

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
        aria-labelledby="delete-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal__header">
          <h2 id="delete-project-title" className="app-modal__title">
            Delete project?
          </h2>
        </div>
        <div className="app-modal__body">
          <p className="app-modal__message">
            Permanently delete “{label}” and its project folder
            {projectPath ? ` (${projectPath})` : ""}. Media copied into the
            project will be removed. This cannot be undone.
          </p>
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
            className="app-modal__btn app-modal__btn--danger"
            onClick={() => void onDelete()}
            disabled={busy || !projectPath}
          >
            {busy ? "Deleting…" : "Delete project"}
          </button>
        </div>
      </div>
    </div>
  );
}
