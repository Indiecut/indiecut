import { getPlatform } from "@indiecut/platform";
import type {
  AiTokenUsage,
  AnthropicChatMessage,
  AnthropicContentBlock,
  AnthropicImageBlock,
  AnthropicTextBlock,
  AnthropicTool,
  AnthropicToolResultBlock,
  StreamMessageOpts,
  StreamMessageResult,
  StreamToolUse,
} from "./anthropic";

type OpenAiTextPart = { type: "text"; text: string };
type OpenAiImagePart = {
  type: "image_url";
  image_url: { url: string };
};

type OpenAiMessageContent = string | Array<OpenAiTextPart | OpenAiImagePart>;

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAiChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: OpenAiMessageContent }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAiToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type ToolCallBuilder = {
  index: number;
  id: string;
  name: string;
  arguments: string;
};

/**
 * Stream an OpenAI Chat Completions reply (text + optional tool_calls).
 * Accepts the same Anthropic-shaped opts as streamMessage; converts wire format
 * at the boundary so the agent loop stays provider-agnostic.
 */
export async function streamOpenAIMessage(
  opts: StreamMessageOpts,
): Promise<StreamMessageResult> {
  const bridge = getPlatform();
  return bridge?.ai?.streamOpenAI
    ? streamViaBridge(opts)
    : streamViaFetch(opts);
}

export function anthropicToolsToOpenAI(
  tools: AnthropicTool[] | undefined,
): OpenAiTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/** Convert Anthropic Messages API turns → OpenAI Chat Completions messages. */
export function anthropicMessagesToOpenAI(
  system: string,
  messages: AnthropicChatMessage[],
): OpenAiChatMessage[] {
  const out: OpenAiChatMessage[] = [];
  if (system.trim()) {
    out.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      out.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      out.push(assistantBlocksToOpenAI(msg.content));
      continue;
    }

    // user — may include tool_result blocks (OpenAI wants separate tool messages)
    const toolResults = msg.content.filter(
      (b): b is AnthropicToolResultBlock => b.type === "tool_result",
    );
    const other = msg.content.filter((b) => b.type !== "tool_result");

    for (const tr of toolResults) {
      out.push({
        role: "tool",
        tool_call_id: tr.tool_use_id,
        content: toolResultToString(tr),
      });
    }

    const visionParts: Array<OpenAiTextPart | OpenAiImagePart> = [];
    for (const tr of toolResults) {
      if (!Array.isArray(tr.content)) continue;
      for (const part of tr.content) {
        if (part.type === "image") {
          visionParts.push(imageBlockToOpenAI(part));
        } else if (part.type === "text" && part.text.trim()) {
          visionParts.push({ type: "text", text: part.text });
        }
      }
    }

    const userParts = blocksToOpenAIParts(other);
    const combined = [...visionParts, ...userParts];
    if (combined.length === 0) {
      if (toolResults.length === 0) {
        out.push({ role: "user", content: "" });
      }
      continue;
    }
    if (combined.length === 1 && combined[0]!.type === "text") {
      out.push({ role: "user", content: combined[0]!.text });
    } else {
      out.push({ role: "user", content: combined });
    }
  }

  return out;
}

function assistantBlocksToOpenAI(
  blocks: AnthropicContentBlock[],
): OpenAiChatMessage {
  const textParts: string[] = [];
  const toolCalls: OpenAiToolCall[] = [];
  for (const b of blocks) {
    if (b.type === "text") textParts.push(b.text);
    else if (b.type === "tool_use") {
      toolCalls.push({
        id: b.id,
        type: "function",
        function: {
          name: b.name,
          arguments: JSON.stringify(b.input ?? {}),
        },
      });
    }
  }
  const text = textParts.join("") || null;
  if (toolCalls.length > 0) {
    return { role: "assistant", content: text, tool_calls: toolCalls };
  }
  return { role: "assistant", content: text ?? "" };
}

function blocksToOpenAIParts(
  blocks: AnthropicContentBlock[],
): Array<OpenAiTextPart | OpenAiImagePart> {
  const parts: Array<OpenAiTextPart | OpenAiImagePart> = [];
  for (const b of blocks) {
    if (b.type === "text") {
      if (b.text) parts.push({ type: "text", text: b.text });
    } else if (b.type === "image") {
      parts.push(imageBlockToOpenAI(b));
    }
  }
  return parts;
}

