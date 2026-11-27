import type { ClipKind } from "../../project/types";
import type {
  AiChatTurnSummary,
  AiClipSummary,
  AiSkillId,
  AiTrackSkim,
} from "./types";

/** Context slices the host may attach for one turn. */
export const CONTEXT_SLICES = [
  "session",
  "target",
  "selection",
  "local_skim",
  "skills",
  "chat_tail",
] as const;

export type ContextSliceId = (typeof CONTEXT_SLICES)[number];

export type ContextIntent =
  | "insert"
  | "edit"
  | "structure"
  | "inspect_local"
  | "inspect_broad"
  | "skill"
  | "chat"
  | "vision";

export type ContextTargetMode =
  | "selection"
  | "playhead_kind"
  | "playhead_any"
  | "none";

export type ContextTargetKind = ClipKind | "any";

/** Structured plan from the AI context planner (no keyword heuristics). */
export type ContextPlan = {
  intent: ContextIntent;
  target: ContextTargetMode;
  /** When target is playhead_kind, prefer this clip kind (text includes caption). */
  targetKind: ContextTargetKind | null;
  slices: ContextSliceId[];
  /** Skim half-window around playhead when local_skim is requested. */
  skimWindowMs: number | null;
  wantVision: boolean;
  /** Short host note for UI / debugging. */
  reason?: string;
  /** Always AI — failed plans throw instead of heuristic fallback. */
  source: "ai";
};

/** Tiny scene facts sent to the planner model (not the editing agent). */
export type ContextPlannerScene = {
  playheadMs: number;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  selection: Array<{
    id: string;
    kind: ClipKind;
    label?: string;
  }>;
  atPlayhead: Array<{
    id: string;
    kind: ClipKind;
    trackType: string;
    label?: string;
  }>;
};

/** Lean context assembled from a plan for the editing model. */
export type PlannedContext = {
  plan: ContextPlan;
  session: {
    playheadMs: number;
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    title: string;
  };
  targets: AiClipSummary[];
  selection: AiClipSummary[];
  timelineSkim: AiTrackSkim[] | null;
  availableSkills: AiSkillId[] | null;
  chatTail: AiChatTurnSummary[] | null;
};
