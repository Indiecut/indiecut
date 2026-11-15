import type { MouseEvent as ReactMouseEvent } from "react";

/** Hover “+” control shared by media / text / sticker / preset library cards. */
export function MediaCardAddButton({
  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      className="media-card__add"
      title="Add to timeline at playhead"
      aria-label={label}
      onClick={(e: ReactMouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onAdd();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      +
    </button>
  );
}
