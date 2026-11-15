import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import type { ProjectDocument } from "./project/types";
import { openProjectAt, saveProjectNow } from "./project/session";
import { useEditorStore } from "./store/editorStore";
import "./styles/global.css";

export type MountEditorOptions = {
  enableDevBridge?: boolean;
};

export function mountEditor(
  el: HTMLElement,
  options: MountEditorOptions = {},
): Root {
  const enableDev =
    options.enableDevBridge ?? Boolean(import.meta.env.DEV);

  if (enableDev) {
    window.__indiecut = {
      getState: useEditorStore.getState,
      setState: useEditorStore.setState,
      setPlayheadMs: (ms: number) =>
        useEditorStore.getState().setPlayheadMs(ms),
      patchProject: (partial: Partial<ProjectDocument>) =>
        useEditorStore.getState().patchProject(partial),
      saveNow: () => saveProjectNow(),
      openPath: (path: string) => openProjectAt(path),
    };
  }

  const root = createRoot(el);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  return root;
}
