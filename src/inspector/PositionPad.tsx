import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Props = {
  x: number;
  y: number;
  /** Half-range mapped to pad edges (project half-width). */
  rangeX: number;
  rangeY: number;
  disabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onChange: (x: number, y: number) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * 2D position pad — drag the handle to set X/Y offsets.
 * Center = (0, 0); +X right, +Y down.
 */
export function PositionPad({
  x,
  y,
  rangeX,
  rangeY,
  disabled,
  onDragStart,
  onDragEnd,
  onChange,
}: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const applyFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = padRef.current;
      if (!el || rangeX <= 0 || rangeY <= 0) return;
      const rect = el.getBoundingClientRect();
      const nx = (clientX - rect.left) / Math.max(1, rect.width);
      const ny = (clientY - rect.top) / Math.max(1, rect.height);
      const nextX = Math.round((nx * 2 - 1) * rangeX * 10) / 10;
      const nextY = Math.round((ny * 2 - 1) * rangeY * 10) / 10;
      onChange(
        clamp(nextX, -rangeX, rangeX),
        clamp(nextY, -rangeY, rangeY),
      );
    },
    [onChange, rangeX, rangeY],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onDragStart?.();
    applyFromPointer(e.clientX, e.clientY);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    applyFromPointer(e.clientX, e.clientY);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    onDragEnd?.();
  };

  const rx = Math.max(1, rangeX);
  const ry = Math.max(1, rangeY);
  const pctX = clamp(((x / rx) * 0.5 + 0.5) * 100, 0, 100);
  const pctY = clamp(((y / ry) * 0.5 + 0.5) * 100, 0, 100);

  return (
    <div
      ref={padRef}
      className={
        disabled
          ? "position-pad position-pad--disabled"
          : "position-pad"
      }
      role="presentation"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="position-pad__grid" aria-hidden />
      <div
        className="position-pad__handle"
        style={{ left: `${pctX}%`, top: `${pctY}%` }}
      />
    </div>
  );
}
