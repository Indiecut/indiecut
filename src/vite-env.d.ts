/// <reference types="vite/client" />

import type { StoreApi } from "zustand";
import type { EditorState } from "./store/editorStore";
import type { ProjectDocument } from "./project/types";

interface IndieCutDialogBridge {
  pickProjectFolder: () => Promise<string | null>;
  createProjectFolder: (suggestedName?: string) => Promise<string | null>;
  pickMediaFiles: () => Promise<string[]>;
  pickExportFolder: () => Promise<string | null>;
}

interface IndieCutExportStreamBridge {
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

interface IndieCutFsBridge {
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

interface IndieCutShellBridge {
  openPath: (targetPath: string) => Promise<boolean>;
  showItemInFolder: (targetPath: string) => Promise<boolean>;
}

interface IndieCutPowerBridge {
  blockSleep: () => Promise<{ id: number }>;
  allowSleep: () => Promise<{ ok: boolean }>;
}

interface IndieCutBridge {
  version: string;
  dialog: IndieCutDialogBridge;
  exportStream: IndieCutExportStreamBridge;
  shell: IndieCutShellBridge;
  fs: IndieCutFsBridge;
  power?: IndieCutPowerBridge;
  getPathForFile: (file: File) => string;
}

interface IndieCutDevBridge {
  getState: StoreApi<EditorState>["getState"];
  setState: StoreApi<EditorState>["setState"];
  setPlayheadMs: (ms: number) => void;
  patchProject: (partial: Partial<ProjectDocument>) => void;
  saveNow?: () => Promise<void>;
  openPath?: (path: string) => Promise<void>;
}

declare global {
  interface Window {
    indiecut?: IndieCutBridge;
    __indiecut?: IndieCutDevBridge;
  }
}

export {};
