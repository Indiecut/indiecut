export type ExportResolution = "720P" | "1080P" | "2K" | "4K";
export type ExportBitRate = "lower" | "recommended" | "higher";
export type ExportFrameRate = 24 | 25 | 30 | 60;

export type ExportSettings = {
  title: string;
  exportToPath: string;
  videoEnabled: boolean;
  resolution: ExportResolution;
  bitRate: ExportBitRate;
  codec: "h264";
  format: "mp4";
  frameRate: ExportFrameRate;
  colorSpaceLabel: "SDR - Rec.709";
  audioEnabled: boolean;
};

export type ExportProgress = {
  phase:
    | "preparing"
    | "video"
    | "audio"
    | "finalizing"
    | "done"
    | "error"
    | "interrupted";
  frame: number;
  totalFrames: number;
  /** 0..1 */
  ratio: number;
  message?: string;
  error?: string;
  finalPath?: string;
  /** True when a disk checkpoint can resume unfinished segments. */
  canResume?: boolean;
};
