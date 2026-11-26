import type { AiSecretsV1, ClaudeModelId } from "@indiecut/platform";
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from "../secrets/aiSecrets";

/** Fixed product capabilities — nav items. Add carefully; providers grow under these. */
export type AiCapabilityId = "chat" | "image" | "voice";

export type AiProviderId =
  | "anthropic"
  | "openai-chat"
  | "gemini-chat"
  | "gemini"
  | "openai-image"
  | "flux"
  | "elevenlabs"
  | "openai-tts";

export type AiProviderTestId = "anthropic" | "gemini" | "elevenlabs";

export type AiModelOption = {
  id: string;
  label: string;
  /** false = show disabled in UI (coming soon). Default true. */
  available?: boolean;
};

export type AiProviderDef = {
  id: AiProviderId;
  label: string;
  /** false = show in dropdown as coming soon. */
  available: boolean;
  models: AiModelOption[];
  /** Lightweight connectivity check id, if any. */
  testId?: AiProviderTestId;
  /** Maps this provider's API key onto AiSecretsV1 (v1 storage). */
  apiKeyField?: keyof Pick<
    AiSecretsV1,
    "anthropicKey" | "geminiKey" | "elevenLabsKey"
  >;
  /** Optional extra text fields (e.g. Voice ID). */
  extraFields?: Array<{
    key: "voiceId";
    label: string;
    mapsTo: "elevenLabsVoiceId";
  }>;
  /** Default model stored on secrets (chat only in v1). */
  defaultModelField?: "claudeModelId";
};

export type AiCapabilityDef = {
  id: AiCapabilityId;
  title: string;
  blurb: string;
  required?: boolean;
  /** v1: the one live provider. Tomorrow: user-selected among `providers`. */
  activeProviderId: AiProviderId;
  providers: AiProviderDef[];
};

/**
 * Capability → provider → models registry.
 * UI renders from this. Shipping a new provider = add an entry + wire secrets/test.
 */
export const AI_CAPABILITIES: readonly AiCapabilityDef[] = [
  {
    id: "chat",
    title: "Chat",
    blurb: "Powers Ask and Agent in chat. Required for the AI panel.",
    required: true,
    activeProviderId: "anthropic",
    providers: [
      {
        id: "anthropic",
        label: "Anthropic Claude",
        available: true,
        testId: "anthropic",
        apiKeyField: "anthropicKey",
        defaultModelField: "claudeModelId",
        models: CLAUDE_MODELS.map((m) => ({
          id: m.id,
          label: m.label,
          available: true,
        })),
      },
      {
        id: "openai-chat",
        label: "OpenAI — soon",
        available: false,
        models: [],
      },
      {
        id: "gemini-chat",
        label: "Gemini — soon",
        available: false,
        models: [],
      },
    ],
  },
  {
    id: "image",
    title: "Image",
    blurb: "Optional skill for generate and edit stills from chat.",
    activeProviderId: "gemini",
    providers: [
      {
        id: "gemini",
        label: "Google Gemini",
        available: true,
        testId: "gemini",
        apiKeyField: "geminiKey",
        models: [
          { id: "gemini-image", label: "Gemini image", available: true },
          {
            id: "gemini-image-hq",
            label: "Higher quality — soon",
            available: false,
          },
        ],
      },
      {
        id: "openai-image",
        label: "OpenAI Images — soon",
        available: false,
        models: [],
      },
      {
        id: "flux",
        label: "Flux — soon",
        available: false,
        models: [],
      },
    ],
  },
  {
    id: "voice",
    title: "Voice",
    blurb:
      "Voiceover needs API key + Voice ID. Sound effects and captions (speech-to-text) need the API key only.",
    activeProviderId: "elevenlabs",
    providers: [
      {
        id: "elevenlabs",
        label: "ElevenLabs",
        available: true,
        testId: "elevenlabs",
        apiKeyField: "elevenLabsKey",
        models: [],
        extraFields: [
          {
            key: "voiceId",
            label: "Voice ID",
            mapsTo: "elevenLabsVoiceId",
          },
        ],
      },
      {
        id: "openai-tts",
        label: "OpenAI TTS — soon",
        available: false,
        models: [],
      },
    ],
  },
] as const;

export function getCapability(id: AiCapabilityId): AiCapabilityDef {
  const found = AI_CAPABILITIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown AI capability: ${id}`);
  return found;
}

export function getActiveProvider(cap: AiCapabilityDef): AiProviderDef {
  return (
    cap.providers.find((p) => p.id === cap.activeProviderId) ??
    cap.providers.find((p) => p.available) ??
    cap.providers[0]!
  );
}

export function isClaudeModelId(id: string): id is ClaudeModelId {
  return id === "claude-sonnet-5-5" || id === "claude-haiku-5-5";
}

export function resolveClaudeModelId(
  raw: string | undefined,
): ClaudeModelId {
  const id = raw ?? "";
  return isClaudeModelId(id) ? id : DEFAULT_CLAUDE_MODEL;
}

/** Whether a capability looks configured enough to show a ready indicator. */
export function isCapabilityReady(
  capId: AiCapabilityId,
  secrets: AiSecretsV1,
): boolean {
  const cap = getCapability(capId);
  const provider = getActiveProvider(cap);
  if (!provider.apiKeyField) return false;
  const key = secrets[provider.apiKeyField];
  if (typeof key !== "string" || !key.trim()) return false;
  if (provider.id === "elevenlabs") {
    return Boolean(secrets.elevenLabsVoiceId?.trim());
  }
  return true;
}
