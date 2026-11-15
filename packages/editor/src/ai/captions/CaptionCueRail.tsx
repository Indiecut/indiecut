import { useEffect, useRef, useState } from "react";
import type { CaptionCue } from "../../project/types";
import {
  captionContentMs,
  captionDisplayMs,
  normalizeCaptionSpeed,
} from "./captionTiming";
import "./CaptionCueRail.css";

type Props = {
  cues: CaptionCue[];
  /** Absolute timeline playhead (ms). */
  playheadMs: number;
  /** Absolute timeline start of the caption clip (ms). */
  clipStartMs: number;
  /** Caption timing speed (1 = original). */
  speed?: number;
  disabled?: boolean;
  /** Inspector selection highlight — follows the playhead cue. */
  isCueSelected?: (cueIndex: number) => boolean;
  onUpdateWord: (cueIndex: number, wordIndex: number, nextText: string) => void;
  onSeekCue: (cueIndex: number) => void;
};

function splitCaptionWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function formatCueTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalMs = Math.round(ms);
  const frac = String(totalMs % 1000).padStart(3, "0");
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${frac}`;
  }
  return `${m}:${String(s).padStart(2, "0")}.${frac}`;
}

function activeCueIndex(
  cues: CaptionCue[],
  playheadMs: number,
  clipStartMs: number,
  speed: number,
): number {
  const contentMs = captionContentMs(playheadMs - clipStartMs, speed);
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    if (contentMs >= cue.startMs && contentMs < cue.endMs) return i;
  }
  return -1;
}

export function CaptionCueRail({
  cues,
  playheadMs,
  clipStartMs,
  speed: speedProp,
  disabled = false,
  isCueSelected,
  onUpdateWord,
  onSeekCue,
}: Props) {
  const speed = normalizeCaptionSpeed(speedProp);
  const activeIndex = activeCueIndex(cues, playheadMs, clipStartMs, speed);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<{
    cue: number;
    word: number;
    value: string;
  } | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  useEffect(() => {
    if (activeIndex < 0) return;
    activeRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeIndex]);

  useEffect(() => {
    if (!editing) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editing]);

  const commitEdit = () => {
    const cur = editingRef.current;
    if (!cur) return;
    const words = splitCaptionWords(cues[cur.cue]?.text ?? "");
    const prev = words[cur.word] ?? "";
    const next = cur.value.trim();
    setEditing(null);
    if (next === prev || next.length === 0) return;
    onUpdateWord(cur.cue, cur.word, next);
  };

  const cancelEdit = () => setEditing(null);

  return (
    <div className="caption-cue-rail">
      <div className="caption-cue-rail__header">
        <h3 className="caption-cue-rail__title">Subtitles</h3>
        <span className="caption-cue-rail__count">{cues.length}</span>
      </div>

      {cues.length === 0 ? (
        <div className="caption-cue-rail__empty">
          <p>
            Cue text appears here as one continuous document. Double-click any
            word to edit it.
          </p>
        </div>
      ) : (
        <div className="caption-cue-rail__doc">
          <div className="caption-cue-rail__flow">
            {cues.map((cue, cueIndex) => {
              const active = cueIndex === activeIndex;
              const selected = isCueSelected?.(cueIndex) === true;
              const words = splitCaptionWords(cue.text);
              const absStart =
                clipStartMs + captionDisplayMs(cue.startMs, speed);
              const absEnd =
                clipStartMs + captionDisplayMs(cue.endMs, speed);
              const cueClass = [
                "caption-cue-rail__cue",
                selected ? "caption-cue-rail__cue--selected" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const timeClass = [
                "caption-cue-rail__time",
                active ? "caption-cue-rail__time--active" : "",
                selected ? "caption-cue-rail__time--selected" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <span key={cue.id} className={cueClass}>
                  <button
                    type="button"
                    ref={
                      active && words.length === 0 ? activeRef : undefined
                    }
                    title={`Cue ${cueIndex + 1}: ${formatCueTime(absStart)} → ${formatCueTime(absEnd)}`}
                    className={timeClass}
                    disabled={disabled}
                    onClick={() => onSeekCue(cueIndex)}
                  >
                    {formatCueTime(absStart)}
                  </button>
                  {words.map((word, wordIndex) => {
                    const isEditing =
                      editing?.cue === cueIndex && editing.word === wordIndex;
                    const isFirstActive = active && wordIndex === 0;
                    const wordClass = [
                      "caption-cue-rail__word",
                      active ? "caption-cue-rail__word--active" : "",
                      selected ? "caption-cue-rail__word--selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    if (isEditing) {
                      return (
                        <span
                          key={`${cue.id}-w${wordIndex}`}
                          className="caption-cue-rail__word-wrap"
                        >
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editing.value}
                            disabled={disabled}
                            aria-label={`Edit word in cue ${cueIndex + 1}`}
                            className="caption-cue-rail__edit"
                            style={{
                              width: `${Math.max(editing.value.length, 2) + 1}ch`,
                            }}
                            onChange={(e) => {
                              const value = e.target.value;
                              setEditing((prev) =>
                                prev ? { ...prev, value } : prev,
                              );
                            }}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitEdit();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                          {wordIndex < words.length - 1 ? " " : null}
                        </span>
                      );
                    }

                    return (
                      <span
                        key={`${cue.id}-w${wordIndex}`}
                        className="caption-cue-rail__word-wrap"
                      >
                        <button
                          type="button"
                          ref={isFirstActive ? activeRef : undefined}
                          disabled={disabled}
                          title={`Click to seek · Double-click to edit · Cue ${cueIndex + 1}`}
                          className={wordClass}
                          onClick={() => onSeekCue(cueIndex)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (disabled) return;
                            setEditing({
                              cue: cueIndex,
                              word: wordIndex,
                              value: word,
                            });
                          }}
                        >
                          {word}
                        </button>
                        {wordIndex < words.length - 1 ? " " : null}
                      </span>
                    );
                  })}
                  {cueIndex < cues.length - 1 ? " " : null}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
