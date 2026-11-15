import { useEffect, useState } from "react";
import type {
  ColorSpace,
  ImportMaterialMode,
  ResolutionMode,
} from "../project/types";
import { createProjectAt, saveProjectNow } from "../project/session";
import { useEditorStore } from "../store/editorStore";
import "./ProjectSettingsModal.css";
import { getPlatform } from "@indiecut/platform";

type Draft = {
  title: string;
  projectPath: string;
  importMaterialMode: ImportMaterialMode;
  resolutionMode: ResolutionMode;
  colorSpace: ColorSpace;
  width: number;
  height: number;
};

const RESOLUTION_PRESETS: Record<
  ResolutionMode,
  { width: number; height: number } | null
> = {
  adapted: null,
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "2k": { width: 2560, height: 1440 },
};

function emptyDraft(): Draft {
  return {
    title: "Untitled",
    projectPath: "",
    importMaterialMode: "copy_to_project",
    resolutionMode: "adapted",
    colorSpace: "sdr_rec709",
    width: 1920,
    height: 1080,
  };
}

function draftFromStore(): Draft {
  const p = useEditorStore.getState().project;
  return {
    title: p.title,
    projectPath: p.projectPath,
    importMaterialMode: p.importMaterialMode,
    resolutionMode: p.resolutionMode,
    colorSpace: p.colorSpace,
    width: p.width,
    height: p.height,
  };
}

export function ProjectSettingsModal() {
  const open = useEditorStore((s) => s.settingsOpen);
  const mode = useEditorStore((s) => s.projectSettingsMode);
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const patchProject = useEditorStore((s) => s.patchProject);
  const [draft, setDraft] = useState<Draft>(draftFromStore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreate = mode === "create";

  useEffect(() => {
    if (open) {
      setDraft(isCreate ? emptyDraft() : draftFromStore());
      setError(null);
    }
  }, [open, isCreate]);

  if (!open) return null;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const onResolutionChange = (modeValue: ResolutionMode) => {
    const preset = RESOLUTION_PRESETS[modeValue];
    setDraft((d) => ({
      ...d,
      resolutionMode: modeValue,
      width: preset?.width ?? d.width,
      height: preset?.height ?? d.height,
    }));
  };

  const browseSaveTo = async () => {
    setError(null);
    try {
      const bridge = getPlatform();
      if (!bridge?.dialog) {
        setError("File dialogs require the Electron app.");
        return;
      }
      const suggested = draft.title.trim() || "Untitled";
      let path: string | null = null;
      // New project always creates a fresh folder. Editing an existing
      // project with no path yet also creates; otherwise pick a folder.
      if (isCreate || !draft.projectPath) {
        path = await bridge.dialog.createProjectFolder(suggested);
      } else {
        path = await bridge.dialog.pickProjectFolder();
      }
      if (path) update("projectPath", path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pick folder");
    }
  };

  const onCancel = () => setSettingsOpen(false);

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const nextPath = draft.projectPath.trim();
      const currentPath = useEditorStore.getState().project.projectPath;

      const patch = {
        title: draft.title.trim() || "Untitled",
        importMaterialMode: draft.importMaterialMode,
        resolutionMode: draft.resolutionMode,
        colorSpace: draft.colorSpace,
        width: draft.width,
        height: draft.height,
        projectPath: nextPath,
      };

      if (isCreate) {
        if (!nextPath) {
          throw new Error("Choose a folder to save the new project.");
        }
        // Fresh project only — never copy the currently open timeline/media.
        await createProjectAt(nextPath, patch);
      } else if (nextPath && nextPath !== currentPath) {
        await createProjectAt(nextPath, {
          ...useEditorStore.getState().project,
          ...patch,
        });
      } else {
        patchProject(patch);
        if (nextPath) {
          await saveProjectNow({
            ...useEditorStore.getState().project,
            ...patch,
          });
        }
      }
      setSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="project-settings"
      role="presentation"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div
        className="project-settings__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="project-settings__header">
          <h2 id="project-settings-title" className="project-settings__title">
            {isCreate ? "New project" : "Project settings"}
          </h2>
        </div>

        <div className="project-settings__body">
          <div className="project-settings__form">
            <label className="project-settings__field">
              <span className="project-settings__label">Name</span>
              <input
                className="project-settings__input"
                value={draft.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </label>

            <div className="project-settings__field">
              <span className="project-settings__label">Save to</span>
              <div className="project-settings__path-row">
                <input
                  className="project-settings__input"
                  value={draft.projectPath}
                  readOnly
                  placeholder="Choose a project folder…"
                />
                <button
                  type="button"
                  className="project-settings__browse"
                  onClick={() => void browseSaveTo()}
                >
                  Browse
                </button>
              </div>
            </div>

            <fieldset className="project-settings__field project-settings__fieldset">
              <legend className="project-settings__label">
                Import material
              </legend>
              <label className="project-settings__radio">
                <input
                  type="radio"
                  name="importMaterial"
                  checked={draft.importMaterialMode === "copy_to_project"}
                  onChange={() =>
                    update("importMaterialMode", "copy_to_project")
                  }
                />
                Copy to project
              </label>
              <label className="project-settings__radio">
                <input
                  type="radio"
                  name="importMaterial"
                  checked={draft.importMaterialMode === "keep_original"}
                  onChange={() =>
                    update("importMaterialMode", "keep_original")
                  }
                />
                Keep in original place
              </label>
            </fieldset>

            <label className="project-settings__field">
              <span className="project-settings__label">Resolution</span>
              <select
                className="project-settings__input"
                value={draft.resolutionMode}
                onChange={(e) =>
                  onResolutionChange(e.target.value as ResolutionMode)
                }
              >
                <option value="adapted">Adapted</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="2k">2K</option>
              </select>
            </label>

            <label className="project-settings__field">
              <span className="project-settings__label">Color space</span>
              <select
                className="project-settings__input"
                value={draft.colorSpace}
                onChange={(e) =>
                  update("colorSpace", e.target.value as ColorSpace)
                }
              >
                <option value="sdr_rec709">Standard SDR - Rec.709</option>
              </select>
            </label>
          </div>
          {error ? (
            <p className="project-settings__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="project-settings__footer">
          <button
            type="button"
            className="project-settings__btn project-settings__btn--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="project-settings__btn project-settings__btn--primary"
            onClick={() => void onSave()}
            disabled={busy}
          >
            {busy ? "Saving…" : isCreate ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
