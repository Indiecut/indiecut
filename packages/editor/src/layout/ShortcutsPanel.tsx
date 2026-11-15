import { useEffect, useMemo, useState } from "react";
import {
  effectiveShortcutMap,
  loadShortcutBindings,
  resetShortcutBindings,
  saveShortcutBindings,
} from "../prefs/appPrefs";
import { COMMAND_IDS, COMMAND_LABELS, type CommandId } from "../shortcuts/commandIds";
import {
  eventToBinding,
  findBindingConflicts,
  formatBinding,
  platformDefaultKeymap,
  type ShortcutBindings,
} from "../shortcuts/defaultKeymap";
import { useEditorStore } from "../store/editorStore";
import "./ShortcutsPanel.css";

export function ShortcutsPanel() {
  const open = useEditorStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useEditorStore((s) => s.setShortcutsOpen);
  const [draft, setDraft] = useState<Record<CommandId, string>>(
    platformDefaultKeymap(),
  );
  const [capturing, setCapturing] = useState<CommandId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadShortcutBindings().then(() => {
      setDraft(effectiveShortcutMap());
      setCapturing(null);
      setError(null);
      setSaved(false);
    });
  }, [open]);

  const conflicts = useMemo(() => findBindingConflicts(draft), [draft]);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const binding = eventToBinding(e);
      setDraft((d) => ({ ...d, [capturing]: binding }));
      setCapturing(null);
      setSaved(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing]);

  if (!open) return null;

  const onSave = async () => {
    setError(null);
    if (conflicts.size > 0) {
      setError("Resolve duplicate bindings before saving.");
      return;
    }
    const defaults = platformDefaultKeymap();
    const custom: ShortcutBindings = {};
    for (const id of COMMAND_IDS) {
      if (draft[id] !== defaults[id]) custom[id] = draft[id];
    }
    await saveShortcutBindings(custom);
    setSaved(true);
  };

  const onReset = async () => {
    await resetShortcutBindings();
    setDraft(platformDefaultKeymap());
    setSaved(false);
    setError(null);
  };

  return (
    <div
      className="shortcuts-panel"
      role="presentation"
      onClick={() => setShortcutsOpen(false)}
    >
      <div
        className="shortcuts-panel__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-panel__header">
          <h2 id="shortcuts-panel-title" className="shortcuts-panel__title">
            Keyboard Shortcuts
          </h2>
          <p className="shortcuts-panel__hint">
            Click a binding, then press a new key combo.
          </p>
        </div>

        <div className="shortcuts-panel__body">
          <ul className="shortcuts-panel__list">
            {COMMAND_IDS.map((id) => {
              const binding = draft[id];
              const conflicted = [...conflicts.values()].some((ids) =>
                ids.includes(id),
              );
              return (
                <li key={id} className="shortcuts-panel__row">
                  <span className="shortcuts-panel__cmd">
                    {COMMAND_LABELS[id]}
                  </span>
                  <button
                    type="button"
                    className={[
                      "shortcuts-panel__binding",
                      capturing === id ? "shortcuts-panel__binding--capture" : "",
                      conflicted ? "shortcuts-panel__binding--conflict" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setCapturing(id)}
                  >
                    {capturing === id
                      ? "Press keys…"
                      : formatBinding(binding)}
                  </button>
                </li>
              );
            })}
          </ul>
          {error ? (
            <p className="shortcuts-panel__error" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="shortcuts-panel__saved" role="status">
              Saved
            </p>
          ) : null}
        </div>

        <div className="shortcuts-panel__footer">
          <button
            type="button"
            className="shortcuts-panel__btn shortcuts-panel__btn--ghost"
            onClick={() => void onReset()}
          >
            Reset to Default
          </button>
          <div className="shortcuts-panel__footer-right">
            <button
              type="button"
              className="shortcuts-panel__btn shortcuts-panel__btn--ghost"
              onClick={() => setShortcutsOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="shortcuts-panel__btn shortcuts-panel__btn--primary"
              onClick={() => void onSave()}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
