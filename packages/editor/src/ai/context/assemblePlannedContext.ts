import { timelineDurationMs } from "../../engine/time";
import type { ClipKind } from "../../project/types";
import { findClip, getEditorStore } from "../../store/editorStore";
import {
  listAvailableSkills,
} from "../catalog";
import type { ChatMessage } from "../persistence/chatTranscript";
import {
  hasElevenLabsSfx,
  hasElevenLabsVoice,
  hasGeminiKey,
} from "../secrets/aiSecrets";
import {
  buildTimelineSkim,
  summarizeClip,
} from "./assembleContextPack";
import { buildChatTail } from "./chatTail";
import {
  kindMatches,
} from "./contextPlanner";
import type {
  ContextPlan,
  ContextPlannerScene,
  PlannedContext,
} from "./contextPlannerTypes";
import type { AiClipSummary, AiSkillId } from "./types";
import "../catalog/domains";

function selectedClipIds(): string[] {
  const state = getEditorStore();
  if (state.selectedClipIds.length) return state.selectedClipIds;
  if (state.selectedClipId) return [state.selectedClipId];
  return [];
}

function summarizeIds(ids: string[]): AiClipSummary[] {
  const state = getEditorStore();
  const mediaNameById = new Map(
    state.project.mediaIndex.map((m) => [m.id, m.name] as const),
  );
  const out: AiClipSummary[] = [];
  for (const id of ids) {
    const found = findClip(state.project.tracks, id);
    if (!found) continue;
    const mediaName = found.clip.mediaId
      ? mediaNameById.get(found.clip.mediaId)
      : undefined;
    out.push(summarizeClip(found.track, found.clip, mediaName));
  }
  return out;
}

function clipsOverlappingPlayhead(
  playheadMs: number,
  kind: ContextPlan["targetKind"],
): string[] {
  const state = getEditorStore();
  const ids: string[] = [];
  for (const track of state.project.tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      const end = clip.startMs + clip.durationMs;
      if (playheadMs < clip.startMs || playheadMs >= end) continue;
      if (!kindMatches(clip.kind, kind)) continue;
      ids.push(clip.id);
    }
  }
  return ids;
}

/**
 * Resolve which clip ids the plan's target mode points at.
 * selection → selected; playhead_kind → matching kinds at playhead;
 * playhead_any → any clip at playhead; none → [].
 */
export function resolveTargetClipIds(
  plan: ContextPlan,
  playheadMs: number,
): string[] {
  if (plan.target === "none") return [];
  if (plan.target === "selection") {
    const sel = selectedClipIds();
    if (sel.length) return sel;
    // Soft fallback: playhead match when selection empty.
    return clipsOverlappingPlayhead(playheadMs, plan.targetKind ?? "any");
  }
  if (plan.target === "playhead_kind") {
    const kind = plan.targetKind ?? "any";
    const matched = clipsOverlappingPlayhead(playheadMs, kind);
    if (matched.length) return matched;
    return clipsOverlappingPlayhead(playheadMs, "any");
  }
  // playhead_any
  return clipsOverlappingPlayhead(playheadMs, "any");
}

export type AssemblePlannedContextOpts = {
  plan: ContextPlan;
  messages: ChatMessage[];
  /** Optional prebuilt scene (tests). */
  scene?: ContextPlannerScene;
};

