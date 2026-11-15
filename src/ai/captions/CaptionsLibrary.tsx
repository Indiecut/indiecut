import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { CaptionCue, Clip, Track } from "../../project/types";
import { CaptionCueRail } from "./CaptionCueRail";
import { captionDisplayMs, normalizeCaptionSpeed } from "./captionTiming";
import { hasAudibleTimelineSpeech } from "./hasAudibleTimelineSpeech";
import { importTimedTextFromFile } from "./importTimedTextJob";
import { runAutoCaptionJob } from "./runAutoCaptionJob";
import { speechCaptureEngine } from "./SpeechCaptureEngine";
import {
  DEFAULT_SPEECH_LANGUAGE,
  SPEECH_LANGUAGES,
} from "./speechLanguages";
import type { SpeechLanguage } from "./types";
import "./CaptionsLibrary.css";

type JobState =
  | { status: "idle"; error: string | null; warnings: string[]; success: string | null }
  | {
      status: "running";
      step: string;
      /** 0–100 when known (model download); null for indeterminate steps */
      progress: number | null;
      phase: "loading-model" | "working";
    };

const IDLE: JobState = {
  status: "idle",
  error: null,
  warnings: [],
  success: null,
};

type CaptionClipRef = {
  clip: Clip;
  trackId: string;
};

/** One row in the left-panel document, mapped back to its owning clip cue. */
type MergedCaptionCue = {
  /** Absolute timeline times for display / seek / playhead highlight. */
  cue: CaptionCue;
  /** Original cue id on the owning clip (selection key). */
  sourceCueId: string;
  clipId: string;
  trackId: string;
  cueIndex: number;
};

function listCaptionClips(tracks: Track[]): CaptionClipRef[] {
  const out: CaptionClipRef[] = [];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.kind === "caption" && clip.caption) {
        out.push({ clip, trackId: track.id });
      }
    }
  }
  out.sort(
    (a, b) =>
      a.clip.startMs - b.clip.startMs || a.clip.id.localeCompare(b.clip.id),
  );
  return out;
}

/** Full subtitle document across all caption clips (splits stay whole here). */
function mergeCaptionDocument(refs: CaptionClipRef[]): MergedCaptionCue[] {
  const merged: MergedCaptionCue[] = [];
  for (const { clip, trackId } of refs) {
    const caption = clip.caption;
    if (!caption) continue;
    const speed = caption.speed;
    caption.cues.forEach((cue, cueIndex) => {
      merged.push({
        cue: {
          ...cue,
          id: `${clip.id}:${cue.id}`,
          startMs: clip.startMs + captionDisplayMs(cue.startMs, speed),
          endMs: clip.startMs + captionDisplayMs(cue.endMs, speed),
        },
        sourceCueId: cue.id,
        clipId: clip.id,
        trackId,
        cueIndex,
      });
    });
  }
  merged.sort((a, b) => a.cue.startMs - b.cue.startMs);
  return merged;
}

function applyWordEdit(
  cues: CaptionCue[],
  cueIndex: number,
  wordIndex: number,
  nextText: string,
): CaptionCue[] {
  const cue = cues[cueIndex];
  if (!cue) return cues;
  const words = cue.text.split(/\s+/).filter(Boolean);
  if (wordIndex < 0 || wordIndex >= words.length) return cues;
  words[wordIndex] = nextText;
  const next = [...cues];
  next[cueIndex] = { ...cue, text: words.join(" ") };
  return next;
}

