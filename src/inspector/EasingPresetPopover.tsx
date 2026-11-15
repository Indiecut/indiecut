import { useEffect, useRef } from "react";
import type { AnimatablePath } from "../engine/animatable";
import type { EasingPresetId } from "../project/types";
import { EASING_PRESET_DEFS } from "./easingPresets";
import { SegmentCurveMiniEditor } from "./SegmentCurveMiniEditor";
import "./EasingPresetPopover.css";

type Props = {
  /** Screen-space anchor for the floating popover. */
  anchor: { x: number; y: number };
  activePresetId?: Exclude<EasingPresetId, "custom">;
  onSelect: (preset: Exclude<EasingPresetId, "custom">) => void;
  onClose: () => void;
  /** When set, shows a bidirectional custom mini-curve editor. */
  segmentEdit?: {
    clipId: string;
    path: AnimatablePath;
    leftKeyId: string;
  };
};

/**
 * Graphs preset grid. Writes handles onto the left key of a segment.
 */
export function EasingPresetPopover({
  anchor,
  activePresetId,
  onSelect,
  onClose,
  segmentEdit,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const left = Math.min(anchor.x, window.innerWidth - 280);
  const top = Math.min(
    anchor.y,
    window.innerHeight - (segmentEdit ? 380 : 220),
  );

  return (
    <div
      ref={rootRef}
      className="easing-preset-popover"
      style={{ left, top }}
      role="listbox"
      aria-label="Graphs easing presets"
    >
      <div className="easing-preset-popover__title">Graphs</div>
      <div className="easing-preset-popover__grid">
        {EASING_PRESET_DEFS.map((preset) => {
          const active = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={active}
              title={preset.label}
              className={
                active
                  ? "easing-preset-popover__tile easing-preset-popover__tile--active"
                  : "easing-preset-popover__tile"
              }
              onClick={() => onSelect(preset.id)}
            >
              <svg
                className="easing-preset-popover__icon"
                viewBox="0 0 40 28"
                aria-hidden
              >
                <path
                  d="M4 24 L36 4"
                  className="easing-preset-popover__guide"
                />
                <path
                  d={preset.iconPath}
                  className="easing-preset-popover__path"
                  fill="none"
                />
              </svg>
              <span className="easing-preset-popover__label">
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>
      {segmentEdit && (
        <SegmentCurveMiniEditor
          clipId={segmentEdit.clipId}
          path={segmentEdit.path}
          leftKeyId={segmentEdit.leftKeyId}
        />
      )}
    </div>
  );
}
