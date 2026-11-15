import { Quality } from "mediabunny";
import type { ExportQualityConfig } from "./exportWorkerProtocol";
import type {
  ExportBitRate,
  ExportFrameRate,
  ExportResolution,
  ExportSettings,
} from "./types";

export type ResolvedExportProfile = {
  width: number;
  height: number;
  fps: ExportFrameRate;
  videoQuality: Quality;
  audioQuality: Quality;
  videoQualityConfig: ExportQualityConfig;
  audioQualityConfig: ExportQualityConfig;
  /** Approximate bits/sec for size estimates */
  videoBitrateApprox: number;
  audioBitrateApprox: number;
};

const RESOLUTION_SIZE: Record<ExportResolution, { width: number; height: number }> =
  {
    "720P": { width: 1280, height: 720 },
    "1080P": { width: 1920, height: 1080 },
    "2K": { width: 2560, height: 1440 },
  };

/** Map bit rate labels → MediaBunny Quality + estimate bitrate. */
export function qualityForBitRate(bitRate: ExportBitRate): {
  video: Quality;
  audio: Quality;
  videoConfig: ExportQualityConfig;
  audioConfig: ExportQualityConfig;
  videoBitrateApprox: number;
  audioBitrateApprox: number;
} {
  switch (bitRate) {
    case "lower":
      return {
        video: new Quality("low"),
        audio: new Quality("medium"),
        videoConfig: { kind: "named", name: "low" },
        audioConfig: { kind: "named", name: "medium" },
        videoBitrateApprox: 2_500_000,
        audioBitrateApprox: 128_000,
      };
    case "higher":
      return {
        video: new Quality({ bitrate: 12_000_000 }),
        audio: new Quality({ bitrate: 192_000 }),
        videoConfig: { kind: "bitrate", bitrate: 12_000_000 },
        audioConfig: { kind: "bitrate", bitrate: 192_000 },
        videoBitrateApprox: 12_000_000,
        audioBitrateApprox: 192_000,
      };
    case "recommended":
    default:
      return {
        video: new Quality("high"),
        audio: new Quality("high"),
        videoConfig: { kind: "named", name: "high" },
        audioConfig: { kind: "named", name: "high" },
        videoBitrateApprox: 8_000_000,
        audioBitrateApprox: 160_000,
      };
  }
}

export function resolveExportProfile(
  settings: Pick<ExportSettings, "resolution" | "bitRate" | "frameRate">,
): ResolvedExportProfile {
  const size = RESOLUTION_SIZE[settings.resolution] ?? RESOLUTION_SIZE["1080P"];
  const q = qualityForBitRate(settings.bitRate);
  return {
    width: size.width,
    height: size.height,
    fps: settings.frameRate,
    videoQuality: q.video,
    audioQuality: q.audio,
    videoQualityConfig: q.videoConfig,
    audioQualityConfig: q.audioConfig,
    videoBitrateApprox: q.videoBitrateApprox,
    audioBitrateApprox: q.audioBitrateApprox,
  };
}

export function defaultExportSettings(
  projectTitle: string,
  projectPath: string,
  projectFps: number,
): ExportSettings {
  // Prefer 24/25/30 for faster defaults; user can still pick 60 in the modal.
  const fps: ExportFrameRate =
    projectFps === 24 || projectFps === 25 || projectFps === 30
      ? projectFps
      : 30;
  const exportTo =
    projectPath.length > 0 ? `${projectPath.replace(/[/\\]$/, "")}/exports` : "";
  return {
    title: projectTitle.trim() || "Untitled",
    exportToPath: exportTo,
    videoEnabled: true,
    resolution: "1080P",
    bitRate: "recommended",
    codec: "h264",
    format: "mp4",
    frameRate: fps,
    colorSpaceLabel: "SDR - Rec.709",
    audioEnabled: true,
  };
}
