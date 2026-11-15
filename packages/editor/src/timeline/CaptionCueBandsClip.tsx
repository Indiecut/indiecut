import { useMemo } from "react";
import { isCaptionCueStyled } from "../ai/captions/captionMotionPresets";
import {
  captionDisplayMs,
  normalizeCaptionSpeed,
} from "../ai/captions/captionTiming";
import { resolveCaptionCueHidden } from "../ai/captions/resolveCaptionText";
import type { CaptionCue, Clip } from "../project/types";
import { useEditorStore } from "../store/editorStore";

type Props = {
  clip: Clip;
  trackId: string;
  pxPerSec: number;
  /** Clip-local ms range currently on screen (for culling). */
  visibleStartMs: number;
  visibleEndMs: number;
};

const MIN_BAND_PX = 2;
/** Hide cue text when the band is too narrow to read. */
const MIN_TEXT_PX = 28;

function cueLabel(cue: CaptionCue): string {
  return cue.text.trim().replace(/\s+/g, " ");
}

/**
 * Timeline interior for caption clips: each cue as a timed text band
 * instead of a single flat label.
 */
export function CaptionCueBandsClip({
  clip,
  trackId,
  pxPerSec,
  visibleStartMs,
  visibleEndMs,
}: Props) {
  const cues = clip.caption?.cues ?? [];
  const speed = normalizeCaptionSpeed(clip.caption?.speed);
  const selectedCaptionCueIds = useEditorStore((s) => s.selectedCaptionCueIds);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectCaptionCue = useEditorStore((s) => s.selectCaptionCue);
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs);
  const pad = 400; // ms slack so bands entering the viewport aren't clipped early

  const visibleCues = useMemo(() => {
    if (cues.length === 0) return [];
    const lo = visibleStartMs - pad;
    const hi = visibleEndMs + pad;
    return cues.filter((cue) => {
      const start = captionDisplayMs(cue.startMs, speed);
      const end = captionDisplayMs(cue.endMs, speed);
      return end > lo && start < hi;
    });
  }, [cues, visibleStartMs, visibleEndMs, speed]);

  if (cues.length === 0) {
    return (
      <span className="timeline-panel__clip-label" title="Captions">
        Captions
      </span>
    );
  }

  return (
    <div className="timeline-panel__caption-bands">
      {visibleCues.map((cue) => {
        const start = Math.max(0, captionDisplayMs(cue.startMs, speed));
        const end = Math.max(start, captionDisplayMs(cue.endMs, speed));
        const left = (start / 1000) * pxPerSec;
        const width = Math.max(
          MIN_BAND_PX,
          ((end - start) / 1000) * pxPerSec,
        );
        const text = cueLabel(cue);
        const showText = width >= MIN_TEXT_PX && text.length > 0;
        const styled = isCaptionCueStyled(cue);
        const hidden = clip.caption
          ? resolveCaptionCueHidden(clip.caption, cue)
          : false;
        const selected =
          selectedClipId === clip.id &&
          selectedCaptionCueIds.includes(cue.id);

        return (
          <button
            key={cue.id}
            type="button"
            className={[
              "timeline-panel__caption-band",
              showText ? "" : "timeline-panel__caption-band--slim",
              styled ? "timeline-panel__caption-band--styled" : "",
              hidden ? "timeline-panel__caption-band--hidden" : "",
              selected ? "timeline-panel__caption-band--selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ left, width }}
            title={
              [
                text || (styled ? "Styled cue" : "Cue"),
                styled ? "Styled" : null,
                hidden ? "Hidden" : null,
              ]
                .filter(Boolean)
                .join(" · ")
            }
            onPointerDown={(e) => {
              e.stopPropagation();
              const midContent = (cue.startMs + cue.endMs) / 2;
              setPlayheadMs(
                clip.startMs + captionDisplayMs(midContent, speed),
              );
              selectCaptionCue(clip.id, cue.id, trackId, "replace");
            }}
          >
            {styled ? (
              <span
                className="timeline-panel__caption-band-style-mark"
                aria-hidden
              />
            ) : null}
            {showText ? text : null}
          </button>
        );
      })}
    </div>
  );
}
