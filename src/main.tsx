import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { openProjectAt, saveProjectNow } from "./project/session";
import { useEditorStore } from "./store/editorStore";
import "./styles/global.css";

if (import.meta.env.DEV) {
  window.__indiecut = {
    getState: useEditorStore.getState,
    setState: useEditorStore.setState,
    setPlayheadMs: (ms) => useEditorStore.getState().setPlayheadMs(ms),
    patchProject: (partial) =>
      useEditorStore.getState().patchProject(partial),
    saveNow: () => saveProjectNow(),
    openPath: (path) => openProjectAt(path),
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
