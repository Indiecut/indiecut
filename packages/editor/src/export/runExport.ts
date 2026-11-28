import { timelineDurationMs } from "../engine/time";
import type { ProjectDocument } from "../project/types";
import { planExportAudio } from "./exportAudio";
import { exportAudioOnlyFile } from "./exportAudioOnly";
import {
  buildSeekLayersAtTime,
  collectExportAssets,
  loadExportAssetBuffer,
} from "./buildSeekLayers";
import { concatSegmentMp4 } from "./concatSegmentMp4";
import {
  checkpointMatches,
  clearCheckpoint,
  createCheckpoint,
  loadCheckpoint,
  markSegmentDone,
  markSegmentFailed,
  type ExportCheckpoint,
} from "./exportCheckpoint";
import { resolveExportProfile } from "./profiles";
import type { ExportProgress, ExportSettings } from "./types";
import { ExportWorkerSession } from "./exportWorkerClient";
import { getPlatform } from "@indiecut/platform";

export type RunExportArgs = {
  project: ProjectDocument;
  settings: ExportSettings;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  /** Occasional downscaled JPEG data-URL of the composed export stage. */
  onPreview?: (dataUrl: string, frameIndex: number) => void;
  /** Continue from a matching on-disk checkpoint (skip done segments). */
  resume?: boolean;
};

export type RunExportResult = {
  finalPath: string;
  bytesWritten: number;
};

/** Target ~5s segments, clamped. */
const SEGMENT_FRAMES_MIN = 60;
const SEGMENT_FRAMES_MAX = 300;

export function resolveSegmentFrameCount(fps: number): number {
  const target = Math.round(Math.max(1, fps) * 5);
  return Math.min(SEGMENT_FRAMES_MAX, Math.max(SEGMENT_FRAMES_MIN, target));
}

/** Use checkpointed ~5s segments when the timeline spans at least two segments. */
export function shouldUseSegmentedExport(
  totalFrames: number,
  fps = 30,
): boolean {
  return totalFrames >= resolveSegmentFrameCount(fps) * 2;
}

/** Many small contiguous ranges for checkpointed queue export. */
export function splitSmallFrameRanges(
  totalFrames: number,
  segmentFrames: number,
  baseTitle: string,
): Array<{
  index: number;
  startFrame: number;
  frameCount: number;
  title: string;
}> {
  const size = Math.max(1, segmentFrames);
  const ranges: Array<{
    index: number;
    startFrame: number;
    frameCount: number;
    title: string;
  }> = [];
  let start = 0;
  let index = 0;
  while (start < totalFrames) {
    const frameCount = Math.min(size, totalFrames - start);
    ranges.push({
      index,
      startFrame: start,
      frameCount,
      title: `${baseTitle}.seg${index}`,
    });
    start += frameCount;
    index += 1;
  }
  return ranges;
}

function report(
  onProgress: RunExportArgs["onProgress"],
  progress: ExportProgress,
) {
  onProgress?.(progress);
}

async function blockSleep(): Promise<void> {
  try {
    await getPlatform()?.power?.blockSleep();
  } catch {
    /* optional */
  }
}

async function allowSleep(): Promise<void> {
  try {
    await getPlatform()?.power?.allowSleep();
  } catch {
    /* optional */
  }
}

async function loadAssetsIntoSession(
  session: ExportWorkerSession,
  project: ProjectDocument,
  aborted: () => boolean,
): Promise<void> {
  const assets = await collectExportAssets(project);
  for (const need of assets) {
    if (aborted()) throw new Error("Export cancelled");
    const { buffer, mimeHint } = await loadExportAssetBuffer(need, project);
    const copy = buffer.slice(0);
    await session.loadAsset({
      assetId: need.assetId,
      kind: need.kind,
      buffer: copy,
      mimeHint,
    });
  }
}

