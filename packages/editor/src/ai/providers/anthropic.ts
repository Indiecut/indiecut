import { getPlatform } from "@indiecut/platform";

export type AnthropicImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

export type AnthropicTextBlock = {
  type: "text";
  text: string;
};

export type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AnthropicToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  /** Plain string or multimodal content (text + images from capture tools). */
  content: string | Array<AnthropicTextBlock | AnthropicImageBlock>;
  is_error?: boolean;
};

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export type AnthropicChatMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type StreamToolUse = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type StreamMessageResult = {
  text: string;
  toolUses: StreamToolUse[];
  /** Full assistant content blocks for multi-turn tool loops. */
  content: AnthropicContentBlock[];
};

export type StreamMessageOpts = {
  apiKey: string;
  model: string;
  system: string;
  messages: AnthropicChatMessage[];
  tools?: AnthropicTool[];
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
};

type SseToolBuilder = {
  index: number;
  id: string;
  name: string;
  inputJson: string;
};

/**
 * Stream a Claude Messages API reply (text + optional tool_use).
 * Desktop uses the main-process proxy (no CORS); web uses renderer fetch.
 */
export async function streamMessage(
  opts: StreamMessageOpts,
): Promise<StreamMessageResult> {
  const bridge = getPlatform();
  if (bridge?.ai?.streamAnthropic) {
    return streamViaBridge(opts);
  }
  return streamViaFetch(opts);
}

function buildRequestBody(opts: StreamMessageOpts) {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: 4096,
    stream: true,
    system: opts.system,
    messages: opts.messages,
  };
  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
  }
  return body;
}

async function streamViaBridge(
  opts: StreamMessageOpts,
): Promise<StreamMessageResult> {
  const bridge = getPlatform();
  if (!bridge?.ai) throw new Error("AI bridge unavailable");

  const streamId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `stream_${Date.now().toString(36)}`;

  const textParts: string[] = [];
  const toolUses: StreamToolUse[] = [];
  const content: AnthropicContentBlock[] = [];

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      unsub();
      opts.signal?.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve();
    };

    const onAbort = () => {
      void bridge.ai!.abortAnthropic(streamId).finally(() => finish());
    };

    const unsub = bridge.ai!.onAnthropicEvent((event) => {
      if (event.streamId !== streamId) return;
      if (event.type === "delta" && event.text) {
        textParts.push(event.text);
        opts.onDelta?.(event.text);
      } else if (event.type === "tool_use" && event.toolUse) {
        const tu: StreamToolUse = {
          id: event.toolUse.id,
          name: event.toolUse.name,
          input:
            event.toolUse.input && typeof event.toolUse.input === "object"
              ? (event.toolUse.input as Record<string, unknown>)
              : {},
        };
        toolUses.push(tu);
        content.push({
          type: "tool_use",
          id: tu.id,
          name: tu.name,
          input: tu.input,
        });
      } else if (event.type === "error") {
        finish(new Error(event.error || "Anthropic stream error"));
      } else if (event.type === "done") {
        finish();
      }
    });

    if (opts.signal?.aborted) {
      onAbort();
      return;
    }
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    void bridge
      .ai!.streamAnthropic({
        streamId,
        apiKey: opts.apiKey,
        model: opts.model,
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
      })
      .catch((err) => {
        finish(err instanceof Error ? err : new Error(String(err)));
      });
  });

  const text = textParts.join("");
  if (text) {
    content.unshift({ type: "text", text });
  }

  return { text, toolUses, content };
}

async function streamViaFetch(
  opts: StreamMessageOpts,
): Promise<StreamMessageResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(buildRequestBody(opts)),
    signal: opts.signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `Anthropic HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body from Anthropic");
  }

  return consumeAnthropicSse(response.body, opts.onDelta, opts.signal);
}

/** Shared SSE consumer for fetch path (and mirror of Electron main parsing). */
export async function consumeAnthropicSse(
  body: ReadableStream<Uint8Array>,
  onDelta?: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamMessageResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const textParts: string[] = [];
  const toolBuilders = new Map<number, SseToolBuilder>();
  const toolOrder: number[] = [];

  const abortReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal) {
    if (signal.aborted) abortReader();
    else signal.addEventListener("abort", abortReader, { once: true });
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        applySseEvent(parsed, {
          onText: (t) => {
            textParts.push(t);
            onDelta?.(t);
          },
          toolBuilders,
          toolOrder,
        });
        if (parsed.type === "error") {
          const errObj = parsed.error as { message?: string } | undefined;
          throw new Error(
            errObj?.message ||
              (typeof parsed.message === "string" ? parsed.message : null) ||
              "Anthropic stream error",
          );
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }

  const toolUses: StreamToolUse[] = [];
  const content: AnthropicContentBlock[] = [];
  const text = textParts.join("");
  if (text) content.push({ type: "text", text });

  for (const index of toolOrder) {
    const b = toolBuilders.get(index);
    if (!b) continue;
    let input: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(b.inputJson || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        input = parsed as Record<string, unknown>;
      }
    } catch {
      input = {};
    }
    const tu = { id: b.id, name: b.name, input };
    toolUses.push(tu);
    content.push({
      type: "tool_use",
      id: tu.id,
      name: tu.name,
      input: tu.input,
    });
  }

  return { text, toolUses, content };
}

export function applySseEvent(
  parsed: Record<string, unknown>,
  state: {
    onText: (text: string) => void;
    toolBuilders: Map<number, SseToolBuilder>;
    toolOrder: number[];
  },
): void {
  if (parsed.type === "content_block_start") {
    const block = parsed.content_block as Record<string, unknown> | undefined;
    const index = typeof parsed.index === "number" ? parsed.index : -1;
    if (block?.type === "tool_use" && index >= 0) {
      const builder: SseToolBuilder = {
        index,
        id: typeof block.id === "string" ? block.id : `tool_${index}`,
        name: typeof block.name === "string" ? block.name : "unknown",
        inputJson: "",
      };
      state.toolBuilders.set(index, builder);
      state.toolOrder.push(index);
    }
    return;
  }

  if (parsed.type === "content_block_delta") {
    const delta = parsed.delta as Record<string, unknown> | undefined;
    if (!delta) return;
    if (delta.type === "text_delta" && typeof delta.text === "string") {
      state.onText(delta.text);
    } else if (
      delta.type === "input_json_delta" &&
      typeof delta.partial_json === "string"
    ) {
      const index = typeof parsed.index === "number" ? parsed.index : -1;
      const builder = state.toolBuilders.get(index);
      if (builder) builder.inputJson += delta.partial_json;
    }
  }
}
