import { useEffect, useState } from "react";
import {
  CLAUDE_MODELS,
  DEFAULT_CLAUDE_MODEL,
  getAiSecretsCached,
  loadAiSecrets,
  saveAiSecretsAndNotify,
  type ClaudeModelId,
} from "../ai/secrets/aiSecrets";
import { useEditorStore } from "../store/editorStore";
import "./AiSettingsPanel.css";

export function AiSettingsPanel() {
  const open = useEditorStore((s) => s.aiSettingsOpen);
  const setAiSettingsOpen = useEditorStore((s) => s.setAiSettingsOpen);

  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState("");
  const [claudeModelId, setClaudeModelId] =
    useState<ClaudeModelId>(DEFAULT_CLAUDE_MODEL);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadAiSecrets().then((s) => {
      setAnthropicKey(s.anthropicKey ?? "");
      setGeminiKey(s.geminiKey ?? "");
      setElevenLabsKey(s.elevenLabsKey ?? "");
      setElevenLabsVoiceId(s.elevenLabsVoiceId ?? "");
      setClaudeModelId(s.claudeModelId ?? DEFAULT_CLAUDE_MODEL);
      setError(null);
      setSaved(false);
    });
  }, [open]);

  if (!open) return null;

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveAiSecretsAndNotify({
        anthropicKey,
        geminiKey,
        elevenLabsKey,
        elevenLabsVoiceId,
        claudeModelId,
      });
      // Reflect cleared empties from normalize
      const cached = getAiSecretsCached();
      setAnthropicKey(cached.anthropicKey ?? "");
      setGeminiKey(cached.geminiKey ?? "");
      setElevenLabsKey(cached.elevenLabsKey ?? "");
      setElevenLabsVoiceId(cached.elevenLabsVoiceId ?? "");
      setClaudeModelId(cached.claudeModelId ?? DEFAULT_CLAUDE_MODEL);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save AI settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="ai-settings-panel"
      role="presentation"
      onClick={() => setAiSettingsOpen(false)}
    >
      <div
        className="ai-settings-panel__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ai-settings-panel__header">
          <h2 id="ai-settings-panel-title" className="ai-settings-panel__title">
            AI settings
          </h2>
          <p className="ai-settings-panel__hint">
            API keys stay on your device. App updates do not clear them.
          </p>
        </div>

        <div className="ai-settings-panel__body">
          <label className="ai-settings-panel__field">
            <span className="ai-settings-panel__label">Anthropic (Claude) API key</span>
            <input
              className="ai-settings-panel__input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={anthropicKey}
              onChange={(e) => {
                setAnthropicKey(e.target.value);
                setSaved(false);
              }}
              placeholder="sk-ant-…"
            />
          </label>

          <label className="ai-settings-panel__field">
            <span className="ai-settings-panel__label">Default Claude model</span>
            <select
              className="ai-settings-panel__input"
              value={claudeModelId}
              onChange={(e) => {
                setClaudeModelId(e.target.value as ClaudeModelId);
                setSaved(false);
              }}
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ai-settings-panel__field">
            <span className="ai-settings-panel__label">Gemini API key</span>
            <input
              className="ai-settings-panel__input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={geminiKey}
              onChange={(e) => {
                setGeminiKey(e.target.value);
                setSaved(false);
              }}
              placeholder="AIza…"
            />
          </label>

          <label className="ai-settings-panel__field">
            <span className="ai-settings-panel__label">
              ElevenLabs API key
            </span>
            <input
              className="ai-settings-panel__input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={elevenLabsKey}
              onChange={(e) => {
                setElevenLabsKey(e.target.value);
                setSaved(false);
              }}
            />
          </label>

          <label className="ai-settings-panel__field">
            <span className="ai-settings-panel__label">
              ElevenLabs Voice ID
            </span>
            <input
              className="ai-settings-panel__input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={elevenLabsVoiceId}
              onChange={(e) => {
                setElevenLabsVoiceId(e.target.value);
                setSaved(false);
              }}
            />
          </label>

          {error ? (
            <p className="ai-settings-panel__error" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="ai-settings-panel__saved" role="status">
              Saved
            </p>
          ) : null}
        </div>

        <div className="ai-settings-panel__footer">
          <button
            type="button"
            className="ai-settings-panel__btn ai-settings-panel__btn--ghost"
            onClick={() => setAiSettingsOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ai-settings-panel__btn ai-settings-panel__btn--primary"
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
