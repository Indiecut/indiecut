import { timelineDurationMs } from "../../engine/time";
import type { Clip, ClipKind, Track } from "../../project/types";
import { getEditorStore } from "../../store/editorStore";
import { streamChat } from "../providers/streamChat";
import { isClaudeModelId } from "../secrets/aiSecrets";
import { clipLabel } from "./assembleContextPack";
import type {
  ContextIntent,
  ContextPlan,
  ContextPlannerScene,
  ContextSliceId,
  ContextTargetKind,
  ContextTargetMode,
} from "./contextPlannerTypes";
import { CONTEXT_SLICES } from "./contextPlannerTypes";

const DEFAULT_SKIM_MS = 6_000;
const BROAD_SKIM_MS = 16_000;
const MAX_SKIM_MS = 24_000;

const PLANNER_SYSTEM = [
  "You are IndieCut's context planner.",
  "Given a user request and a tiny scene snapshot, choose the MINIMUM project context the editing agent needs.",
  "Reply with ONLY a JSON object — no markdown, no prose.",
  "",
  "Schema:",
  "{",
  '  "intent": "insert"|"edit"|"structure"|"inspect_local"|"inspect_broad"|"skill"|"chat"|"vision",',
  '  "target": "selection"|"playhead_kind"|"playhead_any"|"none",',
  '  "targetKind": "text"|"video"|"audio"|"image"|"caption"|"sticker"|"any"|null,',
  '  "slices": string[],',
  '  "skimWindowMs": number|null,',
  '  "wantVision": boolean,',
  '  "reason": string',
  "}",
  "",
  `Allowed slices: ${CONTEXT_SLICES.join(", ")}.`,
  "Always include session.",
  "",
  "Critical disambiguation:",
  '- "add/apply X to this/the text|title|clip" (animation, style, color, effect, motion) → intent edit, NOT insert.',
  "- Never treat descriptive words (e.g. amazing animation) as new text content to create.",
  '- Insert only when the user clearly wants a NEW clip: "add a text saying …", "insert title here", "put a sticker at the playhead".',
  "",
  "Other rules:",
  "- edit this text / make it bigger/white / animate this → intent edit; target selection if selection exists else playhead_kind (text when about text); slices [session, target].",
  "- split/trim/cut/delete/move on timeline → structure; target selection or playhead_any; slices [session, target].",
  "- what's nearby / around here → inspect_local + local_skim (skimWindowMs ~6000).",
  "- broad timeline overview → inspect_broad + local_skim (larger window).",
  "- generate image/voice/sfx/captions → skill; slices [session, skills]; wantVision only if editing a frame.",
  '- AI sticker / cutout / die-cut / transparent-background / infographic (calendar, pie chart, diagram, etc. — drawn overlay, not a bundled kinetic id) → skill image.generate with asSticker; slices [session, skills].',
  "- look/looks/frame/preview questions → vision; wantVision true; slices [session] (+ target if deixis).",
  "- Do not request skim unless needed. Prefer selection when scene.selection is non-empty and the user refers to this/that/selected.",
].join("\n");

/** Thrown when the AI context plan cannot be produced — the chat turn must fail. */
export class ContextPlannerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ContextPlannerError";
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Prefer Haiku for the planner call when the main model is Sonnet. */
export function resolvePlannerModelId(mainModelId: string): string {
  if (isClaudeModelId(mainModelId)) {
    if (mainModelId === "claude-haiku-5-5") return mainModelId;
    return "claude-haiku-5-5";
  }
  return "claude-haiku-5-5";
}

function clipOverlaps(clip: Clip, ms: number): boolean {
  return ms >= clip.startMs && ms < clip.startMs + clip.durationMs;
}

/** Clips under the playhead (all tracks), top-to-bottom order preserved. */
export function clipsAtPlayhead(
  tracks: Track[],
  playheadMs: number,
  mediaNameById?: Map<string, string>,
): ContextPlannerScene["atPlayhead"] {
  const out: ContextPlannerScene["atPlayhead"] = [];
  for (const track of tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      if (!clipOverlaps(clip, playheadMs)) continue;
      const mediaName =
        clip.mediaId && mediaNameById
          ? mediaNameById.get(clip.mediaId)
          : undefined;
      out.push({
        id: clip.id,
        kind: clip.kind,
        trackType: track.type,
        label: clipLabel(clip, mediaName),
      });
    }
  }
  return out;
}

export function buildPlannerScene(): ContextPlannerScene {
  const state = getEditorStore();
  const project = state.project;
  const mediaNameById = new Map(
    project.mediaIndex.map((m) => [m.id, m.name] as const),
  );
  const selectedIds = state.selectedClipIds.length
    ? state.selectedClipIds
    : state.selectedClipId
      ? [state.selectedClipId]
      : [];

  const selection: ContextPlannerScene["selection"] = [];
  for (const id of selectedIds) {
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === id);
      if (!clip) continue;
      const mediaName = clip.mediaId
        ? mediaNameById.get(clip.mediaId)
        : undefined;
      selection.push({
        id: clip.id,
        kind: clip.kind,
        label: clipLabel(clip, mediaName),
      });
      break;
    }
  }

  return {
    playheadMs: project.playheadMs,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationMs: timelineDurationMs(project.tracks),
    selection,
    atPlayhead: clipsAtPlayhead(
      project.tracks,
      project.playheadMs,
      mediaNameById,
    ),
  };
}

