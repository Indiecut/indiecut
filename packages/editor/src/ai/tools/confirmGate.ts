import type { Track } from "../../project/types";
import type { StreamToolUse } from "../providers/anthropic";
import { getCapability } from "../catalog/register";
import { previewTrimDurationMs } from "../protocol/timelineEdit";
import "../catalog/domains";

export type PendingPlanStep = {
  tool: string;
  summary: string;
};

export type PendingPlan = {
  id: string;
  summary: string;
  steps: PendingPlanStep[];
  toolUses: StreamToolUse[];
  createdAt: string;
};

const LARGE_TRIM_RATIO = 0.5;
const LARGE_TRIM_ABS_MS = 10_000;

function newPlanId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function deleteClipIds(input: Record<string, unknown>): string[] {
  if (Array.isArray(input.clipIds)) {
    return input.clipIds.filter(
      (id): id is string => typeof id === "string" && !!id,
    );
  }
  if (typeof input.clipId === "string" && input.clipId) {
    return [input.clipId];
  }
  return [];
}

function isLargeTrim(beforeMs: number, afterMs: number): boolean {
  const delta = Math.abs(beforeMs - afterMs);
  if (delta > LARGE_TRIM_ABS_MS) return true;
  if (beforeMs > 0 && delta / beforeMs > LARGE_TRIM_RATIO) return true;
  return false;
}

function reviewFromDocumentPatch(
  input: Record<string, unknown>,
): PendingPlanStep[] {
  const reasons: PendingPlanStep[] = [];
  const ops = Array.isArray(input.ops) ? input.ops : [];
  for (const raw of ops) {
    if (!raw || typeof raw !== "object") continue;
    const op = raw as Record<string, unknown>;
    if (op.target === "project") {
      const path = typeof op.path === "string" ? op.path : "";
      if (
        path === "resolutionMode" ||
        path === "width" ||
        path === "height" ||
        path === "fps"
      ) {
        const cap = getCapability("project.spec");
        if (cap?.risk === "review") {
          reasons.push({
            tool: "document_patch",
            summary: `Change project.${path}`,
          });
        }
      }
    }
  }
  return reasons;
}

function reviewFromTimelineEdit(
  input: Record<string, unknown>,
  tracks: Track[],
): PendingPlanStep[] {
  const reasons: PendingPlanStep[] = [];
  const action = typeof input.action === "string" ? input.action : "";

  if (action === "delete") {
    const ids = deleteClipIds(input);
    if (ids.length > 1) {
      reasons.push({
        tool: "timeline_edit",
        summary: `Delete ${ids.length} clips`,
      });
    }
  }

  if (action === "trim") {
    const preview = previewTrimDurationMs(tracks, input);
    if (preview && isLargeTrim(preview.beforeMs, preview.afterMs)) {
      reasons.push({
        tool: "timeline_edit",
        summary: `Large trim on ${preview.clipId}: ${Math.round(preview.beforeMs)}ms → ${Math.round(preview.afterMs)}ms`,
      });
    }
  }

  return reasons;
}

/**
 * Host confirm gate driven by catalog risk + op-size heuristics.
 * Returns a PendingPlan when the batch must wait for Run plan.
 */
export function inspectConfirmGate(
  toolUses: StreamToolUse[],
  tracks: Track[],
): PendingPlan | null {
  const reasons: PendingPlanStep[] = [];

  for (const tu of toolUses) {
    if (tu.name === "timeline_edit") {
      reasons.push(...reviewFromTimelineEdit(tu.input ?? {}, tracks));
    }
    if (tu.name === "document_patch") {
      reasons.push(...reviewFromDocumentPatch(tu.input ?? {}));
    }
    if (tu.name === "skill_run") {
      reasons.push({
        tool: "skill_run",
        summary: `Run skill ${String((tu.input ?? {}).skill ?? "unknown")}`,
      });
    }
  }

  // Skills are spend/network aware but do not always need Confirm —
  // only gate when explicitly marked and multi-destructive. Drop skill-only
  // single generates from the hard confirm gate (Action Card still covers restore).
  const filtered = reasons.filter((r) => r.tool !== "skill_run");

  if (filtered.length === 0) return null;

  const summary =
    filtered.length === 1
      ? filtered[0]!.summary
      : filtered.map((r) => r.summary).join("; ");

  return {
    id: newPlanId(),
    summary: `Confirm: ${summary}`,
    steps: filtered,
    toolUses: toolUses.map((tu) => ({
      id: tu.id,
      name: tu.name,
      input: tu.input ?? {},
    })),
    createdAt: new Date().toISOString(),
  };
}
