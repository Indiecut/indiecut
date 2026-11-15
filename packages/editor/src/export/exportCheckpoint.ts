import { timelineDurationMs } from "../engine/time";
import type { ProjectDocument } from "../project/types";
import type { ExportProgress, ExportSettings } from "./types";
import { getPlatform } from "@indiecut/platform";

export const EXPORT_CHECKPOINT_VERSION = 1;

export type CheckpointSegmentStatus = "pending" | "done" | "failed";

export type CheckpointSegment = {
  index: number;
  startFrame: number;
  frameCount: number;
  title: string;
  status: CheckpointSegmentStatus;
  path?: string;
  durationSec?: number;
};

export type ExportCheckpoint = {
  version: number;
  createdAt: string;
  updatedAt: string;
  folder: string;
  baseTitle: string;
  settingsFingerprint: string;
  projectFingerprint: string;
  /** Full settings so UI can restore after renderer reload. */
  settings?: ExportSettings;
  totalFrames: number;
  fps: number;
  segments: CheckpointSegment[];
  lastProgress?: Pick<
    ExportProgress,
    "frame" | "totalFrames" | "ratio" | "message" | "phase"
  >;
};

function safeTitle(title: string): string {
  return title.trim().replace(/[^\w.\-]+/g, "_").slice(0, 80) || "Untitled";
}

export function checkpointPath(folder: string, baseTitle: string): string {
  const root = folder.replace(/[/\\]$/, "");
  return `${root}/.indiecut-export-${safeTitle(baseTitle)}.json`;
}

export function settingsFingerprint(settings: ExportSettings): string {
  return [
    settings.resolution,
    settings.bitRate,
    settings.frameRate,
    settings.videoEnabled ? 1 : 0,
    settings.audioEnabled ? 1 : 0,
    settings.title.trim(),
    settings.exportToPath.trim(),
  ].join("|");
}

export function projectFingerprint(project: ProjectDocument): string {
  const durationMs = timelineDurationMs(project.tracks);
  let clipCount = 0;
  for (const track of project.tracks) {
    clipCount += track.clips.length;
  }
  return [
    project.projectPath,
    durationMs,
    project.fps,
    project.width,
    project.height,
    clipCount,
    project.mediaIndex.length,
  ].join("|");
}

export function checkpointMatches(
  checkpoint: ExportCheckpoint,
  project: ProjectDocument,
  settings: ExportSettings,
): boolean {
  return (
    checkpoint.version === EXPORT_CHECKPOINT_VERSION &&
    checkpoint.settingsFingerprint === settingsFingerprint(settings) &&
    checkpoint.projectFingerprint === projectFingerprint(project)
  );
}

async function writeCheckpoint(cp: ExportCheckpoint): Promise<void> {
  const bridge = getPlatform();
  if (!bridge?.fs?.writeFile) {
    throw new Error("Checkpoint write requires the Electron app");
  }
  cp.updatedAt = new Date().toISOString();
  const path = checkpointPath(cp.folder, cp.baseTitle);
  await bridge.fs.writeFile(path, JSON.stringify(cp, null, 2), "utf8");
}

export async function loadCheckpoint(
  folder: string,
  baseTitle: string,
): Promise<ExportCheckpoint | null> {
  const bridge = getPlatform();
  if (!bridge?.fs?.readFile || !bridge.fs.pathExists) return null;
  const path = checkpointPath(folder, baseTitle);
  try {
    const exists = await bridge.fs.pathExists(path);
    if (!exists) return null;
    const raw = await bridge.fs.readFile(path);
    const text = new TextDecoder().decode(raw);
    const parsed = JSON.parse(text) as ExportCheckpoint;
    if (!parsed || parsed.version !== EXPORT_CHECKPOINT_VERSION) return null;
    if (!Array.isArray(parsed.segments)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearCheckpoint(
  folder: string,
  baseTitle: string,
): Promise<void> {
  const bridge = getPlatform();
  if (!bridge?.fs?.unlink) return;
  try {
    await bridge.fs.unlink(checkpointPath(folder, baseTitle));
  } catch {
    /* best-effort */
  }
}

export async function createCheckpoint(args: {
  folder: string;
  baseTitle: string;
  project: ProjectDocument;
  settings: ExportSettings;
  totalFrames: number;
  fps: number;
  segments: Array<{
    index: number;
    startFrame: number;
    frameCount: number;
    title: string;
  }>;
}): Promise<ExportCheckpoint> {
  const now = new Date().toISOString();
  const cp: ExportCheckpoint = {
    version: EXPORT_CHECKPOINT_VERSION,
    createdAt: now,
    updatedAt: now,
    folder: args.folder,
    baseTitle: args.baseTitle,
    settingsFingerprint: settingsFingerprint(args.settings),
    projectFingerprint: projectFingerprint(args.project),
    settings: { ...args.settings },
    totalFrames: args.totalFrames,
    fps: args.fps,
    segments: args.segments.map((s) => ({
      ...s,
      status: "pending" as const,
    })),
  };
  await writeCheckpoint(cp);
  return cp;
}

export async function markSegmentDone(
  cp: ExportCheckpoint,
  index: number,
  result: { path: string; durationSec: number },
  progress?: ExportCheckpoint["lastProgress"],
): Promise<void> {
  const seg = cp.segments[index];
  if (!seg) return;
  seg.status = "done";
  seg.path = result.path;
  seg.durationSec = result.durationSec;
  if (progress) cp.lastProgress = progress;
  await writeCheckpoint(cp);
}

export async function markSegmentFailed(
  cp: ExportCheckpoint,
  index: number,
  progress?: ExportCheckpoint["lastProgress"],
): Promise<void> {
  const seg = cp.segments[index];
  if (!seg) return;
  if (seg.status !== "done") seg.status = "failed";
  if (progress) cp.lastProgress = progress;
  await writeCheckpoint(cp);
}

export async function updateCheckpointProgress(
  cp: ExportCheckpoint,
  progress: ExportCheckpoint["lastProgress"],
): Promise<void> {
  if (!progress) return;
  cp.lastProgress = progress;
  await writeCheckpoint(cp);
}

/** True when a matching checkpoint has at least one finished segment. */
export async function hasResumableCheckpoint(
  folder: string,
  baseTitle: string,
  project: ProjectDocument,
  settings: ExportSettings,
): Promise<boolean> {
  const cp = await loadCheckpoint(folder, baseTitle);
  if (!cp || !checkpointMatches(cp, project, settings)) return false;
  return cp.segments.some((s) => s.status === "done" && Boolean(s.path));
}
