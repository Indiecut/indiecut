import {
  chatProviderForModelId,
  getChatProviderId,
  type ChatProviderId,
} from "../secrets/aiSecrets";
import {
  streamMessage,
  type StreamMessageOpts,
  type StreamMessageResult,
} from "./anthropic";
import { streamOpenAIMessage } from "./openai";

export type StreamChatOpts = StreamMessageOpts & {
  /** Override active secrets provider (tests / one-off). */
  provider?: ChatProviderId;
};

/**
 * Route chat streaming to Anthropic or OpenAI from the selected model
 * (falls back to secrets `chatProviderId`). Same opts / result shape
 * for the agent loop.
 */
export async function streamChat(
  opts: StreamChatOpts,
): Promise<StreamMessageResult> {
  const provider =
    opts.provider ??
    (opts.model ? chatProviderForModelId(opts.model) : getChatProviderId());
  if (provider === "openai") {
    return streamOpenAIMessage(opts);
  }
  return streamMessage(opts);
}
