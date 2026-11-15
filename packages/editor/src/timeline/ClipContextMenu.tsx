import { useEffect, useRef, useState } from "react";
import { IconChevronRight } from "../icons/Icons";
import type { ReverseClipMode } from "../engine/timelineOps";

export type ClipContextMenuState = {
  clipId: string;
  trackId: string;
  x: number;
  y: number;
  hasKeyframes: boolean;
  canFreeze: boolean;
  canExtract: boolean;
  canReverse: boolean;
  reverseMode: ReverseClipMode;
  canCopy: boolean;
  canPaste: boolean;
  /** Empty-lane / ruler paste-only menu (no clip actions). */
  pasteOnly?: boolean;
};

type Props = {
  menu: ClipContextMenuState;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onShowKeyframes: () => void;
  onFreeze: () => void;
  onExtractAudio: () => void;
  onReverse: (mode: "with-audio" | "without-audio") => void;
};

/**
 * Right-click menu on a timeline clip: Copy, Paste, Delete, Freeze, Extract audio,
 * Reverse (hover submenu), Show keyframe.
 */
export function ClipContextMenu({
  menu,
  onClose,
  onCopy,
  onPaste,
  onDelete,
  onShowKeyframes,
  onFreeze,
  onExtractAudio,
  onReverse,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reverseRowRef = useRef<HTMLDivElement>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [flyoutLeft, setFlyoutLeft] = useState(false);

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

  useEffect(() => {
    if (!reverseOpen || !reverseRowRef.current) return;
    const rect = reverseRowRef.current.getBoundingClientRect();
    const flyoutWidth = 180;
    setFlyoutLeft(rect.right + flyoutWidth > window.innerWidth - 8);
  }, [reverseOpen, menu.x, menu.y]);

  const left = Math.min(menu.x, window.innerWidth - 180);
  const top = Math.min(menu.y, window.innerHeight - (menu.pasteOnly ? 80 : 280));

  return (
    <div
      ref={rootRef}
      className="timeline-clip-menu"
      style={{ left, top }}
      role="menu"
      aria-label="Clip menu"
    >
      {!menu.pasteOnly ? (
        <button
          type="button"
          role="menuitem"
          className="timeline-clip-menu__item"
          disabled={!menu.canCopy}
          onClick={() => {
            if (!menu.canCopy) return;
            onCopy();
            onClose();
          }}
        >
          Copy
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="timeline-clip-menu__item"
        disabled={!menu.canPaste}
        title={
          menu.canPaste
            ? "Paste at the playhead marker"
            : "Clipboard is empty"
        }
        onClick={() => {
          if (!menu.canPaste) return;
          onPaste();
          onClose();
        }}
      >
        Paste
      </button>
      {menu.pasteOnly ? null : (
        <>
          <button
            type="button"
            role="menuitem"
            className="timeline-clip-menu__item"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            Delete
          </button>
          <button
            type="button"
            role="menuitem"
            className="timeline-clip-menu__item"
            disabled={!menu.canFreeze}
            title={
              menu.canFreeze
                ? "Insert a freeze frame at the playhead"
                : "Move the playhead inside a video clip to freeze"
            }
            onClick={() => {
              if (!menu.canFreeze) return;
              onFreeze();
              onClose();
            }}
          >
            Freeze
          </button>
          <button
            type="button"
            role="menuitem"
            className="timeline-clip-menu__item"
            disabled={!menu.canExtract}
            title={
              menu.canExtract
                ? "Extract audio to a new audio clip and mute this video"
                : "Audio already extracted, or this clip has no audio track"
            }
            onClick={() => {
              if (!menu.canExtract) return;
              onExtractAudio();
              onClose();
            }}
          >
            Extract audio
          </button>
          <div
            ref={reverseRowRef}
            className={[
              "timeline-clip-menu__submenu",
              reverseOpen ? "timeline-clip-menu__submenu--open" : "",
              !menu.canReverse ? "timeline-clip-menu__submenu--disabled" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => {
              if (menu.canReverse) setReverseOpen(true);
            }}
            onMouseLeave={() => setReverseOpen(false)}
            onFocus={() => {
              if (menu.canReverse) setReverseOpen(true);
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="timeline-clip-menu__item timeline-clip-menu__item--submenu"
              disabled={!menu.canReverse}
              aria-haspopup="menu"
              aria-expanded={reverseOpen}
              title={
                menu.canReverse
                  ? "Reverse this video clip"
                  : "Only video clips can reverse"
              }
              onClick={(e) => {
                e.preventDefault();
                if (!menu.canReverse) return;
                setReverseOpen(true);
              }}
            >
              <span>Reverse</span>
              <IconChevronRight size={12} className="timeline-clip-menu__chevron" />
            </button>
            {reverseOpen && menu.canReverse ? (
              <div
                className={[
                  "timeline-clip-menu timeline-clip-menu--flyout",
                  flyoutLeft ? "timeline-clip-menu--flyout-left" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="menu"
                aria-label="Reverse options"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="timeline-clip-menu__item"
                  onClick={() => {
                    onReverse("with-audio");
                    onClose();
                  }}
                >
                  {menu.reverseMode === "with-audio" ? "✓ " : ""}
                  Reverse with audio
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="timeline-clip-menu__item"
                  onClick={() => {
                    onReverse("without-audio");
                    onClose();
                  }}
                >
                  {menu.reverseMode === "without-audio" ? "✓ " : ""}
                  Reverse without audio
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            className="timeline-clip-menu__item"
            disabled={!menu.hasKeyframes}
            title={
              menu.hasKeyframes
                ? "Show keyframe animation"
                : "No keyframes on this clip"
            }
            onClick={() => {
              if (!menu.hasKeyframes) return;
              onShowKeyframes();
              onClose();
            }}
          >
            Show keyframe
          </button>
        </>
      )}
    </div>
  );
}
