import type { VisionMode } from "./types";

/**
 * Whether to attach a cheap composite for this turn.
 * Always / Off are host overrides. Auto trusts the context planner only —
 * no keyword heuristics on the user text.
 */
export function shouldAttachCheapComposite(args: {
  mode: VisionMode;
  /** From the AI context plan (`wantVision`). */
  plannerWantVision: boolean;
}): boolean {
  if (args.mode === "off") return false;
  if (args.mode === "always") return true;
  return args.plannerWantVision === true;
}