function imageBlockToOpenAI(block: AnthropicImageBlock): OpenAiImagePart {
  return {
    type: "image_url",
    image_url: {
      url: `data:${block.source.media_type};base64,${block.source.data}`,
    },
  };
}

function toolResultToString(tr: AnthropicToolResultBlock): string {
  if (typeof tr.content === "string") return tr.content;
  const texts = tr.content
    .filter((c): c is AnthropicTextBlock => c.type === "text")
    .map((c) => c.text);
  const imageCount = tr.content.filter((c) => c.type === "image").length;
  const parts = [...texts];
  if (imageCount > 0) {
    parts.push(
      `[${imageCount} capture image${imageCount === 1 ? "" : "s"} attached as follow-up]`,
    );
  }
  if (tr.is_error) {
    return parts.length > 0
      ? `ERROR: ${parts.join("\n")}`
      : "ERROR: tool failed";
  }
  return parts.join("\n") || "{}";
}

export type OpenAiReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * Map UI allowlist ids → Chat Completions model + optional reasoning_effort.
 * Luna Max = `gpt-6-luna` + highest Chat Completions effort (`xhigh`).
 * Note: effort `max` is Responses-only; Chat Completions allows none…xhigh.
 * Function tools require effort `none` on this endpoint.
 */
export function resolveOpenAiApiModel(
  modelId: string,
  hasTools: boolean,
): { model: string; reasoningEffort?: OpenAiReasoningEffort } {
  if (modelId === "gpt-6-luna-max" || modelId === "gpt-6-luna") {
    return {
      model: "gpt-6-luna",
      // Must be explicit: omitting effort uses the API default (medium).
      reasoningEffort: hasTools ? "none" : "xhigh",
    };
  }
  return { model: modelId };
}

function buildRequestBody(opts: StreamMessageOpts) {
  const messages = anthropicMessagesToOpenAI(opts.system, opts.messages);
  const tools = anthropicToolsToOpenAI(opts.tools);
  const hasTools = Boolean(tools && tools.length > 0);
  const resolved = resolveOpenAiApiModel(opts.model, hasTools);
  const body: Record<string, unknown> = {
    model: resolved.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (resolved.reasoningEffort) {
    body.reasoning_effort = resolved.reasoningEffort;
  }
  if (hasTools && tools) {
    body.tools = tools;
    // Belt-and-suspenders for Luna: tools always require effort none.
    if (resolved.model === "gpt-6-luna") {
      body.reasoning_effort = "none";
    }
  }
  return body;
}

async function streamViaBridge(
  opts: StreamMessageOpts,
): Promise<StreamMessageResult> {
  const bridge = getPlatform();
  if (!bridge?.ai?.streamOpenAI || !bridge.ai.onOpenAIEvent) {
    throw new Error("OpenAI bridge unavailable");
  }

  const streamId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `stream_${Date.now().toString(36)}`;

  const textParts: string[] = [];
  const toolUses: StreamToolUse[] = [];
  const content: AnthropicContentBlock[] = [];
  let usage: AiTokenUsage | undefined;

  const body = buildRequestBody(opts);

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

    const ai = bridge.ai!;
    const onAbort = () => {
      void ai.abortOpenAI?.(streamId).finally(() => finish());
    };

    const unsub = ai.onOpenAIEvent!((event) => {
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
      } else if (event.type === "usage" && event.usage) {
        usage = mergeOpenAiUsage(usage, event.usage);
      } else if (event.type === "error") {
        finish(new Error(event.error || "OpenAI stream error"));
      } else if (event.type === "done") {
        if (event.usage) usage = mergeOpenAiUsage(usage, event.usage);
        finish();
      }
    });

    if (opts.signal?.aborted) {
      onAbort();
      return;
    }
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const reasoningEffort =
      typeof body.reasoning_effort === "string"
        ? (body.reasoning_effort as OpenAiReasoningEffort)
        : undefined;

    void ai
      .streamOpenAI!({
        streamId,
        apiKey: opts.apiKey,
        model: typeof body.model === "string" ? body.model : opts.model,
        messages: body.messages as unknown[],
        tools: Array.isArray(body.tools) ? (body.tools as unknown[]) : undefined,
        reasoningEffort,
      })
      .catch((err) => {
        finish(err instanceof Error ? err : new Error(String(err)));
      });
  });

  const text = textParts.join("");
  if (text) {
    content.unshift({ type: "text", text });
  }

  return { text, toolUses, content, usage };
}

