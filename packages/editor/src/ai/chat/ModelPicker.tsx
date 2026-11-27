import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevronDown } from "../../icons/Icons";
import {
  CLAUDE_MODELS,
  hasAnthropicKey,
  hasKeyForChatModel,
  hasOpenAiKey,
  OPENAI_MODELS,
  subscribeAiSecrets,
} from "../secrets/aiSecrets";

type ModelPickerProps = {
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
};

type ChatModelOption = {
  id: string;
  shortLabel: string;
  label: string;
  hint: string;
};

type ModelGroup = {
  id: "anthropic" | "openai";
  label: string;
  models: readonly ChatModelOption[];
  keyReady: boolean;
};

export function ModelPicker({ value, disabled, onChange }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [keysVersion, setKeysVersion] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    return subscribeAiSecrets(() => setKeysVersion((v) => v + 1));
  }, []);

  const groups = useMemo<ModelGroup[]>(() => {
    void keysVersion;
    return [
      {
        id: "anthropic",
        label: "Claude",
        models: CLAUDE_MODELS,
        keyReady: hasAnthropicKey(),
      },
      {
        id: "openai",
        label: "OpenAI",
        models: OPENAI_MODELS,
        keyReady: hasOpenAiKey(),
      },
    ];
  }, [keysVersion]);

  const allModels = useMemo(
    () => groups.flatMap((g) => g.models),
    [groups],
  );

  const selected =
    allModels.find((m) => m.id === value) ??
    allModels.find((m) => hasKeyForChatModel(m.id)) ??
    allModels[0]!;

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
    <div className="chat-model-picker" ref={rootRef}>
      <button
        type="button"
        className={`chat-model-picker__trigger${open ? " chat-model-picker__trigger--open" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={selected.label}
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
          className="chat-model-picker__menu chat-model-picker__menu--grouped"
          role="listbox"
          aria-label="Chat model"
        >
          {groups.map((group) => (
            <li key={group.id} role="presentation" className="chat-model-picker__group">
              <div className="chat-model-picker__group-label" aria-hidden="true">
                {group.label}
                {!group.keyReady ? (
                  <span className="chat-model-picker__group-note">No API key</span>
                ) : null}
              </div>
              <ul className="chat-model-picker__group-list" role="group" aria-label={group.label}>
                {group.models.map((m) => {
                  const active = m.id === value;
                  const ready = group.keyReady;
                  return (
                    <li key={m.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={!ready}
                        title={
                          ready
                            ? m.label
                            : `Add ${group.label} API key in Settings → AI`
                        }
                        className={`chat-model-picker__option${active ? " chat-model-picker__option--active" : ""}${!ready ? " chat-model-picker__option--disabled" : ""}`}
                        onClick={() => {
                          if (!ready) return;
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
                          <IconCheck
                            size={12}
                            className="chat-model-picker__check"
                          />
                        ) : (
                          <span className="chat-model-picker__check-spacer" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
