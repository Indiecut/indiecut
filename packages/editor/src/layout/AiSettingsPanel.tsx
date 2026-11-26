import { useEffect, useMemo, useState, type ComponentType } from "react";
import { IconChat, IconImage, IconMic } from "../icons/Icons";
import {
  AI_CAPABILITIES,
  getActiveProvider,
  getCapability,
  isCapabilityReady,
  resolveClaudeModelId,
  type AiCapabilityId,
} from "../ai/providers/registry";
import {
  getAiSecretsCached,
  loadAiSecrets,
  saveAiSecretsAndNotify,
  type AiSecretsV1,
  type ClaudeModelId,
} from "../ai/secrets/aiSecrets";
import {
  testElevenLabsConnection,
  testProviderConnection,
  type ProviderTestResult,
} from "../ai/secrets/testProviderConnection";
import { useEditorStore } from "../store/editorStore";
import "./AiSettingsPanel.css";

type DraftSecrets = {
  anthropicKey: string;
  geminiKey: string;
  elevenLabsKey: string;
  elevenLabsVoiceId: string;
  elevenLabsSfxOk?: boolean;
  claudeModelId: ClaudeModelId;
};

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; detail?: string }
  | { status: "err"; error: string };

type NavIcon = ComponentType<{ size?: number; className?: string }>;

const NAV_ICONS: Record<AiCapabilityId, NavIcon> = {
  chat: IconChat,
  image: IconImage,
  voice: IconMic,
};

function secretsToDraft(s: AiSecretsV1): DraftSecrets {
  return {
    anthropicKey: s.anthropicKey ?? "",
    geminiKey: s.geminiKey ?? "",
    elevenLabsKey: s.elevenLabsKey ?? "",
    elevenLabsVoiceId: s.elevenLabsVoiceId ?? "",
    elevenLabsSfxOk: s.elevenLabsSfxOk,
    claudeModelId: resolveClaudeModelId(s.claudeModelId),
  };
}

function draftAsSecrets(d: DraftSecrets): AiSecretsV1 {
  return {
    version: 1,
    anthropicKey: d.anthropicKey,
    geminiKey: d.geminiKey,
    elevenLabsKey: d.elevenLabsKey,
    elevenLabsVoiceId: d.elevenLabsVoiceId,
    elevenLabsSfxOk: d.elevenLabsSfxOk,
    claudeModelId: d.claudeModelId,
  };
}

function resultToTestState(result: ProviderTestResult): TestState {
  return result.ok
    ? { status: "ok", detail: result.detail ?? "Connected" }
    : { status: "err", error: result.error };
}

function StatusLine({ state, idleHint }: { state: TestState; idleHint?: string }) {
  if (state.status === "idle") {
    return idleHint ? (
      <p className="ai-settings-panel__status">{idleHint}</p>
    ) : (
      <p className="ai-settings-panel__status" />
    );
  }
  const cls =
    state.status === "ok"
      ? "ai-settings-panel__status ai-settings-panel__status--ok"
      : state.status === "err"
        ? "ai-settings-panel__status ai-settings-panel__status--err"
        : "ai-settings-panel__status ai-settings-panel__status--busy";
  const text =
    state.status === "ok"
      ? state.detail || "Connected"
      : state.status === "err"
        ? state.error
        : "Checking…";
  return (
    <p className={cls} role="status">
      <span className="ai-settings-panel__status-mark" />
      {text}
    </p>
  );
}

