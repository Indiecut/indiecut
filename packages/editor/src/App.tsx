import { useEffect, useState } from "react";
import { tryRestoreExportUi } from "./export/exportUiSession";
import { ensureTextFontsLoaded } from "./fonts/registry";
import { AboutDialog } from "./layout/AboutDialog";
import { AppShell } from "./layout/AppShell";
import { CropDialog } from "./layout/CropDialog";
import { DeleteProjectDialog } from "./layout/DeleteProjectDialog";
import { ExportModal } from "./layout/ExportModal";
import { NeedProjectDialog } from "./layout/NeedProjectDialog";
import { isCloudAiAvailable } from "./ai/isCloudAiAvailable";
import { loadAiSecrets } from "./ai/secrets/aiSecrets";
import { AiSettingsPanel } from "./layout/AiSettingsPanel";
import { ProjectSettingsModal } from "./layout/ProjectSettingsModal";
import { RecentsDialog } from "./layout/RecentsDialog";
import { ShortcutsPanel } from "./layout/ShortcutsPanel";
import { bootProjectSession } from "./project/session";
import { loadChatUiPrefs, loadShortcutBindings } from "./prefs/appPrefs";
import { useEditorStore } from "./store/editorStore";

export default function App() {
  const [ready, setReady] = useState(false);
  const cloudAi = isCloudAiAvailable();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [, , chatUi] = await Promise.all([
          bootProjectSession(),
          loadShortcutBindings(),
          loadChatUiPrefs(),
          cloudAi
            ? loadAiSecrets()
            : Promise.resolve(),
          ensureTextFontsLoaded().catch(() => undefined),
        ]);
        if (cancelled) return;
        // Web has no Claude bridge — never reopen a persisted chat panel.
        useEditorStore
          .getState()
          .hydrateChatOpen(cloudAi ? chatUi.open : false);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudAi]);

  // After boot (and whenever the tab becomes visible again), reopen Interrupted
  // export UI if a checkpoint/session survived sleep or renderer reload.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const restore = () => {
      const project = useEditorStore.getState().project;
      if (!project.projectPath) return;
      void tryRestoreExportUi(project).catch((err) => {
        console.warn("Export UI restore failed", err);
      });
    };

    // Defer one tick so ExportModal has mounted with store defaults.
    const t = window.setTimeout(() => {
      if (!cancelled) restore();
    }, 0);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) restore();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready]);

  if (!ready) {
    return (
      <div
        style={{
          height: "100%",
          display: "grid",
          placeItems: "center",
          background: "var(--bg-app)",
          color: "var(--text-secondary)",
          fontSize: 13,
        }}
      >
        Loading project…
      </div>
    );
  }

  return (
    <>
      <AppShell />
      <ProjectSettingsModal />
      <NeedProjectDialog />
      <DeleteProjectDialog />
      <AboutDialog />
      <RecentsDialog />
      <ExportModal />
      <CropDialog />
      <ShortcutsPanel />
      {cloudAi ? <AiSettingsPanel /> : null}
    </>
  );
}
