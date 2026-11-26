import { useEffect, useId, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "../../icons/Icons";
import type { ChatInteractionMode } from "../context/types";

const CHAT_MODES: ReadonlyArray<{
  id: ChatInteractionMode;
  shortLabel: string;
  label: string;
  hint: string;
}> = [
  {
    id: "agent",
    shortLabel: "Agent",
    label: "Agent mode",
    hint: "Can edit the timeline with tools",
  },
  {
    id: "ask",
    shortLabel: "Ask",
    label: "Ask mode",
    hint: "Suggestions only - no timeline changes",
  },
];

type ModePickerProps = {
  value: ChatInteractionMode;
  disabled?: boolean;
  onChange: (mode: ChatInteractionMode) => void;
};

export function ModePicker({ value, disabled, onChange }: ModePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = CHAT_MODES.find((m) => m.id === value) ?? CHAT_MODES[0]!;

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
    <div className="chat-model-picker chat-mode-picker" ref={rootRef}>
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
          aria-label="Chat mode"
        >
          {CHAT_MODES.map((m) => {
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
                      {m.shortLabel}
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