export function AiSettingsPanel() {
  const open = useEditorStore((s) => s.aiSettingsOpen);
  const setAiSettingsOpen = useEditorStore((s) => s.setAiSettingsOpen);

  const [capabilityId, setCapabilityId] = useState<AiCapabilityId>("chat");
  const [draft, setDraft] = useState<DraftSecrets>(() =>
    secretsToDraft(getAiSecretsCached()),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tests, setTests] = useState<Partial<Record<AiCapabilityId, TestState>>>(
    {},
  );
  const [voiceProbe, setVoiceProbe] = useState<TestState>({ status: "idle" });
  const [sfxProbe, setSfxProbe] = useState<TestState>({ status: "idle" });
  const [sttProbe, setSttProbe] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    if (!open) return;
    void loadAiSecrets().then((s) => {
      setDraft(secretsToDraft(s));
      setError(null);
      setSaved(false);
      setTests({});
      setVoiceProbe({ status: "idle" });
      setSfxProbe(
        s.elevenLabsSfxOk === true
          ? { status: "ok", detail: "Sound effects connected" }
          : s.elevenLabsSfxOk === false
            ? {
                status: "err",
                error: "SFX unavailable — skill disabled until Test passes",
              }
            : { status: "idle" },
      );
      setSttProbe(
        s.elevenLabsKey?.trim()
          ? {
              status: "ok",
              detail: "Speech-to-text available for captions",
            }
          : { status: "idle" },
      );
      setCapabilityId("chat");
    });
  }, [open]);

  const capability = useMemo(
    () => getCapability(capabilityId),
    [capabilityId],
  );
  const provider = useMemo(
    () => getActiveProvider(capability),
    [capability],
  );

  const readyByCap = useMemo(() => {
    const secrets = draftAsSecrets(draft);
    const out: Partial<Record<AiCapabilityId, boolean>> = {};
    for (const cap of AI_CAPABILITIES) {
      out[cap.id] = isCapabilityReady(cap.id, secrets);
    }
    return out;
  }, [draft]);

  if (!open) return null;

  const markDirty = () => {
    setSaved(false);
    setError(null);
  };

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveAiSecretsAndNotify(draftAsSecrets(draft));
      setDraft(secretsToDraft(getAiSecretsCached()));
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save AI settings",
      );
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    const testId = provider.testId;
    if (!testId || !provider.apiKeyField) return;
    const apiKey = draft[provider.apiKeyField] ?? "";

    if (testId === "elevenlabs") {
      setVoiceProbe({ status: "testing" });
      setSfxProbe({ status: "testing" });
      setSttProbe({ status: "testing" });
      setTests((t) => ({ ...t, voice: { status: "testing" } }));

      const bundle = await testElevenLabsConnection(
        apiKey,
        draft.elevenLabsVoiceId,
      );
      const voiceState = resultToTestState(bundle.voice);
      const sfxState = resultToTestState(bundle.sfx);
      setVoiceProbe(voiceState);
      setSfxProbe(sfxState);
      // STT shares the API key — available whenever the key authenticates
      // (voice or SFX probe succeeds). No separate STT network call.
      const keyWorks = bundle.voice.ok || bundle.sfx.ok;
      setSttProbe(
        keyWorks
          ? { status: "ok", detail: "Speech-to-text available for captions" }
          : {
              status: "err",
              error: !bundle.sfx.ok
                ? bundle.sfx.error
                : !bundle.voice.ok
                  ? bundle.voice.error
                  : "Could not verify API key",
            },
      );

      const sfxOk = bundle.sfx.ok;
      const nextDraft: DraftSecrets = {
        ...draft,
        elevenLabsSfxOk: sfxOk,
      };
      setDraft(nextDraft);

      // Persist SFX gate immediately so the skill unlocks/locks without Save.
      try {
        await saveAiSecretsAndNotify(draftAsSecrets(nextDraft));
        setSaved(true);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save SFX test result",
        );
      }

      setTests((t) => ({
        ...t,
        voice:
          bundle.voice.ok && bundle.sfx.ok
            ? {
                status: "ok",
                detail: "Voiceover + sound effects + speech-to-text ready",
              }
            : !bundle.sfx.ok
              ? {
                  status: "err",
                  error: `SFX failed — skill disabled. ${bundle.sfx.error}`,
                }
              : voiceState,
      }));
      return;
    }

    setTests((t) => ({ ...t, [capabilityId]: { status: "testing" } }));
    const result = await testProviderConnection(testId, apiKey);
    setTests((t) => ({
      ...t,
      [capabilityId]: resultToTestState(result),
    }));
  };

  const testState = tests[capabilityId] ?? { status: "idle" as const };
  const apiKeyValue = provider.apiKeyField
    ? draft[provider.apiKeyField]
    : "";
  const isElevenLabs = provider.testId === "elevenlabs";
  const testBusy = isElevenLabs
    ? voiceProbe.status === "testing" || sfxProbe.status === "testing"
    : testState.status === "testing";
  const testDisabled = testBusy || !apiKeyValue.trim();

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
        <aside className="ai-settings-panel__nav" aria-label="AI capabilities">
          <div className="ai-settings-panel__nav-brand">
            <p className="ai-settings-panel__nav-kicker">Preferences</p>
            <p className="ai-settings-panel__nav-title">AI</p>
          </div>

          <ul className="ai-settings-panel__nav-list" role="tablist">
            {AI_CAPABILITIES.map((cap) => {
              const Icon = NAV_ICONS[cap.id];
              const active = cap.id === capabilityId;
              const ready = Boolean(readyByCap[cap.id]);
              return (
                <li key={cap.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={
                      active
                        ? "ai-settings-panel__nav-btn ai-settings-panel__nav-btn--active"
                        : "ai-settings-panel__nav-btn"
                    }
                    onClick={() => setCapabilityId(cap.id)}
                  >
                    <Icon size={16} className="ai-settings-panel__nav-icon" />
                    <span className="ai-settings-panel__nav-label">
                      {cap.title}
                    </span>
                    <span
                      className={
                        ready
                          ? "ai-settings-panel__nav-dot ai-settings-panel__nav-dot--ready"
                          : "ai-settings-panel__nav-dot"
                      }
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="ai-settings-panel__nav-foot">
            Keys stay on this device.
          </p>
        </aside>

        <div className="ai-settings-panel__main">
          <header className="ai-settings-panel__main-header">
            <h2
              id="ai-settings-panel-title"
              className="ai-settings-panel__main-title"
            >
              {capability.title}
            </h2>
            <p className="ai-settings-panel__main-blurb">{capability.blurb}</p>
          </header>

          <div className="ai-settings-panel__fields" role="tabpanel">
            <label className="ai-settings-panel__field">
              <span className="ai-settings-panel__label">Provider</span>
              <select
                className="ai-settings-panel__input"
                value={provider.id}
                onChange={() => {
                  /* v1: only one live provider; disabled options are coming soon */
                }}
              >
                {capability.providers.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={!p.available}
                  >
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            {provider.apiKeyField ? (
              <div className="ai-settings-panel__field">
                <span className="ai-settings-panel__label">API key</span>
                <div className="ai-settings-panel__key-row">
                  <input
                    className="ai-settings-panel__input"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={apiKeyValue}
                    placeholder={
                      provider.id === "gemini"
                        ? "AIza…"
                        : provider.id === "anthropic"
                          ? "sk-ant-…"
                          : undefined
                    }
                    onChange={(e) => {
                      const field = provider.apiKeyField!;
                      setDraft((d) => ({
                        ...d,
                        [field]: e.target.value,
                        ...(field === "elevenLabsKey"
                          ? { elevenLabsSfxOk: undefined }
                          : null),
                      }));
                      setTests((t) => ({
                        ...t,
                        [capabilityId]: { status: "idle" },
                      }));
                      if (field === "elevenLabsKey") {
                        setVoiceProbe({ status: "idle" });
                        setSfxProbe({ status: "idle" });
                        setSttProbe({ status: "idle" });
                      }
                      markDirty();
                    }}
                  />
                  <button
                    type="button"
                    className="ai-settings-panel__test-btn"
                    disabled={testDisabled}
                    title={
                      isElevenLabs
                        ? "Test voiceover + sound effects"
                        : "Test connection"
                    }
                    onClick={() => void onTest()}
                  >
                    {testBusy ? "Testing…" : "Test"}
                  </button>
                </div>
                {isElevenLabs ? (
                  <div className="ai-settings-panel__probe-list">
                    <StatusLine
                      state={voiceProbe}
                      idleHint="Voiceover — needs Voice ID"
                    />
                    <StatusLine
                      state={sfxProbe}
                      idleHint="Sound effects — API key only"
                    />
                    <StatusLine
                      state={sttProbe}
                      idleHint="Speech-to-text (captions) — API key only"
                    />
                  </div>
                ) : (
                  <StatusLine state={testState} />
                )}
              </div>
            ) : null}

            {provider.defaultModelField === "claudeModelId" &&
            provider.models.length > 0 ? (
              <label className="ai-settings-panel__field">
                <span className="ai-settings-panel__label">Default model</span>
                <select
                  className="ai-settings-panel__input"
                  value={draft.claudeModelId}
                  onChange={(e) => {
                    setDraft((d) => ({
                      ...d,
                      claudeModelId: resolveClaudeModelId(e.target.value),
                    }));
                    markDirty();
                  }}
                >
                  {provider.models.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={m.available === false}
                    >
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {provider.models.length > 0 && !provider.defaultModelField ? (
              <label className="ai-settings-panel__field">
                <span className="ai-settings-panel__label">Default model</span>
                <select
                  className="ai-settings-panel__input"
                  value={
                    provider.models.find((m) => m.available !== false)?.id ??
                    provider.models[0]!.id
                  }
                  disabled
                  title="Model picker for this skill lands with multi-model support"
                >
                  {provider.models.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={m.available === false}
                    >
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {provider.extraFields?.map((extra) => (
              <label key={extra.key} className="ai-settings-panel__field">
                <span className="ai-settings-panel__label">{extra.label}</span>
                <input
                  className="ai-settings-panel__input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft[extra.mapsTo]}
                  onChange={(e) => {
                    setDraft((d) => ({
                      ...d,
                      [extra.mapsTo]: e.target.value,
                    }));
                    if (extra.mapsTo === "elevenLabsVoiceId") {
                      setVoiceProbe({ status: "idle" });
                    }
                    markDirty();
                  }}
                />
              </label>
            ))}

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
        </div>

        <div className="ai-settings-panel__footer">
          <button
            type="button"
            className="ai-settings-panel__btn ai-settings-panel__btn--ghost"
            onClick={() => setAiSettingsOpen(false)}
          >
            Close
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