function isSlice(v: unknown): v is ContextSliceId {
  return (
    typeof v === "string" &&
    (CONTEXT_SLICES as readonly string[]).includes(v)
  );
}

function isIntent(v: unknown): v is ContextIntent {
  return (
    v === "insert" ||
    v === "edit" ||
    v === "structure" ||
    v === "inspect_local" ||
    v === "inspect_broad" ||
    v === "skill" ||
    v === "chat" ||
    v === "vision"
  );
}

function isTarget(v: unknown): v is ContextTargetMode {
  return (
    v === "selection" ||
    v === "playhead_kind" ||
    v === "playhead_any" ||
    v === "none"
  );
}

function isTargetKind(v: unknown): v is ContextTargetKind {
  return (
    v === "text" ||
    v === "video" ||
    v === "audio" ||
    v === "image" ||
    v === "caption" ||
    v === "sticker" ||
    v === "any"
  );
}

/** Extract first JSON object from a model reply. */
export function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeSlices(
  raw: unknown,
  intent: ContextIntent,
): ContextSliceId[] {
  const set = new Set<ContextSliceId>(["session"]);
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isSlice(item)) set.add(item);
    }
  }
  if (
    (intent === "edit" || intent === "structure") &&
    !set.has("target") &&
    !set.has("selection")
  ) {
    set.add("target");
  }
  if (intent === "skill") set.add("skills");
  if (intent === "inspect_local" || intent === "inspect_broad") {
    set.add("local_skim");
  }
  return [...set];
}

/** Validate / coerce planner JSON into a ContextPlan. */
export function parseContextPlan(raw: unknown): ContextPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isIntent(o.intent) || !isTarget(o.target)) return null;

  const targetKind =
    o.targetKind === null || o.targetKind === undefined
      ? null
      : isTargetKind(o.targetKind)
        ? o.targetKind
        : null;

  let skimWindowMs: number | null = null;
  if (typeof o.skimWindowMs === "number" && Number.isFinite(o.skimWindowMs)) {
    skimWindowMs = Math.min(
      MAX_SKIM_MS,
      Math.max(1_000, Math.round(o.skimWindowMs)),
    );
  }

  const slices = normalizeSlices(o.slices, o.intent);
  if (slices.includes("local_skim") && skimWindowMs == null) {
    skimWindowMs =
      o.intent === "inspect_broad" ? BROAD_SKIM_MS : DEFAULT_SKIM_MS;
  }
  if (!slices.includes("local_skim")) skimWindowMs = null;

  return {
    intent: o.intent,
    target: o.target,
    targetKind,
    slices,
    skimWindowMs,
    wantVision: o.wantVision === true,
    reason: typeof o.reason === "string" ? o.reason.slice(0, 160) : undefined,
    source: "ai",
  };
}

export type PlanContextOpts = {
  apiKey: string;
  /** Main chat model — planner may downgrade to a cheaper sibling. */
  model: string;
  userText: string;
  signal?: AbortSignal;
};

/**
 * AI context plan for this turn (cheap model). No keyword/heuristic fallback:
 * invalid or failed plans throw ContextPlannerError and the chat turn must stop.
 */
export async function planContext(
  opts: PlanContextOpts,
): Promise<ContextPlan> {
  if (opts.signal?.aborted) {
    throw new ContextPlannerError("Context planning aborted");
  }

  const userText = opts.userText.trim();
  if (!userText) {
    throw new ContextPlannerError("Empty request — nothing to plan");
  }

  const scene = buildPlannerScene();
  const plannerModel = resolvePlannerModelId(opts.model);
  const userPayload = { userText, scene };

  let replyText = "";
  try {
    const reply = await streamChat({
      apiKey: opts.apiKey,
      model: plannerModel,
      system: PLANNER_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify(userPayload),
        },
      ],
      signal: opts.signal,
    });
    replyText = reply.text;
  } catch (err) {
    if (opts.signal?.aborted) {
      throw new ContextPlannerError("Context planning aborted", { cause: err });
    }
    throw new ContextPlannerError(
      err instanceof Error
        ? `Context planning failed: ${err.message}`
        : "Context planning failed",
      { cause: err },
    );
  }

  if (opts.signal?.aborted) {
    throw new ContextPlannerError("Context planning aborted");
  }

  const parsed = parseContextPlan(extractJsonObject(replyText));
  if (!parsed) {
    throw new ContextPlannerError(
      "Context planner returned invalid plan JSON",
    );
  }

  return parsed;
}

/** Human-readable one-liner for agent progress UI. */
export function contextPlanDetail(plan: ContextPlan): string {
  const bits = [
    plan.intent,
    plan.slices.filter((s) => s !== "session").join("+") || "session-only",
  ];
  return bits.join(" · ");
}

/** Kind match: text request also accepts caption. */
export function kindMatches(
  clipKind: ClipKind,
  want: ContextTargetKind | null,
): boolean {
  if (!want || want === "any") return true;
  if (want === "text") return clipKind === "text" || clipKind === "caption";
  return clipKind === want;
}
