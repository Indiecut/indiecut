import {
  getLastProjectPath,
  pushRecent,
  setLastProjectPath,
} from "../prefs/appPrefs";
import { useEditorStore } from "../store/editorStore";
import { createEmptyProject } from "./createProject";
import { parseProjectJson, serializeProject } from "./persistence";
import type { ProjectDocument } from "./types";

const AUTOSAVE_MS = 800;

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveStarted = false;
let bootPromise: Promise<void> | null = null;

function requireBridge() {
  const bridge = window.indiecut;
  if (!bridge?.fs || !bridge.dialog) {
    throw new Error("IndieCut Electron bridge unavailable");
  }
  return bridge;
}

function isDirty(): boolean {
  const { project, lastSavedAt } = useEditorStore.getState();
  if (!project.projectPath) return false;
  if (!lastSavedAt) return true;
  return project.updatedAt !== lastSavedAt;
}

export async function saveProjectNow(
  projectOverride?: ProjectDocument,
): Promise<void> {
  const bridge = requireBridge();
  const state = useEditorStore.getState();
  const project = projectOverride ?? state.project;
  if (!project.projectPath) return;

  const savedAt = new Date().toISOString();
  const toWrite: ProjectDocument = {
    ...project,
    projectPath: project.projectPath,
    updatedAt: savedAt,
  };
  await bridge.fs.ensureProjectLayout(toWrite.projectPath);
  await bridge.fs.writeProjectJson(
    toWrite.projectPath,
    serializeProject(toWrite),
  );
  useEditorStore.setState({
    project: {
      ...useEditorStore.getState().project,
      projectPath: toWrite.projectPath,
      title: toWrite.title,
      updatedAt: savedAt,
    },
    lastSavedAt: savedAt,
  });
  await pushRecent({ path: toWrite.projectPath, title: toWrite.title });
  await setLastProjectPath(toWrite.projectPath);
}

export function scheduleAutosave(): void {
  const { project } = useEditorStore.getState();
  if (!project.projectPath) return;
  if (!isDirty()) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    if (!isDirty()) return;
    void saveProjectNow().catch((err) => {
      console.error("Autosave failed", err);
    });
  }, AUTOSAVE_MS);
}

export function startAutosaveSubscription(): () => void {
  if (autosaveStarted) return () => undefined;
  autosaveStarted = true;
  return useEditorStore.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    if (!state.project.projectPath) return;
    if (state.lastSavedAt && state.project.updatedAt === state.lastSavedAt) {
      return;
    }
    scheduleAutosave();
  });
}

export async function openProjectAt(projectPath: string): Promise<void> {
  const bridge = requireBridge();
  const exists = await bridge.fs.pathExists(projectPath);
  if (!exists) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }
  await bridge.fs.ensureProjectLayout(projectPath);
  const raw = await bridge.fs.readProjectJson(projectPath);
  const doc = parseProjectJson(raw);
  doc.projectPath = projectPath;
  useEditorStore.setState({
    project: doc,
    selectedClipId: null,
    selectedClipIds: [],
    selectedTrackId: null,
    lastSavedAt: doc.updatedAt,
  });
  await pushRecent({ path: projectPath, title: doc.title });
  await setLastProjectPath(projectPath);

  // Recover files copied to media/ whose mediaIndex entry never persisted
  // (e.g. Vite/Electron reload mid-import).
  void import("../media/importMedia")
    .then(({ reconcileOrphanMedia }) => reconcileOrphanMedia())
    .catch((err) => {
      console.warn("Orphan media reconcile failed", err);
    });
}

export async function createProjectAt(
  projectPath: string,
  seed?: Partial<ProjectDocument>,
): Promise<void> {
  const bridge = requireBridge();
  const jsonPath = `${projectPath.replace(/[/\\]+$/, "")}/project.json`;
  const alreadyExists = await bridge.fs.pathExists(jsonPath);
  if (alreadyExists) {
    throw new Error(
      "A project already exists in that folder. Choose a different name or location.",
    );
  }
  await bridge.fs.ensureProjectLayout(projectPath);
  const doc = createEmptyProject({
    ...seed,
    projectPath,
    title: seed?.title ?? "Untitled",
  });
  useEditorStore.setState({
    project: doc,
    selectedClipId: null,
    selectedClipIds: [],
    selectedTrackId: null,
    selectedTransitionId: null,
    selectedMediaId: null,
    lastSavedAt: null,
  });
  await saveProjectNow(doc);
}

/**
 * Flush the open project to disk (best-effort) before starting the New project
 * UI. Does NOT clear the in-memory project — Cancel must leave it intact.
 */
export async function prepareNewProjectFlow(): Promise<void> {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  const { project } = useEditorStore.getState();
  if (!project.projectPath) return;
  try {
    await saveProjectNow();
  } catch (err) {
    console.warn("Could not flush project before New project", err);
  }
}

export async function bootProjectSession(): Promise<void> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    startAutosaveSubscription();

    if (!window.indiecut?.fs) {
      useEditorStore.setState({
        project: createEmptyProject(),
        lastSavedAt: null,
      });
      return;
    }

    const lastPath = await getLastProjectPath();
    if (lastPath) {
      try {
        const exists = await window.indiecut.fs.pathExists(lastPath);
        if (exists) {
          await openProjectAt(lastPath);
          return;
        }
      } catch (err) {
        console.warn("Failed to reopen last project", err);
      }
    }

    useEditorStore.setState({
      project: createEmptyProject(),
      lastSavedAt: null,
    });
  })();
  return bootPromise;
}
