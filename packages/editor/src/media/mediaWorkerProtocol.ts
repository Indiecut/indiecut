import type { MediaKind } from "../project/types";
import type { PeaksDocument } from "./peaks";

export type MediaWorkerRequest = {
  type: "process";
  jobId: string;
  assetId: string;
  fileName: string;
  /** Transferred ArrayBuffer of source file bytes */
  buffer: ArrayBuffer;
  mimeHint?: string;
};

export type MediaWorkerProgress = {
  type: "progress";
  jobId: string;
  assetId: string;
  /** 0 → 1 overall job progress */
  progress: number;
  stage: "probe" | "thumb" | "peaks" | "proxy";
};

export type MediaWorkerResultMeta = {
  kind: MediaKind;
  durationMs: number;
  width?: number;
  height?: number;
  codec?: string;
  hasAudio: boolean;
};

export type MediaWorkerSuccess = {
  type: "success";
  jobId: string;
  assetId: string;
  meta: MediaWorkerResultMeta;
  thumbJpeg?: ArrayBuffer;
  peaks?: PeaksDocument;
  proxyMp4?: ArrayBuffer;
  /**
   * When set (e.g. GIF→MP4), replace the stored source with this MP4 under
   * media/<id>.mp4 so preview/export treat the asset as normal video.
   */
  masterMp4?: ArrayBuffer;
};

export type MediaWorkerFailure = {
  type: "failure";
  jobId: string;
  assetId: string;
  error: string;
};

export type MediaWorkerResponse =
  | MediaWorkerProgress
  | MediaWorkerSuccess
  | MediaWorkerFailure;