/** Build lean PlannedContext from a ContextPlan + live editor store. */
export function assemblePlannedContext(
  opts: AssemblePlannedContextOpts,
): PlannedContext {
  const state = getEditorStore();
  const project = state.project;
  const playheadMs = opts.scene?.playheadMs ?? project.playheadMs;
  const plan = opts.plan;
  const sliceSet = new Set(plan.slices);

  const session = {
    playheadMs,
    width: opts.scene?.width ?? project.width,
    height: opts.scene?.height ?? project.height,
    fps: opts.scene?.fps ?? project.fps,
    durationMs: opts.scene?.durationMs ?? timelineDurationMs(project.tracks),
    title: project.title,
  };

  const selectionIds = selectedClipIds();
  const selection =
    sliceSet.has("selection") || sliceSet.has("target")
      ? summarizeIds(selectionIds)
      : [];

  let targets: AiClipSummary[] = [];
  if (sliceSet.has("target") || sliceSet.has("selection")) {
    const targetIds = resolveTargetClipIds(plan, playheadMs);
    targets = summarizeIds(targetIds);
    // If plan asked for selection slice explicitly, keep selection list too.
    if (!sliceSet.has("selection") && plan.target === "selection") {
      // targets already are selection
    }
  }

  let timelineSkim: PlannedContext["timelineSkim"] = null;
  if (sliceSet.has("local_skim")) {
    const mediaNameById = new Map(
      project.mediaIndex.map((m) => [m.id, m.name] as const),
    );
    const selectedSet = new Set(selectionIds);
    timelineSkim = buildTimelineSkim({
      tracks: project.tracks,
      centerMs: playheadMs,
      windowMs: plan.skimWindowMs ?? 6_000,
      selectedIds: selectedSet,
      mediaNameById,
    });
  }

  let availableSkills: AiSkillId[] | null = null;
  if (sliceSet.has("skills")) {
    const catalogOpts = {
      imageGemini: hasGeminiKey(),
      voiceElevenlabs: hasElevenLabsVoice(),
      sfxElevenlabs: hasElevenLabsSfx(),
    };
    availableSkills = [
      "timeline",
      ...listAvailableSkills(catalogOpts),
    ];
  }

  let chatTail: PlannedContext["chatTail"] = null;
  if (sliceSet.has("chat_tail")) {
    chatTail = buildChatTail(opts.messages);
  }

  return {
    plan,
    session,
    targets,
    selection: sliceSet.has("selection") ? selection : [],
    timelineSkim,
    availableSkills,
    chatTail,
  };
}

function formatClipLine(c: AiClipSummary): string {
  const label =
    c.text?.content?.trim() ||
    c.mediaName ||
    c.stickerId ||
    c.kind;
  const lines = [
    `- id=${c.id} kind=${c.kind} track=${c.trackId} ${Math.round(c.startMs)}–${Math.round(c.startMs + c.durationMs)}ms · ${JSON.stringify(label).slice(0, 60)}`,
  ];
  if (c.text) {
    const t = c.text;
    lines.push(
      `  text: fontSize=${t.fontSize ?? "?"} color=${t.color ?? "?"} align=${t.align ?? "?"}${t.fontFamily ? ` font=${t.fontFamily}` : ""}`,
    );
  }
  if (c.transform) {
    const tr = c.transform;
    lines.push(
      `  transform: x=${tr.x} y=${tr.y} scaleX=${tr.scaleX} scaleY=${tr.scaleY} rotation=${tr.rotation}`,
    );
  }
  if (c.opacity != null) lines.push(`  opacity: ${c.opacity}`);
  if (c.keyedPaths?.length) {
    lines.push(`  keyed: ${c.keyedPaths.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Serialize planned context for the editing model — prose-first, tiny.
 * Format for Claude (and any future chat models).
 */
export function formatPlannedContextForPrompt(ctx: PlannedContext): string {
  const { plan, session } = ctx;
  const lines: string[] = [
    "Curated IndieCut context for this turn (host-planned; trust over guesses).",
    `Intent: ${plan.intent} · target mode: ${plan.target}${plan.targetKind ? ` (${plan.targetKind})` : ""}`,
    `Session: playhead ${Math.round(session.playheadMs)}ms · canvas ${session.width}×${session.height} · ${session.fps}fps · duration ${Math.round(session.durationMs)}ms`,
  ];

  if (ctx.targets.length) {
    lines.push("", "Target clip(s):");
    for (const c of ctx.targets) lines.push(formatClipLine(c));
  } else if (plan.target !== "none") {
    lines.push(
      "",
      "Target clip(s): none resolved — ask the user or use inspect/timeline_edit insert.",
    );
  }

  if (ctx.selection.length && plan.target !== "selection") {
    lines.push("", "Selection:");
    for (const c of ctx.selection) lines.push(formatClipLine(c));
  }

  if (ctx.timelineSkim) {
    lines.push(
      "",
      `Timeline skim (±${plan.skimWindowMs ?? 6000}ms around playhead):`,
      "```json",
      JSON.stringify(ctx.timelineSkim),
      "```",
    );
  }

  if (ctx.availableSkills) {
    lines.push("", `Available skills: ${ctx.availableSkills.join(", ")}`);
  }

  if (ctx.chatTail?.length) {
    lines.push(
      "",
      "Recent chat:",
      ...ctx.chatTail.map((t) => `- ${t.role}: ${t.summary}`),
    );
  }

  lines.push(
    "",
    "Use inspect only if this is insufficient. Prefer these clip ids; do not invent ids.",
  );

  return lines.join("\n");
}

/** Clip kinds helper for tests / UI. */
export function isTextLikeKind(kind: ClipKind): boolean {
  return kind === "text" || kind === "caption";
}
