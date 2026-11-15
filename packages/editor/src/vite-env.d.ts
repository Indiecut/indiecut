/// <reference types="vite/client" />

import type { StoreApi } from "zustand";
import type { EditorState } from "./store/editorStore";
import type { ProjectDocument } from "./project/types";

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
    __indiecut?: IndieCutDevBridge;
  }
}

declare module "*.woff2?url" {
  const src: string;
  export default src;
}

declare module "*.wav?url" {
  const src: string;
  export default src;
}

export {};
