import {
  executeMediaCaptureFrame,
  executeStageCaptureFrame,
} from "../tools/captureTools";
import type { ToolResult } from "../tools/types";

export async function executeStageCapture(
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const mode = typeof input.mode === "string" ? input.mode : "composite";
  if (mode === "media") {
    return executeMediaCaptureFrame(input, signal);
  }
  return executeStageCaptureFrame(input, signal);
}
