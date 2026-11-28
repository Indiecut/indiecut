import {
  streamMessage,
  type StreamMessageOpts,
  type StreamMessageResult,
} from "./anthropic";

/**
 * Stream chat via Anthropic (Claude). Same opts / result shape for the agent loop.
 */
export async function streamChat(
  opts: StreamMessageOpts,
): Promise<StreamMessageResult> {
  return streamMessage(opts);
}