async function encodeSegmentRange(args: {
  session: ExportWorkerSession;
  project: ProjectDocument;
  profile: ReturnType<typeof resolveExportProfile>;
  startFrame: number;
  frameCount: number;
  folder: string;
  title: string;
  aborted: () => boolean;
  onFramesDone: (doneInSegment: number) => void;
  emitPreview?: boolean;
}): Promise<{ path: string; durationSec: number }> {
  const {
    session,
    project,
    profile,
    startFrame,
    frameCount,
    folder,
    title,
    aborted,
    onFramesDone,
    emitPreview = false,
  } = args;
  const bridge = getPlatform()!;
  const opened = await bridge.exportStream.open({
    folder,
    title,
  });
  session.setStreamId(opened.streamId);

  try {
    await session.beginEncode({
      width: profile.width,
      height: profile.height,
      fps: profile.fps,
      totalFrames: frameCount,
      layoutWidth: project.width,
      layoutHeight: project.height,
      videoQuality: profile.videoQualityConfig,
      audio: null,
      emitPreview,
    });

    for (let i = 0; i < frameCount; i++) {
      if (aborted()) {
        await session.cancelEncode();
        throw new Error("Export cancelled");
      }
      const globalFrame = startFrame + i;
      const globalMs = (globalFrame / profile.fps) * 1000;
      const layers = await buildSeekLayersAtTime(
        project,
        globalMs,
        (lutId, text) => {
          session.loadLut(lutId, text);
          session.markLutLoaded(lutId);
        },
        (lutId) => session.isLutLoaded(lutId),
      );
      await session.encodeFrame(i, layers);
      onFramesDone(i + 1);

      if (i % 3 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    await session.finishEncode();
    const closed = await bridge.exportStream.close(opened.streamId, {
      abort: false,
    });
    session.setStreamId(null);
    if (!closed.ok || !closed.finalPath) {
      throw new Error(closed.error || "Failed to finalize segment");
    }
    return {
      path: closed.finalPath,
      durationSec: frameCount / profile.fps,
    };
  } catch (err) {
    try {
      await bridge.exportStream.close(opened.streamId, { abort: true });
    } catch {
      /* ignore */
    }
    session.setStreamId(null);
    throw err;
  }
}

async function unlinkQuiet(path: string): Promise<void> {
  try {
    await getPlatform()?.fs?.unlink?.(path);
  } catch {
    /* best-effort */
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    return Boolean(await getPlatform()?.fs?.pathExists?.(path));
  } catch {
    return false;
  }
}

/**
 * Seek-and-draw export via MediaBunny → Electron StreamTarget.
 *
 * Short timelines: one hardware worker, single encode.
 * Longer timelines (≥ ~10s): ~5s segments, one hardware worker sequentially,
 * on-disk checkpoints for resume (same bitstream for safe concat).
 */
export async function runExport(args: RunExportArgs): Promise<RunExportResult> {
  const {
    project,
    settings,
    signal,
    onProgress,
    onPreview,
    resume = false,
  } = args;
  const bridge = getPlatform();
  if (!bridge?.exportStream) {
    throw new Error("Export requires the Electron app");
  }
  if (!settings.videoEnabled && !settings.audioEnabled) {
    throw new Error("Enable video or audio export");
  }
  if (!settings.exportToPath.trim()) {
    throw new Error("Choose an export destination folder");
  }

  const profile = resolveExportProfile(settings);
  const durationMs = timelineDurationMs(project.tracks);
  if (durationMs <= 0) {
    throw new Error("Timeline is empty — add clips before exporting");
  }

  const totalFrames = Math.max(1, Math.ceil((durationMs / 1000) * profile.fps));
  let aborted = false;
  const isAborted = () => aborted || Boolean(signal?.aborted);
  const onAbort = () => {
    aborted = true;
  };
  signal?.addEventListener("abort", onAbort);

  const folder = settings.exportToPath.trim();
  const baseTitle = settings.title.trim() || project.title || "Untitled";
  const sessions: ExportWorkerSession[] = [];
  /** Completed segment paths kept for concat; not wiped on interrupt. */
  const completedSegPaths: string[] = [];
  let checkpoint: ExportCheckpoint | null = null;
  let userCancelled = false;

  await blockSleep();

  try {
    report(onProgress, {
      phase: "preparing",
      frame: 0,
      totalFrames,
      ratio: 0,
      message: resume ? "Resuming export…" : "Preparing export…",
    });

    type AudioPayload = {
      sampleRate: number;
      numberOfChannels: number;
      pcm: Float32Array;
      audioQuality: typeof profile.audioQualityConfig;
    };

    /** Remix timeline audio — used for audio-only, single-worker encode, or final concat. */
    const mixAudio = async (ratio = 0.02): Promise<AudioPayload | null> => {
      if (!settings.audioEnabled) return null;
      report(onProgress, {
        phase: "audio",
        frame: 0,
        totalFrames,
        ratio,
        message: "Mixing audio…",
      });
      const plan = await planExportAudio(project, { forceRemix: true });
      if (plan.mode !== "remix") return null;
      return {
        sampleRate: plan.sampleRate,
        numberOfChannels: plan.numberOfChannels,
        pcm: plan.pcm,
        audioQuality: profile.audioQualityConfig,
      };
    };

    if (isAborted()) throw new Error("Export cancelled");

    // Audio-only: mix then encode AAC.
    if (!settings.videoEnabled) {
      const audioPayload = await mixAudio(0.02);
      if (!audioPayload) {
        throw new Error("No audible clips to export");
      }
      if (isAborted()) throw new Error("Export cancelled");
      report(onProgress, {
        phase: "audio",
        frame: 0,
        totalFrames,
        ratio: 0.35,
        message: "Encoding audio…",
      });
      const result = await exportAudioOnlyFile({
        folder,
        title: baseTitle,
        audio: audioPayload,
        signal,
      });
      if (isAborted()) throw new Error("Export cancelled");
      report(onProgress, {
        phase: "done",
        frame: totalFrames,
        totalFrames,
        ratio: 1,
        message: "Export complete",
        finalPath: result.finalPath,
      });
      return result;
    }

    const useQueue = shouldUseSegmentedExport(totalFrames, profile.fps);

    if (!useQueue) {
      // Short timeline: mix once, then encode video+audio in one worker.
      const audioPayload = await mixAudio(0.02);
      if (isAborted()) throw new Error("Export cancelled");

      const session = new ExportWorkerSession();
      sessions.push(session);
      session.setFailureHandler((err) => {
        console.error("Export worker failure", err);
      });

      const opened = await bridge.exportStream.open({
        folder,
        title: baseTitle,
      });
      await session.init({
        width: profile.width,
        height: profile.height,
      });
      // After init — dispose() inside init clears handlers.
      if (onPreview) {
        session.setPreviewHandler((dataUrl, frameIndex) => {
          onPreview(dataUrl, frameIndex);
        });
      }
      session.setStreamId(opened.streamId);

      await loadAssetsIntoSession(session, project, isAborted);

      const audioForWorker = audioPayload
        ? {
            ...audioPayload,
            pcm: audioPayload.pcm.slice(),
          }
        : null;

      await session.beginEncode({
        width: profile.width,
        height: profile.height,
        fps: profile.fps,
        totalFrames,
        layoutWidth: project.width,
        layoutHeight: project.height,
        videoQuality: profile.videoQualityConfig,
        audio: audioForWorker,
        emitPreview: Boolean(onPreview),
      });

      report(onProgress, {
        phase: "video",
        frame: 0,
        totalFrames,
        ratio: 0.05,
        message: "Encoding video…",
      });

      for (let i = 0; i < totalFrames; i++) {
        if (isAborted()) {
          await session.cancelEncode();
          throw new Error("Export cancelled");
        }
        const globalMs = (i / profile.fps) * 1000;
        const layers = await buildSeekLayersAtTime(
          project,
          globalMs,
          (lutId, text) => {
            session.loadLut(lutId, text);
            session.markLutLoaded(lutId);
          },
          (lutId) => session.isLutLoaded(lutId),
        );
        await session.encodeFrame(i, layers);
        if (i % 3 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
        const ratio = 0.05 + (0.9 * (i + 1)) / totalFrames;
        report(onProgress, {
          phase: "video",
          frame: i + 1,
          totalFrames,
          ratio,
          message: `Encoding frame ${i + 1} / ${totalFrames}`,
        });
      }

      report(onProgress, {
        phase: "finalizing",
        frame: totalFrames,
        totalFrames,
        ratio: 0.97,
        message: "Finalizing…",
      });

      await session.finishEncode();
      const closed = await bridge.exportStream.close(opened.streamId, {
        abort: false,
      });
      session.setStreamId(null);
      if (!closed.ok || !closed.finalPath) {
        throw new Error(closed.error || "Failed to finalize export file");
      }

      report(onProgress, {
        phase: "done",
        frame: totalFrames,
        totalFrames,
        ratio: 1,
        message: "Export complete",
        finalPath: closed.finalPath,
      });

      return {
        finalPath: closed.finalPath,
        bytesWritten: closed.bytesWritten ?? 0,
      };
    }

    // —— Sequential ~5s segments (one HW worker, checkpointed for resume) ——
    const segmentFrames = resolveSegmentFrameCount(profile.fps);
    const ranges = splitSmallFrameRanges(totalFrames, segmentFrames, baseTitle);

    if (resume) {
      const existing = await loadCheckpoint(folder, baseTitle);
      if (!existing || !checkpointMatches(existing, project, settings)) {
        throw new Error(
          "No matching export checkpoint to resume — start a new export",
        );
      }
      if (existing.totalFrames !== totalFrames || existing.segments.length !== ranges.length) {
        throw new Error(
          "Export checkpoint does not match this timeline — start a new export",
        );
      }
      checkpoint = existing;
      for (const seg of checkpoint.segments) {
        if (seg.status === "done" && seg.path) {
          if (await pathExists(seg.path)) {
            completedSegPaths.push(seg.path);
          } else {
            seg.status = "pending";
            delete seg.path;
            delete seg.durationSec;
          }
        } else if (seg.status === "done") {
          seg.status = "pending";
        }
      }
    } else {
      // Fresh run: drop prior checkpoint + orphan segment files for this title.
      const prior = await loadCheckpoint(folder, baseTitle);
      if (prior) {
        for (const seg of prior.segments) {
          if (seg.path) await unlinkQuiet(seg.path);
        }
        await clearCheckpoint(folder, baseTitle);
      }
      checkpoint = await createCheckpoint({
        folder,
        baseTitle,
        project,
        settings,
        totalFrames,
        fps: profile.fps,
        segments: ranges.map((r) => ({
          index: r.index,
          startFrame: r.startFrame,
          frameCount: r.frameCount,
          title: r.title,
        })),
      });
    }

    const pendingIndexes = checkpoint.segments
      .filter((s) => s.status !== "done")
      .map((s) => s.index);

    const framesDoneBySeg = ranges.map((r, i) => {
      const seg = checkpoint!.segments[i];
      return seg?.status === "done" ? r.frameCount : 0;
    });

    const reportQueue = () => {
      const framesDone = framesDoneBySeg.reduce((a, b) => a + b, 0);
      const segsDone = checkpoint!.segments.filter((s) => s.status === "done")
        .length;
      const ratio = 0.05 + (0.85 * framesDone) / totalFrames;
      report(onProgress, {
        phase: "video",
        frame: framesDone,
        totalFrames,
        ratio,
        message: `Encoding frame ${framesDone} / ${totalFrames} (${segsDone}/${ranges.length} segments)`,
      });
    };

    if (pendingIndexes.length === 0) {
      reportQueue();
    } else {
      const session = new ExportWorkerSession();
      sessions.push(session);
      session.setFailureHandler((err) => {
        console.error("Export worker failure", err);
      });
      await session.init({ width: profile.width, height: profile.height });
      if (onPreview) {
        session.setPreviewHandler((dataUrl, frameIndex) => {
          onPreview(dataUrl, frameIndex);
        });
      }

      await loadAssetsIntoSession(session, project, isAborted);

      if (isAborted()) throw new Error("Export cancelled");

      report(onProgress, {
        phase: "video",
        frame: framesDoneBySeg.reduce((a, b) => a + b, 0),
        totalFrames,
        ratio: 0.05,
        message: `Encoding video (${ranges.length} segments)…`,
      });

      const queue = [...pendingIndexes];

      try {
        while (queue.length > 0) {
          if (isAborted()) throw new Error("Export cancelled");
          const index = queue.shift();
          if (index === undefined) break;
          const range = ranges[index]!;
          try {
            const result = await encodeSegmentRange({
              session,
              project,
              profile,
              startFrame: range.startFrame,
              frameCount: range.frameCount,
              folder,
              title: range.title,
              aborted: isAborted,
              emitPreview: Boolean(onPreview),
              onFramesDone: (n) => {
                framesDoneBySeg[index] = n;
                reportQueue();
              },
            });
            framesDoneBySeg[index] = range.frameCount;
            completedSegPaths.push(result.path);
            const framesDone = framesDoneBySeg.reduce((a, b) => a + b, 0);
            await markSegmentDone(checkpoint!, index, result, {
              phase: "video",
              frame: framesDone,
              totalFrames,
              ratio: 0.05 + (0.85 * framesDone) / totalFrames,
              message: `Segment ${index + 1}/${ranges.length} done`,
            });
            reportQueue();
          } catch (err) {
            await markSegmentFailed(checkpoint!, index, {
              phase: "interrupted",
              frame: framesDoneBySeg.reduce((a, b) => a + b, 0),
              totalFrames,
              ratio: 0.05 +
                (0.85 * framesDoneBySeg.reduce((a, b) => a + b, 0)) /
                  totalFrames,
              message: "Export interrupted",
            });
            throw err;
          }
        }
      } catch (err) {
        aborted = true;
        queue.length = 0;
        throw err instanceof Error ? err : new Error(String(err));
      }
    }

    for (const s of sessions) {
      s.dispose();
    }
    sessions.length = 0;

    if (isAborted()) throw new Error("Export cancelled");

    // Ordered segments for concat from checkpoint.
    const ordered: Array<{ path: string; durationSec: number }> = [];
    for (const seg of checkpoint.segments) {
      if (seg.status !== "done" || !seg.path) {
        throw new Error(`Segment ${seg.index} incomplete — resume export`);
      }
      if (!(await pathExists(seg.path))) {
        throw new Error(`Missing segment file for seg ${seg.index} — resume export`);
      }
      ordered.push({
        path: seg.path,
        durationSec: seg.durationSec ?? seg.frameCount / profile.fps,
      });
    }

    // Mix audio only after all video segments are done (Resume skips this until then).
    const audioPayload = await mixAudio(0.88);
    if (isAborted()) throw new Error("Export cancelled");

    report(onProgress, {
      phase: "finalizing",
      frame: totalFrames,
      totalFrames,
      ratio: 0.92,
      message: "Joining segments…",
    });

    const result = await concatSegmentMp4({
      folder,
      title: baseTitle,
      segments: ordered,
      fps: profile.fps,
      audio: audioPayload,
      signal,
    });

    await Promise.all(ordered.map((s) => unlinkQuiet(s.path)));
    await clearCheckpoint(folder, baseTitle);
    checkpoint = null;
    completedSegPaths.length = 0;

    report(onProgress, {
      phase: "done",
      frame: totalFrames,
      totalFrames,
      ratio: 1,
      message: "Export complete",
      finalPath: result.finalPath,
    });

    return result;
  } catch (err) {
    userCancelled =
      (err instanceof Error && err.message === "Export cancelled") ||
      Boolean(signal?.aborted);

    for (const s of sessions) {
      try {
        await s.cancelEncode();
      } catch {
        /* ignore */
      }
    }

    if (userCancelled) {
      // Intentional cancel: drop checkpoint + temps.
      for (const p of completedSegPaths) {
        await unlinkQuiet(p);
      }
      if (checkpoint) {
        for (const seg of checkpoint.segments) {
          if (seg.path && !completedSegPaths.includes(seg.path)) {
            await unlinkQuiet(seg.path);
          }
        }
        await clearCheckpoint(folder, baseTitle);
      }
      report(onProgress, {
        phase: "error",
        frame: 0,
        totalFrames,
        ratio: 0,
        error: "Export cancelled",
        canResume: false,
      });
    } else {
      // Interrupt / failure: keep done segments for resume.
      const framesDone = checkpoint
        ? checkpoint.segments.reduce(
            (sum, s) => sum + (s.status === "done" ? s.frameCount : 0),
            0,
          )
        : 0;
      const canResume = Boolean(
        checkpoint?.segments.some((s) => s.status === "done" && s.path),
      );
      const message = err instanceof Error ? err.message : String(err);
      report(onProgress, {
        phase: "interrupted",
        frame: framesDone,
        totalFrames,
        ratio: totalFrames > 0 ? 0.05 + (0.85 * framesDone) / totalFrames : 0,
        message: canResume
          ? "Export interrupted — you can resume"
          : "Export failed",
        error: message,
        canResume,
      });
    }
    throw err;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    for (const s of sessions) {
      s.dispose();
    }
    await allowSleep();
  }
}
