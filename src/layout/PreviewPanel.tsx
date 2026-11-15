import { useEffect, useRef } from "react";
import {
  IconFullscreen,
  IconPause,
  IconPlay,
  IconSkipBack,
  IconSkipForward,
} from "../icons/Icons";
import { formatTimecode, timelineDurationMs } from "../engine/time";
import { PreviewMaskOverlay } from "../preview/PreviewMaskOverlay";
import { PreviewRemoveBgEyedropper } from "../preview/PreviewRemoveBgEyedropper";
import { PreviewSelectionOverlay } from "../preview/PreviewSelectionOverlay";
import { usePreviewController } from "../preview/usePreviewController";
import { useEditorStore } from "../store/editorStore";
import "./PreviewPanel.css";

function aspectCssValue(aspectRatio: string): string {
  if (aspectRatio === "9:16") return "9 / 16";
  if (aspectRatio === "1:1") return "1 / 1";
  return "16 / 9";
}

export function PreviewPanel() {
  const stageRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);

  const playheadMs = useEditorStore((s) => s.project.playheadMs);
  const fps = useEditorStore((s) => s.project.fps);
  const aspectRatio = useEditorStore((s) => s.project.aspectRatio);
  const tracks = useEditorStore((s) => s.project.tracks);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const recordCountdown = useEditorStore((s) => s.recordCountdown);
  const previewFitMode = useEditorStore((s) => s.previewFitMode);
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs);
  const togglePlaying = useEditorStore((s) => s.togglePlaying);
  const setPreviewFitMode = useEditorStore((s) => s.setPreviewFitMode);
  const cyclePreviewAspect = useEditorStore((s) => s.cyclePreviewAspect);

  const durationMs = timelineDurationMs(tracks);
  const frameMs = 1000 / Math.max(1, fps);

  usePreviewController(stageRef);

  const skipBy = (frames: number) => {
    setPlayheadMs(playheadMs + frames * frameMs);
  };

  const toggleFullscreen = async () => {
    const el = stageWrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen failed", err);
    }
  };

  useEffect(() => {
    const onToggle = () => {
      void toggleFullscreen();
    };
    window.addEventListener("indiecut:toggle-fullscreen", onToggle);
    return () =>
      window.removeEventListener("indiecut:toggle-fullscreen", onToggle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once; reads stageWrapRef
  }, []);

  return (
    <div className="preview-panel">
      <div className="preview-panel__stage-wrap" ref={stageWrapRef}>
        <div
          className="preview-panel__stage"
          ref={stageRef}
          style={{ aspectRatio: aspectCssValue(aspectRatio) }}
          aria-label="Preview stage"
          onDoubleClick={() => void toggleFullscreen()}
        >
          <PreviewSelectionOverlay stageRef={stageRef} />
          <PreviewMaskOverlay stageRef={stageRef} />
          <PreviewRemoveBgEyedropper stageRef={stageRef} />
          {recordCountdown != null ? (
            <div className="preview-panel__countdown" aria-live="polite">
              {recordCountdown}
            </div>
          ) : null}
        </div>
      </div>

      <div className="preview-panel__transport">
        <div className="preview-panel__transport-left">
          <button
            type="button"
            className="preview-panel__btn"
            aria-label="Previous frame"
            onClick={() => skipBy(-1)}
          >
            <IconSkipBack />
          </button>
          <button
            type="button"
            className="preview-panel__btn preview-panel__btn--play"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={() => togglePlaying()}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button
            type="button"
            className="preview-panel__btn"
            aria-label="Next frame"
            onClick={() => skipBy(1)}
          >
            <IconSkipForward />
          </button>
        </div>

        <div className="preview-panel__timecode">
          <span>{formatTimecode(playheadMs, fps)}</span>
          <span className="preview-panel__timecode-sep">/</span>
          <span className="preview-panel__timecode-total">
            {formatTimecode(durationMs, fps)}
          </span>
        </div>

        <div className="preview-panel__transport-right">
          <button
            type="button"
            className={
              previewFitMode === "fit"
                ? "preview-panel__chip preview-panel__chip--active"
                : "preview-panel__chip"
            }
            onClick={() =>
              setPreviewFitMode(previewFitMode === "fit" ? "full" : "fit")
            }
          >
            {previewFitMode === "fit" ? "Fit" : "Full"}
          </button>
          <button
            type="button"
            className="preview-panel__chip"
            onClick={() => cyclePreviewAspect()}
            title="Cycle aspect ratio"
          >
            {aspectRatio}
          </button>
          <button
            type="button"
            className="preview-panel__btn"
            aria-label="Fullscreen"
            onClick={() => void toggleFullscreen()}
          >
            <IconFullscreen />
          </button>
        </div>
      </div>
    </div>
  );
}
