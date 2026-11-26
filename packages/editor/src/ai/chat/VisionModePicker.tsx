import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "../../icons/Icons";
import type { VisionMode } from "../context/types";

const VISION_MODES: ReadonlyArray<{
  id: VisionMode;
  shortLabel: string;
  label: string;
  hint: string;
}> = [
  {
    id: "auto",
    shortLabel: "Auto",
    label: "Vision Auto",
    hint: "Attach a cheap frame when useful",
  },
  {
    id: "always",
    shortLabel: "Always",
    label: "Always cheap",
    hint: "Always attach a downscaled composite",
  },
  {
    id: "off",
    shortLabel: "Off",
    label: "Vision Off",
    hint: "No default images; agent may still call stage_capture",
  },
];

type VisionModePickerProps = {
  value: VisionMode;
  disabled?: boolean;
  onChange: (mode: VisionMode) => void;
};

export function VisionModePicker({
  value,
  disabled,
  onChange,
}: VisionModePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected =
    VISION_MODES.find((m) => m.id === value) ?? VISION_MODES[0]!;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="chat-model-picker chat-vision-picker" ref={rootRef}>
      <button
        type="button"
        className={`chat-model-picker__trigger${open ? " chat-model-picker__trigger--open" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={selected.hint}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="chat-model-picker__name">{selected.shortLabel}</span>
        <IconChevronDown
          size={10}
          className={`chat-model-picker__chevron${open ? " chat-model-picker__chevron--open" : ""}`}
        />
      </button>
      {open ? (
        <ul
          id={listId}
          className="chat-model-picker__menu"
          role="listbox"
          aria-label="Vision mode"
        >
          {VISION_MODES.map((m) => {
            const active = m.id === value;
            return (
              <li key={m.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`chat-model-picker__option${active ? " chat-model-picker__option--active" : ""}`}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <span className="chat-model-picker__option-text">
                    <span className="chat-model-picker__option-label">
                      {m.label}
                    </span>
                    <span className="chat-model-picker__option-hint">
                      {m.hint}
                    </span>
                  </span>
                  {active ? (
                    <IconCheck size={12} className="chat-model-picker__check" />
                  ) : (
                    <span className="chat-model-picker__check-spacer" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
