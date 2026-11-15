import type { ProjectDocument } from "../project/types";
import type { ExportUiPhase } from "../store/editorStore";
import { useEditorStore } from "../store/editorStore";
import {
  checkpointMatches,
  loadCheckpoint,
  projectFingerprint,
  type ExportCheckpoint,
} from "./exportCheckpoint";
import type { ExportProgress, ExportSettings } from "./types";

const STORAGE_KEY = "indiecut.exportUiSession.v1";

export type PersistedExportUiSession = {
  version: 1;
  projectPath: string;
  projectFingerprint: string;
  draft: ExportSettings;
  /** Always restored as interrupted after reload — live encode cannot continue. */
  phase: "exporting" | "interrupted";
  progress: ExportProgress | null;
  error: string | null;
  canResume: boolean;
  savedAt: string;
};

function canUseStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function readExportUiSession(): PersistedExportUiSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedExportUiSession;
    if (!parsed || parsed.version !== 1 || !parsed.draft) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearExportUiSession(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function persistExportUiSession(args: {
  project: ProjectDocument;
  draft: ExportSettings;
  phase: "exporting" | "interrupted";
  progress: ExportProgress | null;
  error: string | null;
  canResume: boolean;
}): void {
  if (!canUseStorage()) return;
  const payload: PersistedExportUiSession = {
    version: 1,
    projectPath: args.project.projectPath,
    projectFingerprint: projectFingerprint(args.project),
    draft: args.draft,
    phase: args.phase,
    progress: args.progress,
    error: args.error,
    canResume: args.canResume,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function progressFromCheckpoint(cp: ExportCheckpoint): ExportProgress {
  const framesDone = cp.segments.reduce(
    (sum, s) => sum + (s.status === "done" ? s.frameCount : 0),
    0,
  );
  const totalFrames = Math.max(1, cp.totalFrames);
  const segsDone = cp.segments.filter((s) => s.status === "done").length;
  if (cp.lastProgress) {
    return {
      ...cp.lastProgress,
      phase: "interrupted",
      canResume: segsDone > 0,
    };
  }
  return {
    phase: "interrupted",
    frame: framesDone,
    totalFrames,
    ratio: 0.05 + (0.85 * framesDone) / totalFrames,
    message:
      segsDone > 0
        ? `Export interrupted — ${segsDone}/${cp.segments.length} segments saved`
        : "Export interrupted",
    canResume: segsDone > 0,
  };
}

function applyInterruptedUi(args: {
  project: ProjectDocument;
  draft: ExportSettings;
  progress: ExportProgress;
  error: string;
  canResume: boolean;
}): void {
  const store = useEditorStore.getState();
  store.setExportDraft(args.draft);
  store.setExportProgress(args.progress);
  store.setExportError(args.error);
  store.setExportCanResume(args.canResume);
  store.setExportDonePath(null);
  store.setExportPhase("interrupted");
  store.setExportOpen(true);
  persistExportUiSession({
    project: args.project,
    draft: args.draft,
    phase: "interrupted",
    progress: args.progress,
    error: args.error,
    canResume: args.canResume,
  });
}

/**
 * Reopen export modal in Interrupted state when a session/checkpoint survived
 * sleep, crash, or renderer reload.
 */
export async function tryRestoreExportUi(
  project: ProjectDocument,
): Promise<boolean> {
  const store = useEditorStore.getState();
  // Don't clobber an in-flight UI session in this renderer.
  if (
    store.exportOpen &&
    (store.exportPhase === "exporting" ||
      store.exportPhase === "interrupted" ||
      store.exportPhase === "done")
  ) {
    return false;
  }

  const interruptMsg =
    "Export was interrupted (sleep or reload). You can resume.";

  const session = readExportUiSession();
  if (session && session.projectPath === project.projectPath) {
    const folder = session.draft.exportToPath.trim();
    const title =
      session.draft.title.trim() || project.title.trim() || "Untitled";
    if (folder) {
      const cp = await loadCheckpoint(folder, title);
      if (cp) {
        const matchesProject =
          checkpointMatches(cp, project, session.draft) ||
          cp.projectFingerprint === session.projectFingerprint;
        if (matchesProject) {
          const hasDone = cp.segments.some(
            (s) => s.status === "done" && Boolean(s.path),
          );
          const progress =
            session.progress &&
            (session.progress.frame > 0 ||
              session.progress.phase === "interrupted" ||
              session.progress.phase === "video")
              ? {
                  ...session.progress,
                  phase: "interrupted" as const,
                  canResume: hasDone,
                }
              : progressFromCheckpoint(cp);

          applyInterruptedUi({
            project,
            draft: session.draft,
            progress,
            error: session.error || interruptMsg,
            canResume: hasDone,
          });
          return true;
        }
      }
    }
    clearExportUiSession();
  }

  // Fallback: checkpoint in project exports/ with embedded settings.
  if (!project.projectPath) return false;
  const folder = `${project.projectPath.replace(/[/\\]$/, "")}/exports`;
  const title = project.title.trim() || "Untitled";
  const cp = await loadCheckpoint(folder, title);
  if (!cp?.settings) return false;
  if (cp.projectFingerprint !== projectFingerprint(project)) return false;

  const hasDone = cp.segments.some((s) => s.status === "done" && Boolean(s.path));
  applyInterruptedUi({
    project,
    draft: cp.settings,
    progress: progressFromCheckpoint(cp),
    error: interruptMsg,
    canResume: hasDone,
  });
  return true;
}

/** Persist current store export UI (call from modal during export). */
export function persistExportUiFromStore(project: ProjectDocument): void {
  const s = useEditorStore.getState();
  if (!s.exportDraft) return;
  if (s.exportPhase !== "exporting" && s.exportPhase !== "interrupted") {
    return;
  }
  persistExportUiSession({
    project,
    draft: s.exportDraft,
    phase: s.exportPhase,
    progress: s.exportProgress,
    error: s.exportError,
    canResume: s.exportCanResume,
  });
}

export function shouldPersistPhase(phase: ExportUiPhase): boolean {
  return phase === "exporting" || phase === "interrupted";
}
