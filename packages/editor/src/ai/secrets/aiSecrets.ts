import {
  getPlatform,
  type AiSecretsV1,
  type ChatProviderId,
  type ClaudeModelId,
  type OpenAiModelId,
} from "@indiecut/platform";

export type { AiSecretsV1, ChatProviderId, ClaudeModelId, OpenAiModelId };

export const CLAUDE_MODELS: ReadonlyArray<{
  id: ClaudeModelId;
  /** Compact label for the composer chip. */
  shortLabel: string;
  /** Full label in menus / settings. */
  label: string;
  hint: string;
}> = [
  {
    id: "claude-sonnet-5-5",
    shortLabel: "Sonnet",
    label: "Sonnet (recommended)",
    hint: "Best quality",
  },
  {
    id: "claude-haiku-5-5",
    shortLabel: "Haiku",
    label: "Haiku (faster)",
    hint: "Faster replies",
  },
];

export const OPENAI_MODELS: ReadonlyArray<{
  id: OpenAiModelId;
  shortLabel: string;
  label: string;
  hint: string;
}> = [
  {
    id: "gpt-4o",
    shortLabel: "GPT-4o",
    label: "GPT-4o (recommended)",
    hint: "Strong quality",
  },
  {
    id: "gpt-4o-mini",
    shortLabel: "4o mini",
    label: "GPT-4o mini (faster)",
    hint: "Faster / cheaper",
  },
  {
    id: "gpt-6-luna-max",
    shortLabel: "Luna Max",
    label: "Luna Max (reasoning)",
    hint: "Highest reasoning (xhigh)",
  },
];

export const DEFAULT_CLAUDE_MODEL: ClaudeModelId = "claude-sonnet-5-5";
export const DEFAULT_OPENAI_MODEL: OpenAiModelId = "gpt-4o";
export const DEFAULT_CHAT_PROVIDER: ChatProviderId = "anthropic";

const EMPTY: AiSecretsV1 = {
  version: 1,
  chatProviderId: DEFAULT_CHAT_PROVIDER,
  claudeModelId: DEFAULT_CLAUDE_MODEL,
  openaiModelId: DEFAULT_OPENAI_MODEL,
};

/** In-memory cache — never log key values. */
let cache: AiSecretsV1 = { ...EMPTY };
let loaded = false;

export function isClaudeModelId(id: string): id is ClaudeModelId {
  return id === "claude-sonnet-5-5" || id === "claude-haiku-5-5";
}

export function isOpenAiModelId(id: string): id is OpenAiModelId {
  return (
    id === "gpt-4o" || id === "gpt-4o-mini" || id === "gpt-6-luna-max"
  );
}

export function isChatProviderId(id: string): id is ChatProviderId {
  return id === "anthropic" || id === "openai";
}

export function resolveClaudeModelId(raw: string | undefined): ClaudeModelId {
  return isClaudeModelId(raw ?? "") ? (raw as ClaudeModelId) : DEFAULT_CLAUDE_MODEL;
}

export function resolveOpenAiModelId(raw: string | undefined): OpenAiModelId {
  return isOpenAiModelId(raw ?? "") ? (raw as OpenAiModelId) : DEFAULT_OPENAI_MODEL;
}

export function resolveChatProviderId(
  raw: string | undefined,
): ChatProviderId {
  return isChatProviderId(raw ?? "")
    ? (raw as ChatProviderId)
    : DEFAULT_CHAT_PROVIDER;
}

function normalize(raw: AiSecretsV1 | null | undefined): AiSecretsV1 {
  if (!raw || raw.version !== 1) {
    return { ...EMPTY };
  }
  const elevenLabsSfxOk =
    raw.elevenLabsSfxOk === true
      ? true
      : raw.elevenLabsSfxOk === false
        ? false
        : undefined;
  return {
    version: 1,
    anthropicKey: trimOrUndef(raw.anthropicKey),
    openaiKey: trimOrUndef(raw.openaiKey),
    geminiKey: trimOrUndef(raw.geminiKey),
    elevenLabsKey: trimOrUndef(raw.elevenLabsKey),
    elevenLabsVoiceId: trimOrUndef(raw.elevenLabsVoiceId),
    elevenLabsSfxOk,
    chatProviderId: resolveChatProviderId(raw.chatProviderId),
    claudeModelId: resolveClaudeModelId(raw.claudeModelId),
    openaiModelId: resolveOpenAiModelId(raw.openaiModelId),
  };
}