export function CaptionsLibrary() {
  const project = useEditorStore((s) => s.project);
  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectedCaptionCueIds = useEditorStore((s) => s.selectedCaptionCueIds);
  const selectCaptionCue = useEditorStore((s) => s.selectCaptionCue);
  const patchClipLive = useEditorStore((s) => s.patchClipLive);
  const commitTracksTransition = useEditorStore(
    (s) => s.commitTracksTransition,
  );

  const captionClips = useMemo(
    () => listCaptionClips(project.tracks),
    [project.tracks],
  );

  const mergedDocument = useMemo(
    () => mergeCaptionDocument(captionClips),
    [captionClips],
  );

  const hasAudio = useMemo(
    () => hasAudibleTimelineSpeech(project),
    [project],
  );

  const [language, setLanguage] = useState<SpeechLanguage>(
    DEFAULT_SPEECH_LANGUAGE,
  );
  const [job, setJob] = useState<JobState>(IDLE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isRunning = job.status === "running";
  const hasCaption = captionClips.length > 0;

  const handleGenerate = async () => {
    if (isRunning) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setJob({
      status: "running",
      step: "Starting…",
      progress: null,
      phase: "working",
    });

    try {
      const result = await runAutoCaptionJob({
        language,
        signal: controller.signal,
        onProgress: (progress) => {
          const loading = progress.status === "loading-model";
          setJob({
            status: "running",
            step:
              progress.message ??
              (loading
                ? `Downloading model ${Math.round(progress.progress)}%`
                : "Working…"),
            progress: loading ? Math.round(progress.progress) : null,
            phase: loading ? "loading-model" : "working",
          });
        },
      });
      setJob({
        status: "idle",
        error: null,
        warnings: [],
        success: `Added ${result.cueCount} caption cue(s) as one timeline item.`,
      });
    } catch (error) {
      setJob({
        status: "idle",
        error:
          error instanceof Error
            ? error.message
            : "Caption generation failed",
        warnings: [],
        success: null,
      });
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    speechCaptureEngine.cancel();
    setJob({
      status: "idle",
      error: "Caption generation cancelled",
      warnings: [],
      success: null,
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isRunning) return;

    setJob({
      status: "running",
      step: "Reading subtitle file…",
      progress: null,
      phase: "working",
    });
    try {
      const result = await importTimedTextFromFile(file);
      const warnings = [...result.parse.warnings];
      if (result.parse.skippedCount > 0) {
        warnings.unshift(
          `Imported ${result.cueCount} cue(s); skipped ${result.parse.skippedCount} malformed cue(s).`,
        );
      }
      setJob({
        status: "idle",
        error: null,
        warnings,
        success: `Imported ${result.cueCount} caption cue(s).`,
      });
    } catch (error) {
      setJob({
        status: "idle",
        error:
          error instanceof Error
            ? error.message
            : "Subtitle import failed",
        warnings: [],
        success: null,
      });
    }
  };

  const handleUpdateWord = (
    mergedIndex: number,
    wordIndex: number,
    nextText: string,
  ) => {
    const row = mergedDocument[mergedIndex];
    if (!row) return;
    const source = captionClips.find((c) => c.clip.id === row.clipId);
    const caption = source?.clip.caption;
    if (!caption) return;

    const before = structuredClone(
      useEditorStore.getState().project.tracks,
    );
    const cues = applyWordEdit(caption.cues, row.cueIndex, wordIndex, nextText);
    patchClipLive(row.clipId, {
      caption: { ...caption, cues },
    });
    const after = useEditorStore.getState().project.tracks;
    commitTracksTransition(before, after, "Edit caption");
  };

  const handleSeekCue = (mergedIndex: number) => {
    const row = mergedDocument[mergedIndex];
    if (!row) return;
    const source = captionClips.find((c) => c.clip.id === row.clipId);
    const speed = normalizeCaptionSpeed(source?.clip.caption?.speed);
    const midContent = (row.cue.startMs + row.cue.endMs) / 2;
    const midDisplay = captionDisplayMs(midContent, speed);
    setPlayheadMs((source?.clip.startMs ?? 0) + midDisplay);
    selectCaptionCue(row.clipId, row.sourceCueId, row.trackId, "replace");
  };

  return (
    <div
      className={
        hasCaption
          ? "captions-library captions-library--filled"
          : "captions-library"
      }
    >
      {hasCaption ? (
        <div className="captions-library__toolbar">
          <label className="captions-library__field captions-library__field--inline">
            <span className="captions-library__label">Language</span>
            <select
              className="captions-library__select"
              value={language}
              disabled={isRunning}
              onChange={(e) =>
                setLanguage(e.target.value as SpeechLanguage)
              }
            >
              {SPEECH_LANGUAGES.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div className="captions-library__toolbar-actions">
            <button
              type="button"
              className="captions-library__btn captions-library__btn--primary"
              disabled={isRunning || !hasAudio}
              onClick={() => void handleGenerate()}
            >
              Regenerate
            </button>
            <button
              type="button"
              className="captions-library__btn"
              disabled={isRunning}
              onClick={handleImportClick}
            >
              Re-import SRT / ASS
            </button>
            {isRunning ? (
              <button
                type="button"
                className="captions-library__btn captions-library__btn--ghost"
                onClick={handleCancel}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <p className="captions-library__intro">
            Generate captions from the timeline mix, or import an SRT/ASS file.
            Captions are added as one editable timeline item.
          </p>

          <div className="captions-library__fields">
            <label className="captions-library__field">
              <span className="captions-library__label">Language</span>
              <select
                className="captions-library__select"
                value={language}
                disabled={isRunning}
                onChange={(e) =>
                  setLanguage(e.target.value as SpeechLanguage)
                }
              >
                {SPEECH_LANGUAGES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!hasAudio ? (
            <p className="captions-library__status captions-library__status--warn">
              No audio detected. Add a clip with audio to the timeline before
              generating captions.
            </p>
          ) : null}

          <div className="captions-library__actions">
            <button
              type="button"
              className="captions-library__btn captions-library__btn--primary"
              disabled={isRunning || !hasAudio}
              onClick={() => void handleGenerate()}
            >
              Generate captions
            </button>
            <button
              type="button"
              className="captions-library__btn"
              disabled={isRunning}
              onClick={handleImportClick}
            >
              Import SRT / ASS
            </button>
            {isRunning ? (
              <button
                type="button"
                className="captions-library__btn captions-library__btn--ghost"
                onClick={handleCancel}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.ass,.ssa,text/plain"
        hidden
        onChange={(e) => void handleImportFile(e)}
      />

      {job.status === "running" ? (
        <div className="captions-library__progress">
          <p className="captions-library__status">{job.step}</p>
          <div
            className={
              job.progress == null
                ? "captions-library__bar captions-library__bar--indeterminate"
                : "captions-library__bar"
            }
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress ?? undefined}
            aria-label={job.step}
          >
            <div
              className="captions-library__bar-fill"
              style={
                job.progress == null
                  ? undefined
                  : { width: `${Math.max(0, Math.min(100, job.progress))}%` }
              }
            />
          </div>
          {job.phase === "loading-model" && job.progress != null ? (
            <p className="captions-library__progress-meta">
              {job.progress}%
            </p>
          ) : null}
        </div>
      ) : null}

      {job.status === "idle" && job.error ? (
        <p className="captions-library__status captions-library__status--error">
          {job.error}
        </p>
      ) : null}

      {job.status === "idle" && job.success ? (
        <p className="captions-library__status">{job.success}</p>
      ) : null}

      {job.status === "idle" && job.warnings.length > 0 ? (
        <ul className="captions-library__status-list">
          {job.warnings.map((warning) => (
            <li
              key={warning}
              className="captions-library__status captions-library__status--warn"
            >
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {mergedDocument.length > 0 ? (
        <CaptionCueRail
          cues={mergedDocument.map((row) => row.cue)}
          playheadMs={playheadMs}
          clipStartMs={0}
          speed={1}
          disabled={isRunning}
          isCueSelected={(mergedIndex) => {
            const row = mergedDocument[mergedIndex];
            if (!row) return false;
            return (
              row.clipId === selectedClipId &&
              selectedCaptionCueIds.includes(row.sourceCueId)
            );
          }}
          onUpdateWord={handleUpdateWord}
          onSeekCue={handleSeekCue}
        />
      ) : null}
    </div>
  );
}
