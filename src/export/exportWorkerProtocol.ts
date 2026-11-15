import type { PreviewSeekLayer } from "../preview/previewWorkerProtocol";

export type { PreviewSeekLayer };

/** Serializable Quality config (MediaBunny Quality rebuilt in worker). */
export type ExportQualityConfig =
  | { kind: "named"; name: "low" | "medium" | "high" | "very-high" | "very-low" }
  | { kind: "bitrate"; bitrate: number };

export type ExportWorkerInit = {
  type: "init";
  canvas: OffscreenCanvas;
  width: number;
  height: number;
};

export type ExportWorkerLoad = {
  type: "load";
  assetId: string;
  kind: "video" | "image";
  buffer: ArrayBuffer;
  mimeHint?: string;
};

export type ExportWorkerLoadLut = {
  type: "loadLut";
  lutId: string;
  text: string;
};

export type ExportWorkerBegin = {
  type: "beginEncode";
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  layoutWidth: number;
  layoutHeight: number;
  videoQuality: ExportQualityConfig;
  /** When set, add AAC track from transferred PCM. */
  audio?: {
    sampleRate: number;
    numberOfChannels: number;
    /** Interleaved Float32 PCM for the full timeline */
    pcm: Float32Array;
    audioQuality: ExportQualityConfig;
  } | null;
  /** Emit occasional JPEG previews of the composed stage for the export UI. */
  emitPreview?: boolean;
};

export type ExportWorkerFrame = {
  type: "encodeFrame";
  frameIndex: number;
  layers: PreviewSeekLayer[];
};

export type ExportWorkerFinish = {
  type: "finishEncode";
};

export type ExportWorkerCancel = {
  type: "cancelEncode";
};

export type ExportWorkerStreamWriteAck = {
  type: "streamWriteAck";
  writeId: number;
  ok: boolean;
  error?: string;
};

export type ExportWorkerRequest =
  | ExportWorkerInit
  | ExportWorkerLoad
  | ExportWorkerLoadLut
  | ExportWorkerBegin
  | ExportWorkerFrame
  | ExportWorkerFinish
  | ExportWorkerCancel
  | ExportWorkerStreamWriteAck;

export type ExportWorkerReady = { type: "ready" };
export type ExportWorkerLoaded = { type: "loaded"; assetId: string };
export type ExportWorkerFrameDone = {
  type: "frameDone";
  frameIndex: number;
};
export type ExportWorkerPreviewFrame = {
  type: "previewFrame";
  frameIndex: number;
  /** `data:image/jpeg;base64,...` — reliable for <img> in Electron. */
  dataUrl: string;
};
export type ExportWorkerEncodeDone = { type: "encodeDone" };
export type ExportWorkerFailure = {
  type: "failure";
  error: string;
  assetId?: string;
  frameIndex?: number;
};
export type ExportWorkerStreamWrite = {
  type: "streamWrite";
  writeId: number;
  position: number;
  data: Uint8Array;
};

export type ExportWorkerResponse =
  | ExportWorkerReady
  | ExportWorkerLoaded
  | ExportWorkerFrameDone
  | ExportWorkerPreviewFrame
  | ExportWorkerEncodeDone
  | ExportWorkerFailure
  | ExportWorkerStreamWrite;