function trimOrUndef(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export function getAiSecretsCached(): AiSecretsV1 {
  return cache;
}

export function hasAnthropicKey(): boolean {
  return Boolean(cache.anthropicKey);
}

export function hasOpenAiKey(): boolean {
  return Boolean(cache.openaiKey);
}

/** True when the active chat provider has an API key. */
export function hasChatKey(): boolean {
  const provider = getChatProviderId();
  return provider === "openai" ? hasOpenAiKey() : hasAnthropicKey();
}

export function hasGeminiKey(): boolean {
  return Boolean(cache.geminiKey);
}

/** True when an ElevenLabs API key is present. */
export function hasElevenLabsKey(): boolean {
  return Boolean(cache.elevenLabsKey);
}

/** Voiceover skill requires both API key and Voice ID. */
export function hasElevenLabsVoice(): boolean {
  return Boolean(cache.elevenLabsKey && cache.elevenLabsVoiceId);
}

/**
 * Sound effects skill: API key present and last SFX probe did not fail.
 * Untested (`undefined`) stays allowed; failed Test sets `elevenLabsSfxOk: false`.
 */
export function hasElevenLabsSfx(): boolean {
  return Boolean(cache.elevenLabsKey) && cache.elevenLabsSfxOk !== false;
}

export function getChatProviderId(): ChatProviderId {
  return resolveChatProviderId(cache.chatProviderId);
}

export function getClaudeModelId(): ClaudeModelId {
  return cache.claudeModelId ?? DEFAULT_CLAUDE_MODEL;
}

export function getOpenAiModelId(): OpenAiModelId {
  return cache.openaiModelId ?? DEFAULT_OPENAI_MODEL;
}

/** Active chat model id for the selected provider. */
export function getChatModelId(): string {
  return getChatProviderId() === "openai"
    ? getOpenAiModelId()
    : getClaudeModelId();
}

/** Which chat provider a model allowlist id belongs to. */
export function chatProviderForModelId(modelId: string): ChatProviderId {
  return isOpenAiModelId(modelId) ? "openai" : "anthropic";
}

/** True when any chat provider has an API key. */
export function hasAnyChatKey(): boolean {
  return hasAnthropicKey() || hasOpenAiKey();
}

/** True when the API key for this model’s provider is present. */
export function hasKeyForChatModel(modelId: string): boolean {
  return chatProviderForModelId(modelId) === "openai"
    ? hasOpenAiKey()
    : hasAnthropicKey();
}

/** Persist active chat provider + model from a picker selection. */
export async function selectChatModel(modelId: string): Promise<AiSecretsV1> {
  const current = getAiSecretsCached();
  if (isOpenAiModelId(modelId)) {
    return saveAiSecretsAndNotify({
      ...current,
      chatProviderId: "openai",
      openaiModelId: modelId,
    });
  }
  if (isClaudeModelId(modelId)) {
    return saveAiSecretsAndNotify({
      ...current,
      chatProviderId: "anthropic",
      claudeModelId: modelId,
    });
  }
  return current;
}

/** Load secrets from the platform bridge into memory. Safe to call multiple times. */
export async function loadAiSecrets(): Promise<AiSecretsV1> {
  const bridge = getPlatform();
  try {
    const raw = (await bridge?.secrets?.getAiSecrets()) ?? null;
    cache = normalize(raw);
  } catch {
    cache = { ...EMPTY };
  }
  loaded = true;
  return cache;
}

export function isAiSecretsLoaded(): boolean {
  return loaded;
}

/** Persist and update the in-memory cache. */
export async function saveAiSecrets(
  next: Omit<AiSecretsV1, "version"> & { version?: 1 },
): Promise<AiSecretsV1> {
  const bridge = getPlatform();
  if (!bridge?.secrets?.setAiSecrets) {
    throw new Error("AI secrets storage is unavailable on this platform");
  }
  const normalized = normalize({ version: 1, ...next });
  await bridge.secrets.setAiSecrets(normalized);
  cache = normalized;
  loaded = true;
  return cache;
}

/** Notify React subscribers when secrets change (settings save). */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeAiSecrets(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyAiSecretsListeners(): void {
  for (const listener of listeners) listener();
}

export async function saveAiSecretsAndNotify(
  next: Omit<AiSecretsV1, "version"> & { version?: 1 },
): Promise<AiSecretsV1> {
  const saved = await saveAiSecrets(next);
  notifyAiSecretsListeners();
  return saved;
}
