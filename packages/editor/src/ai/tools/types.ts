import type { MutationBatch } from "./mutationBatch";

export type ToolResult = {
  ok: boolean;
  /** Short human summary for Action Cards / chatTail. */
  summary: string;
  /** JSON-serializable payload returned to the model. */
  data: unknown;
  /** True if this tool mutated tracks / project (via the shared batch). */
  mutated?: boolean;
  /**
   * Optional rich content for Anthropic tool_result (e.g. capture frame image).
   * When set, the agent loop prefers this over stringifying `data` alone.
   */
  contentBlocks?: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source: {
          type: "base64";
          media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
          data: string;
        };
      }
  >;
};

export type ToolExecContext = {
  /** Shared mutation batch for write tools in one agent step. */
  batch: MutationBatch;
  signal?: AbortSignal;
};

export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolExecContext,
) => ToolResult | Promise<ToolResult>;

export type RegisteredTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: ToolHandler;
  /** Write tools participate in the snapshot/commit batch. */
  mutates: boolean;
};
