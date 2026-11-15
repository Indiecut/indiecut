export interface IndieCutDialogBridge {
  pickProjectFolder: () => Promise<string | null>;
  createProjectFolder: (suggestedName?: string) => Promise<string | null>;
  pickMediaFiles: () => Promise<string[]>;
  pickExportFolder: () => Promise<string | null>;
}

export interface IndieCutExportStreamBridge {
  open: (opts: {
    folder: string;
    title: string;
    overwrite?: boolean;
    /** File extension without dot; defaults to mp4. Use m4a for audio-only. */
    extension?: string;
  }) => Promise<{ streamId: string; tmpPath: string; finalPath: string }>;
  write: (
    streamId: string,
    position: number,
    data: Uint8Array,
  ) => Promise<{ written: number }>;
  close: (
    streamId: string,
    options?: { abort?: boolean },
  ) => Promise<{
    ok: boolean;
    aborted?: boolean;
    finalPath?: string;
    bytesWritten?: number;
    error?: string;
  }>;
}

export interface IndieCutFsBridge {
  ensureProjectLayout: (projectPath: string) => Promise<void>;
  readProjectJson: (projectPath: string) => Promise<string>;
  writeProjectJson: (projectPath: string, jsonText: string) => Promise<void>;
  pathExists: (targetPath: string) => Promise<boolean>;
  copyFile: (sourcePath: string, destPath: string) => Promise<string>;
  readFile: (filePath: string) => Promise<Uint8Array>;
  unlink: (filePath: string) => Promise<{ ok: boolean; missing?: boolean }>;
  writeFile: (
    filePath: string,
    data: Uint8Array | ArrayBuffer | string,
    encoding?: "utf8",
  ) => Promise<string>;
  writeProjectFile: (
    projectPath: string,
    relativePath: string,
    data: Uint8Array | ArrayBuffer | string,
    encoding?: "utf8",
  ) => Promise<string>;
  listProjectDir: (
    projectPath: string,
    relativeDir: string,
  ) => Promise<string[]>;
}

export interface IndieCutShellBridge {
  openPath: (targetPath: string) => Promise<boolean>;
  showItemInFolder: (targetPath: string) => Promise<boolean>;
  /**
   * Browser / PWA: save or download a finished export once.
   * Desktop may omit this (uses openPath / Finder instead).
   */
  downloadPath?: (targetPath: string) => Promise<boolean>;
}

export interface IndieCutPowerBridge {
  blockSleep: () => Promise<{ id: number }>;
  allowSleep: () => Promise<{ ok: boolean }>;
}

/** Platform UI/feature flags so the editor can hide desktop-only actions. */
export interface IndieCutCapabilities {
  /** Reveal file in Finder/Explorer (desktop only). */
  revealInFolder: boolean;
  /** Open file with the OS default app (desktop only). */
  openLocalPath: boolean;
}

export interface IndieCutBridge {
  version: string;
  dialog: IndieCutDialogBridge;
  exportStream: IndieCutExportStreamBridge;
  shell: IndieCutShellBridge;
  fs: IndieCutFsBridge;
  power?: IndieCutPowerBridge;
  capabilities?: IndieCutCapabilities;
  getPathForFile: (file: File) => string;
}