async function streamViaFetch(
  opts: StreamMessageOpts,
): Promise<StreamMessageResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
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
      `OpenAI HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body from OpenAI");
  }

  return consumeOpenAiSse(response.body, opts.onDelta, opts.signal);
}

export function mergeOpenAiUsage(
  into: AiTokenUsage | undefined,
  raw: unknown,
): AiTokenUsage | undefined {
  if (!raw || typeof raw !== "object") return into;
  const u = raw as Record<string, unknown>;
  const next: AiTokenUsage = { ...(into ?? {}) };
  // OpenAI: prompt_tokens / completion_tokens; also accept Anthropic-shaped
  if (typeof u.prompt_tokens === "number") next.input_tokens = u.prompt_tokens;
  if (typeof u.completion_tokens === "number") {
    next.output_tokens = u.completion_tokens;
  }
  if (typeof u.input_tokens === "number") next.input_tokens = u.input_tokens;
  if (typeof u.output_tokens === "number") next.output_tokens = u.output_tokens;
  return next;
}

/** Shared SSE consumer for OpenAI Chat Completions streaming. */
export async function consumeOpenAiSse(
  body: ReadableStream<Uint8Array>,
  onDelta?: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamMessageResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const textParts: string[] = [];
  const toolBuilders = new Map<number, ToolCallBuilder>();
  const toolOrder: number[] = [];
  let usage: AiTokenUsage | undefined;

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
        if (parsed.error) {
          const errObj = parsed.error as { message?: string };
          throw new Error(errObj?.message || "OpenAI stream error");
        }
        usage = applyOpenAiSseChunk(parsed, {
          onText: (t) => {
            textParts.push(t);
            onDelta?.(t);
          },
          toolBuilders,
          toolOrder,
          usage,
        });
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
      const parsed = JSON.parse(b.arguments || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        input = parsed as Record<string, unknown>;
      }
    } catch {
      input = {};
    }
    const tu = {
      id: b.id || `call_${index}`,
      name: b.name || "unknown",
      input,
    };
    toolUses.push(tu);
    content.push({
      type: "tool_use",
      id: tu.id,
      name: tu.name,
      input: tu.input,
    });
  }

  return { text, toolUses, content, usage };
}

export function applyOpenAiSseChunk(
  parsed: Record<string, unknown>,
  state: {
    onText: (text: string) => void;
    toolBuilders: Map<number, ToolCallBuilder>;
    toolOrder: number[];
    usage?: AiTokenUsage;
  },
): AiTokenUsage | undefined {
  let usage = mergeOpenAiUsage(state.usage, parsed.usage);

  const choices = parsed.choices;
  if (!Array.isArray(choices) || choices.length === 0) return usage;

  const choice = choices[0] as Record<string, unknown>;
  const delta = choice.delta as Record<string, unknown> | undefined;
  if (!delta) return usage;

  if (typeof delta.content === "string" && delta.content) {
    state.onText(delta.content);
  }

  const toolCalls = delta.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const raw of toolCalls) {
      if (!raw || typeof raw !== "object") continue;
      const tc = raw as Record<string, unknown>;
      const index = typeof tc.index === "number" ? tc.index : 0;
      let builder = state.toolBuilders.get(index);
      if (!builder) {
        builder = {
          index,
          id: typeof tc.id === "string" ? tc.id : "",
          name: "",
          arguments: "",
        };
        state.toolBuilders.set(index, builder);
        state.toolOrder.push(index);
      }
      if (typeof tc.id === "string" && tc.id) builder.id = tc.id;
      const fn = tc.function as Record<string, unknown> | undefined;
      if (fn) {
        if (typeof fn.name === "string" && fn.name) builder.name = fn.name;
        if (typeof fn.arguments === "string") {
          builder.arguments += fn.arguments;
        }
      }
    }
  }

  return usage;
}
