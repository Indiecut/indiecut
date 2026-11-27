import { getPlatform } from "@indiecut/platform";
import type { AiProviderTestId } from "../providers/registry";
import {
  ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_SFX_MODEL,
  ELEVENLABS_TTS_MODEL,
} from "../providers/elevenlabs";

export type ProviderTestResult =
  | { ok: true; detail?: string }
  | { ok: false; error: string };

/** Dual probe used by Settings → Voice Test. */
export type ElevenLabsTestBundle = {
  voice: ProviderTestResult;
  sfx: ProviderTestResult;
};

async function testOpenAI(apiKey: string): Promise<ProviderTestResult> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: "Add an API key first" };

  const bridge = getPlatform();
  if (bridge?.ai?.probeOpenAI) {
    try {
      const res = await bridge.ai.probeOpenAI({ apiKey: key });
      if (res.ok) return { ok: true, detail: "Connected" };
      return { ok: false, error: res.error || "Connection failed" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models?limit=1", {
      method: "GET",
      headers: {
        authorization: `Bearer ${key}`,
      },
    });
    if (response.ok) return { ok: true, detail: "Connected" };
    const detail = await safeErrorText(response);
    return {
      ok: false,
      error: summarizeHttpError(response.status, detail, "OpenAI"),
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not reach OpenAI (network / CORS)",
    };
  }
}

async function testAnthropic(apiKey: string): Promise<ProviderTestResult> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: "Add an API key first" };

  const bridge = getPlatform();
  if (bridge?.ai?.probeAnthropic) {
    try {
      const res = await bridge.ai.probeAnthropic({ apiKey: key });
      if (res.ok) return { ok: true, detail: "Connected" };
      return { ok: false, error: res.error || "Connection failed" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      method: "GET",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    });
    if (response.ok) return { ok: true, detail: "Connected" };
    const detail = await safeErrorText(response);
    return {
      ok: false,
      error: summarizeHttpError(response.status, detail, "Anthropic"),
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not reach Anthropic (network / CORS)",
    };
  }
}

async function testGemini(apiKey: string): Promise<ProviderTestResult> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: "Add an API key first" };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`;
    const response = await fetch(url, { method: "GET" });
    if (response.ok) return { ok: true, detail: "Connected" };
    const detail = await safeErrorText(response);
    return {
      ok: false,
      error: summarizeHttpError(response.status, detail, "Gemini"),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach Gemini",
    };
  }
}

async function probeElevenLabsTts(
  apiKey: string,
  voiceId: string,
): Promise<ProviderTestResult> {
  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: "ok",
        model_id: ELEVENLABS_TTS_MODEL,
      }),
    });
    if (response.ok) {
      await response.arrayBuffer().catch(() => undefined);
      return { ok: true, detail: "Voiceover connected" };
    }
    const detail = await safeErrorText(response);
    return {
      ok: false,
      error: summarizeElevenLabsError(response.status, detail),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach ElevenLabs",
    };
  }
}

async function probeElevenLabsSfx(apiKey: string): Promise<ProviderTestResult> {
  try {
    const url = `https://api.elevenlabs.io/v1/sound-generation?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: "soft click",
        model_id: ELEVENLABS_SFX_MODEL,
        duration_seconds: 0.5,
      }),
    });
    if (response.ok) {
      await response.arrayBuffer().catch(() => undefined);
      return { ok: true, detail: "Sound effects connected" };
    }
    const detail = await safeErrorText(response);
    return {
      ok: false,
      error: summarizeElevenLabsError(response.status, detail),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach ElevenLabs",
    };
  }
}

/**
 * Probe voiceover (TTS + Voice ID) and sound effects (API key only).
 * SFX failure should disable the sfx.generate skill via elevenLabsSfxOk.
 */
export async function testElevenLabsConnection(
  apiKey: string,
  voiceId?: string,
): Promise<ElevenLabsTestBundle> {
  const key = apiKey.trim();
  if (!key) {
    const missing: ProviderTestResult = {
      ok: false,
      error: "Add an API key first",
    };
    return { voice: missing, sfx: missing };
  }

  const voice = (voiceId ?? "").trim();
  const [voiceResult, sfxResult] = await Promise.all([
    voice
      ? probeElevenLabsTts(key, voice)
      : Promise.resolve({
          ok: false as const,
          error: "Add a Voice ID to test voiceover",
        }),
    probeElevenLabsSfx(key),
  ]);

  return { voice: voiceResult, sfx: sfxResult };
}

function summarizeElevenLabsError(status: number, raw: string): string {
  const message = parseElevenLabsMessage(raw);
  if (status === 401 || status === 403) {
    return message && !/forbidden|access/i.test(message)
      ? message
      : "Invalid API key";
  }
  if (status === 429) return "Rate limited — try again shortly";
  if (message) return message;
  return `ElevenLabs HTTP ${status}`;
}

function parseElevenLabsMessage(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const json = JSON.parse(text) as {
      detail?: { message?: string; status?: string } | string;
      message?: string;
    };
    if (typeof json.detail === "string" && json.detail.trim()) {
      return json.detail.trim();
    }
    if (
      json.detail &&
      typeof json.detail === "object" &&
      typeof json.detail.message === "string" &&
      json.detail.message.trim()
    ) {
      return json.detail.message.trim();
    }
    if (typeof json.message === "string" && json.message.trim()) {
      return json.message.trim();
    }
  } catch {
    /* not JSON */
  }
  return text.slice(0, 160);
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 240);
  } catch {
    return "";
  }
}

function summarizeHttpError(
  status: number,
  detail: string,
  provider: string,
): string {
  if (status === 401 || status === 403) return "Invalid API key";
  if (status === 429) return "Rate limited — try again shortly";
  const lower = detail.toLowerCase();
  if (lower.includes("invalid") || lower.includes("unauthorized")) {
    return "Invalid API key";
  }
  return `${provider} HTTP ${status}`;
}

export type ProviderTestOpts = {
  /** Required for ElevenLabs voiceover probe. */
  voiceId?: string;
};

export async function testProviderConnection(
  testId: AiProviderTestId,
  apiKey: string,
  opts?: ProviderTestOpts,
): Promise<ProviderTestResult> {
  switch (testId) {
    case "anthropic":
      return testAnthropic(apiKey);
    case "openai":
      return testOpenAI(apiKey);
    case "gemini":
      return testGemini(apiKey);
    case "elevenlabs": {
      const bundle = await testElevenLabsConnection(apiKey, opts?.voiceId);
      // Single-result callers: overall ok only if both probes succeed.
      if (bundle.voice.ok && bundle.sfx.ok) {
        return { ok: true, detail: "Voiceover + sound effects connected" };
      }
      if (!bundle.sfx.ok) {
        return {
          ok: false,
          error: `SFX: ${bundle.sfx.error}`,
        };
      }
      return {
        ok: false,
        error: `Voice: ${bundle.voice.ok ? "unknown" : bundle.voice.error}`,
      };
    }
    default:
      return { ok: false, error: "No test for this provider yet" };
  }
}
