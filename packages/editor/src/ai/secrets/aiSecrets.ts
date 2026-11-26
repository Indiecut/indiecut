import {
  getPlatform,
  type AiSecretsV1,
  type ClaudeModelId,
} from "@indiecut/platform";

export type { AiSecretsV1, ClaudeModelId };

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

export const DEFAULT_CLAUDE_MODEL: ClaudeModelId = "claude-sonnet-5-5";

const EMPTY: AiSecretsV1 = {
  version: 1,
  claudeModelId: DEFAULT_CLAUDE_MODEL,
};

/** In-memory cache — never log key values. */
let cache: AiSecretsV1 = { ...EMPTY };
let loaded = false;

function normalize(raw: AiSecretsV1 | null | undefined): AiSecretsV1 {
  if (!raw || raw.version !== 1) {
    return { ...EMPTY };
  }
  const claudeModelId: ClaudeModelId =
    raw.claudeModelId === "claude-haiku-5-5"
      ? "claude-haiku-5-5"
      : DEFAULT_CLAUDE_MODEL;
  return {
    version: 1,
    anthropicKey: trimOrUndef(raw.anthropicKey),
    geminiKey: trimOrUndef(raw.geminiKey),
    elevenLabsKey: trimOrUndef(raw.elevenLabsKey),
    elevenLabsVoiceId: trimOrUndef(raw.elevenLabsVoiceId),
    claudeModelId,
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

export function hasGeminiKey(): boolean {
  return Boolean(cache.geminiKey);
}

/** Voice skill requires both API key and Voice ID. */
export function hasElevenLabsVoice(): boolean {
  return Boolean(cache.elevenLabsKey && cache.elevenLabsVoiceId);
}

export function getClaudeModelId(): ClaudeModelId {
  return cache.claudeModelId ?? DEFAULT_CLAUDE_MODEL;
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
