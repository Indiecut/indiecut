import { useEffect, useMemo, useRef, useState } from "react";
import {
  estimateExportSizeLabel,
  formatDurationShort,
} from "../export/estimateSize";
import { clearCheckpoint } from "../export/exportCheckpoint";
import {
  clearExportUiSession,
  persistExportUiFromStore,
  persistExportUiSession,
} from "../export/exportUiSession";
import { defaultExportSettings } from "../export/profiles";
import { runExport } from "../export/runExport";
import type {
  ExportBitRate,
  ExportFrameRate,
  ExportResolution,
  ExportSettings,
} from "../export/types";
import { timelineDurationMs } from "../engine/time";
import { toUint8Array } from "../media/bytes";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import { useEditorStore } from "../store/editorStore";
import "./ExportModal.css";

function bytesToJpegDataUrl(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** Load first available project thumb as a data URL (file:// is blocked in Electron). */
async function loadExportThumbDataUrl(): Promise<string | null> {
  const { project } = useEditorStore.getState();
  const asset = project.mediaIndex.find((m) => m.thumbPath);
  if (!asset?.thumbPath || !project.projectPath || !window.indiecut?.fs) {
    return null;
  }
  try {
    const abs = resolveMediaAbsolutePath({
      projectPath: project.projectPath,
      storedPath: asset.thumbPath,
    });
    const raw = await window.indiecut.fs.readFile(abs);
    const bytes = toUint8Array(raw);
    if (bytes.byteLength === 0) return null;
    return bytesToJpegDataUrl(bytes);
  } catch (err) {
    console.warn("Export thumb load failed", err);
    return null;
  }
}

async function openPathSafe(targetPath: string): Promise<void> {
  const open = window.indiecut?.shell?.openPath;
  if (!open) {
    throw new Error(
      "Open file is unavailable — fully quit and relaunch IndieCut",
    );
  }
  await open(targetPath);
}

async function showInFolderSafe(targetPath: string): Promise<void> {
  const show = window.indiecut?.shell?.showItemInFolder;
  if (!show) {
    throw new Error(
      "Show in folder is unavailable — fully quit and relaunch IndieCut",
    );
  }
  await show(targetPath);
}

export function ExportModal() {
  const open = useEditorStore((s) => s.exportOpen);
  const setExportOpen = useEditorStore((s) => s.setExportOpen);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const project = useEditorStore((s) => s.project);

  const phase = useEditorStore((s) => s.exportPhase);
  const progress = useEditorStore((s) => s.exportProgress);
  const error = useEditorStore((s) => s.exportError);
  const donePath = useEditorStore((s) => s.exportDonePath);
  const canResume = useEditorStore((s) => s.exportCanResume);
  const storeDraft = useEditorStore((s) => s.exportDraft);
  const setExportPhase = useEditorStore((s) => s.setExportPhase);
  const setExportProgress = useEditorStore((s) => s.setExportProgress);
  const setExportError = useEditorStore((s) => s.setExportError);
  const setExportDonePath = useEditorStore((s) => s.setExportDonePath);
  const setExportCanResume = useEditorStore((s) => s.setExportCanResume);
  const setExportDraft = useEditorStore((s) => s.setExportDraft);
  const resetExportSession = useEditorStore((s) => s.resetExportSession);

  const [draft, setDraft] = useState<ExportSettings>(() =>
    storeDraft ??
    defaultExportSettings(project.title, project.projectPath, project.fps),
  );
  /** Project media thumb (data URL) — settings / fallback. */
  const [staticThumbUrl, setStaticThumbUrl] = useState<string | null>(null);
  /** Live encode preview (data URL) — exporting / interrupted. */
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPersistMs = useRef(0);

  useEffect(() => {
    if (!open) return;
    // Keep progress / resume state across mediaIndex churn and re-open.
    const active =
      phase === "exporting" || phase === "interrupted" || phase === "done";
    if (!active) {
      const next = defaultExportSettings(
        project.title,
        project.projectPath,
        project.fps,
      );
      setDraft(next);
      setExportDraft(next);
      setExportError(null);
      setLivePreviewUrl(null);
    } else if (storeDraft) {
      setDraft(storeDraft);
    }
    let cancelled = false;
    void loadExportThumbDataUrl().then((url) => {
      if (!cancelled) setStaticThumbUrl(url);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally omit mediaIndex — resets used to wipe export progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phase/storeDraft gated
  }, [open, project.title, project.projectPath, project.fps]);

  // Clear live preview when back on settings / done.
  useEffect(() => {
    if (phase === "settings" || phase === "done") {
      setLivePreviewUrl(null);
    }
  }, [phase]);

  const thumbUrl =
    phase === "exporting" || phase === "interrupted"
      ? (livePreviewUrl ?? staticThumbUrl)
      : staticThumbUrl;

  const durationMs = useMemo(
    () => timelineDurationMs(project.tracks),
    [project.tracks],
  );

  const sizeLabel = useMemo(
    () => estimateExportSizeLabel(durationMs, draft),
    [durationMs, draft],
  );

  if (!open) return null;

  const update = <K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K],
  ) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      setExportDraft(next);
      return next;
    });
  };

  const browseExportTo = async () => {
    setExportError(null);
    try {
      const path = await window.indiecut?.dialog.pickExportFolder();
      if (path) update("exportToPath", path);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Could not pick folder",
      );
    }
  };

  const discardCheckpoint = async (settings: ExportSettings) => {
    const folder = settings.exportToPath.trim();
    const title = settings.title.trim() || project.title || "Untitled";
    if (folder) await clearCheckpoint(folder, title);
    clearExportUiSession();
  };

  const closeModal = () => {
    if (phase === "exporting" && abortRef.current) {
      abortRef.current.abort();
      return;
    }
    if (phase === "interrupted") {
      void discardCheckpoint(draft);
      resetExportSession();
    }
    setExportOpen(false);
  };

  const startExport = async (resume: boolean) => {
    setExportPhase("exporting");
    setExportError(null);
    setExportDonePath(null);
    setExportCanResume(false);
    setExportDraft(draft);
    const initialProgress = {
      phase: "preparing" as const,
      frame: 0,
      totalFrames: 0,
      ratio: 0,
      message: resume ? "Resuming export…" : "Preparing export…",
    };
    setExportProgress(initialProgress);
    persistExportUiSession({
      project: useEditorStore.getState().project,
      draft,
      phase: "exporting",
      progress: initialProgress,
      error: null,
      canResume: false,
    });
    setPlaying(false);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const result = await runExport({
        project: useEditorStore.getState().project,
        settings: draft,
        signal: ac.signal,
        resume,
        onPreview: (dataUrl) => {
          if (dataUrl.startsWith("data:image/")) {
            setLivePreviewUrl(dataUrl);
          }
        },
        onProgress: (p) => {
          setExportProgress(p);
          if (typeof p.canResume === "boolean") {
            setExportCanResume(p.canResume);
          }
          const now = Date.now();
          if (now - lastPersistMs.current >= 500) {
            lastPersistMs.current = now;
            persistExportUiFromStore(useEditorStore.getState().project);
          }
        },
      });
      setExportError(null);
      setExportDonePath(result.finalPath);
      setExportCanResume(false);
      setExportPhase("done");
      clearExportUiSession();
    } catch (err) {
      setExportDonePath(null);
      if (ac.signal.aborted) {
        setExportPhase("settings");
        setExportCanResume(false);
        setExportError("Export cancelled");
        setExportProgress(null);
        clearExportUiSession();
      } else {
        const st = useEditorStore.getState();
        const resumable =
          st.exportProgress?.canResume === true || st.exportCanResume;
        const message =
          err instanceof Error ? err.message : "Export failed";
        // Always keep Interrupted UI if we were mid-export — checkpoint may
        // still allow Resume even when canResume was not yet set on the event.
        setExportCanResume(resumable);
        setExportPhase("interrupted");
        setExportError(message);
        persistExportUiSession({
          project: useEditorStore.getState().project,
          draft,
          phase: "interrupted",
          progress: {
            ...(st.exportProgress ?? {
              phase: "interrupted",
              frame: 0,
              totalFrames: 0,
              ratio: 0,
            }),
            phase: "interrupted",
            canResume: resumable,
            error: message,
          },
          error: message,
          canResume: resumable,
        });
      }
    } finally {
      abortRef.current = null;
    }
  };

  const onExport = () => void startExport(false);
  const onResume = () => void startExport(true);

  const openExportedFile = async () => {
    if (!donePath) return;
    try {
      await openPathSafe(donePath);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Could not open file",
      );
    }
  };

  const showExportedInFolder = async () => {
    if (!donePath) return;
    try {
      await showInFolderSafe(donePath);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Could not open folder",
      );
    }
  };

  const progressPct = progress
    ? Math.round(Math.min(1, Math.max(0, progress.ratio)) * 100)
    : 0;

  return (
    <div className="export-modal" role="presentation" onClick={closeModal}>
      <div
        className="export-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-modal__header">
          <h2 id="export-modal-title" className="export-modal__title">
            {phase === "exporting"
              ? "Exporting…"
              : phase === "interrupted"
                ? "Export interrupted"
                : phase === "done"
                  ? "Export complete"
                  : "Export"}
          </h2>
        </div>

        {phase === "settings" ? (
          <>
            <div className="export-modal__body">
              <div className="export-modal__left">
                <div className="export-modal__preview">
                  {thumbUrl ? (
                    <img
                      key={thumbUrl.slice(0, 64)}
                      src={thumbUrl}
                      alt=""
                      className="export-modal__thumb"
                    />
                  ) : (
                    <div className="export-modal__thumb-empty">No preview</div>
                  )}
                </div>
                <div className="export-modal__meta">
                  Duration: {formatDurationShort(durationMs)} | Size:{" "}
                  {sizeLabel} (estimated)
                </div>
              </div>

              <div className="export-modal__right">
                <label className="export-modal__field">
                  <span className="export-modal__label">Title</span>
                  <input
                    className="export-modal__input"
                    value={draft.title}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </label>

                <div className="export-modal__field">
                  <span className="export-modal__label">Export to</span>
                  <div className="export-modal__path-row">
                    <input
                      className="export-modal__input"
                      value={draft.exportToPath}
                      readOnly
                      placeholder="Choose a folder…"
                    />
                    <button
                      type="button"
                      className="export-modal__browse"
                      onClick={() => void browseExportTo()}
                      title="Browse"
                    >
                      …
                    </button>
                  </div>
                </div>

                <label className="export-modal__section-toggle">
                  <input
                    type="checkbox"
                    checked={draft.videoEnabled}
                    onChange={(e) => update("videoEnabled", e.target.checked)}
                  />
                  <span>Video</span>
                </label>

                <div
                  className={
                    draft.videoEnabled
                      ? "export-modal__section"
                      : "export-modal__section export-modal__section--disabled"
                  }
                >
                  <label className="export-modal__field">
                    <span className="export-modal__label">Resolution</span>
                    <select
                      className="export-modal__input"
                      value={draft.resolution}
                      disabled={!draft.videoEnabled}
                      onChange={(e) =>
                        update(
                          "resolution",
                          e.target.value as ExportResolution,
                        )
                      }
                    >
                      <option value="720P">720P</option>
                      <option value="1080P">1080P</option>
                      <option value="2K">2K</option>
                    </select>
                  </label>

                  <label className="export-modal__field">
                    <span className="export-modal__label">Bit rate</span>
                    <select
                      className="export-modal__input"
                      value={draft.bitRate}
                      disabled={!draft.videoEnabled}
                      onChange={(e) =>
                        update("bitRate", e.target.value as ExportBitRate)
                      }
                    >
                      <option value="lower">Lower</option>
                      <option value="recommended">Recommended</option>
                      <option value="higher">Higher</option>
                    </select>
                  </label>

                  <label className="export-modal__field">
                    <span className="export-modal__label">Codec</span>
                    <select
                      className="export-modal__input"
                      value="h264"
                      disabled
                    >
                      <option value="h264">H.264</option>
                    </select>
                  </label>

                  <label className="export-modal__field">
                    <span className="export-modal__label">Format</span>
                    <select
                      className="export-modal__input"
                      value="mp4"
                      disabled
                    >
                      <option value="mp4">mp4</option>
                    </select>
                  </label>

                  <label className="export-modal__field">
                    <span className="export-modal__label">Frame rate</span>
                    <select
                      className="export-modal__input"
                      value={draft.frameRate}
                      disabled={!draft.videoEnabled}
                      onChange={(e) =>
                        update(
                          "frameRate",
                          Number(e.target.value) as ExportFrameRate,
                        )
                      }
                    >
                      <option value={24}>24fps</option>
                      <option value={25}>25fps</option>
                      <option value={30}>30fps</option>
                      <option value={60}>60fps</option>
                    </select>
                  </label>

                  <div className="export-modal__field">
                    <span className="export-modal__label">Color space</span>
                    <span className="export-modal__static">SDR - Rec.709</span>
                  </div>
                </div>

                <label className="export-modal__section-toggle">
                  <input
                    type="checkbox"
                    checked={draft.audioEnabled}
                    onChange={(e) => update("audioEnabled", e.target.checked)}
                  />
                  <span>Export Audio</span>
                </label>

                <div
                  className={
                    draft.audioEnabled
                      ? "export-modal__section"
                      : "export-modal__section export-modal__section--disabled"
                  }
                >
                  <label className="export-modal__field">
                    <span className="export-modal__label">Format</span>
                    <select
                      className="export-modal__input"
                      value={draft.videoEnabled ? "aac" : "m4a"}
                      disabled={!draft.audioEnabled}
                    >
                      {draft.videoEnabled ? (
                        <option value="aac">AAC</option>
                      ) : (
                        <option value="m4a">m4a</option>
                      )}
                    </select>
                  </label>
                </div>

                {error ? (
                  <p className="export-modal__error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="export-modal__footer">
              <button
                type="button"
                className="export-modal__btn export-modal__btn--primary"
                onClick={() => void onExport()}
              >
                Export
              </button>
              <button
                type="button"
                className="export-modal__btn export-modal__btn--ghost"
                onClick={closeModal}
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {phase === "exporting" || phase === "interrupted" ? (
          <>
            <div className="export-modal__progress-view" aria-live="polite">
              {thumbUrl ? (
                <img
                  key={thumbUrl.slice(0, 64)}
                  src={thumbUrl}
                  alt=""
                  className="export-modal__progress-thumb"
                />
              ) : null}
              <div className="export-modal__progress-pct">{progressPct}%</div>
              <div className="export-modal__progress-bar export-modal__progress-bar--lg">
                <div
                  className="export-modal__progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="export-modal__progress-label">
                {phase === "interrupted"
                  ? (progress?.message ?? "Export interrupted")
                  : (progress?.message ?? "Exporting…")}
              </div>
              {phase === "interrupted" && error ? (
                <p className="export-modal__error" role="alert">
                  {error}
                </p>
              ) : null}

              <dl className="export-modal__info">
                <div className="export-modal__info-row">
                  <dt>Title</dt>
                  <dd>{draft.title}</dd>
                </div>
                <div className="export-modal__info-row">
                  <dt>Export to</dt>
                  <dd title={draft.exportToPath}>{draft.exportToPath}</dd>
                </div>
                {draft.videoEnabled ? (
                  <>
                    <div className="export-modal__info-row">
                      <dt>Resolution</dt>
                      <dd>{draft.resolution}</dd>
                    </div>
                    <div className="export-modal__info-row">
                      <dt>Bit rate</dt>
                      <dd>
                        {draft.bitRate === "lower"
                          ? "Lower"
                          : draft.bitRate === "higher"
                            ? "Higher"
                            : "Recommended"}
                      </dd>
                    </div>
                    <div className="export-modal__info-row">
                      <dt>Codec</dt>
                      <dd>H.264</dd>
                    </div>
                    <div className="export-modal__info-row">
                      <dt>Format</dt>
                      <dd>mp4</dd>
                    </div>
                    <div className="export-modal__info-row">
                      <dt>Frame rate</dt>
                      <dd>{draft.frameRate}fps</dd>
                    </div>
                    <div className="export-modal__info-row">
                      <dt>Color space</dt>
                      <dd>SDR - Rec.709</dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="export-modal__info-row">
                      <dt>Video</dt>
                      <dd>Off</dd>
                    </div>
                    {draft.audioEnabled ? (
                      <div className="export-modal__info-row">
                        <dt>Format</dt>
                        <dd>m4a</dd>
                      </div>
                    ) : null}
                  </>
                )}
                <div className="export-modal__info-row">
                  <dt>Audio</dt>
                  <dd>{draft.audioEnabled ? "AAC" : "Off"}</dd>
                </div>
                <div className="export-modal__info-row">
                  <dt>Duration</dt>
                  <dd>{formatDurationShort(durationMs)}</dd>
                </div>
              </dl>
            </div>
            <div className="export-modal__footer">
              {phase === "interrupted" ? (
                <>
                  <button
                    type="button"
                    className="export-modal__btn export-modal__btn--ghost"
                    onClick={() => {
                      void discardCheckpoint(draft).then(() => {
                        resetExportSession();
                        setExportOpen(false);
                      });
                    }}
                  >
                    Discard
                  </button>
                  {canResume ? (
                    <button
                      type="button"
                      className="export-modal__btn export-modal__btn--primary"
                      onClick={onResume}
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="export-modal__btn export-modal__btn--primary"
                      onClick={onExport}
                    >
                      Retry
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className="export-modal__btn export-modal__btn--ghost"
                  onClick={closeModal}
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : null}

        {phase === "done" && donePath ? (
          <>
            <div className="export-modal__done-view">
              <div className="export-modal__success" role="status">
                <p className="export-modal__success-title">Export complete</p>
                <p className="export-modal__success-path" title={donePath}>
                  {donePath}
                </p>
                <div className="export-modal__success-actions">
                  <button
                    type="button"
                    className="export-modal__btn export-modal__btn--success"
                    onClick={() => void openExportedFile()}
                  >
                    Open file
                  </button>
                  <button
                    type="button"
                    className="export-modal__btn export-modal__btn--ghost"
                    onClick={() => void showExportedInFolder()}
                  >
                    Show in folder
                  </button>
                </div>
              </div>
              {error ? (
                <p className="export-modal__error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="export-modal__footer">
              <button
                type="button"
                className="export-modal__btn export-modal__btn--primary"
                onClick={() => setExportOpen(false)}
              >
                Close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
