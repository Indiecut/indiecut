import {
  assembleContextPack,
  formatContextPackForPrompt,
} from "../context/assembleContextPack";
import { captureCheapComposite } from "../context/captureCheapComposite";
import type {
  ChatInteractionMode,
  CheapCompositeAttachment,
  UserReferenceAttachment,
  VisionMode,
} from "../context/types";
import { shouldAttachCheapComposite } from "../context/visionPolicy";
import type {
  ChatActionAffectedItem,
  ChatActionCard,
  ChatAgentStep,
  ChatAgentStepStatus,
  ChatMessage,
  ChatPendingPlan,
} from "../persistence/chatTranscript";
import type {
  AnthropicChatMessage,
  AnthropicContentBlock,
  AnthropicImageBlock,
  StreamToolUse,
} from "../providers/anthropic";
import { streamChat } from "../providers/streamChat";
import { findClip, getEditorStore } from "../../store/editorStore";
import type { Clip, Track } from "../../project/types";
import {
  findTool,
  getAnthropicTools,
  type ToolResult,
} from "../protocol/tools";
import {
  afterSnapshotFromBatch,
  commitMutationBatch,
  createMutationBatch,
  type ProjectEditSnapshot,
} from "../tools/mutationBatch";
import {
  createCheckpointId,
  writeCheckpoint,
  type ProjectCheckpointV2,
} from "../tools/snapshots";
import {
  inspectConfirmGate,
  type PendingPlan,
} from "../tools/confirmGate";
import { writeActionThumb } from "../tools/actionThumbs";
import {
  hasElevenLabsSfx,
  hasElevenLabsVoice,
  hasGeminiKey,
} from "../secrets/aiSecrets";
import { progressTitleFromText } from "./progressTitle";
import {
  buildAskSystemPrompt,
  buildSystemPrompt,
  protocolToolLabel,
} from "./systemPrompt";

const MAX_TOOL_ROUNDS = 8;

export {
  buildAskSystemPrompt,
  buildSystemPrompt,
} from "./systemPrompt";

export type AgentProgressEvent =
  | {
      type: "step";
      step: ChatAgentStep;
    }
  | {
      type: "step_update";
      id: string;
      status: ChatAgentStepStatus;
      detail?: string;
      label?: string;
    };

export type RunChatTurnOpts = {
  apiKey: string;
  model: string;
  historyMessages: ChatMessage[];
  userText: string;
  /** Downscaled user reference images for this turn only. */
  userImages?: UserReferenceAttachment[];
  projectPath: string | null;
  visionMode: VisionMode;
  mode?: ChatInteractionMode;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onProgress?: (event: AgentProgressEvent) => void;
  onActionCard?: (card: ChatActionCard) => void;
  onPendingPlan?: (plan: ChatPendingPlan) => void;
};

export type ExecuteConfirmedPlanOpts = {
  apiKey: string;
  model: string;
  projectPath: string | null;
  pendingPlan: ChatPendingPlan;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onProgress?: (event: AgentProgressEvent) => void;
  onActionCard?: (card: ChatActionCard) => void;
};

function newStepId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

type ProgressCb = RunChatTurnOpts["onProgress"];

function emitStep(
  onProgress: ProgressCb,
  partial: Omit<ChatAgentStep, "id" | "at"> & { id?: string },
): string {
  const id = partial.id ?? newStepId();
  onProgress?.({
    type: "step",
    step: {
      id,
      kind: partial.kind,
      label: partial.label,
      detail: partial.detail,
      status: partial.status,
      at: new Date().toISOString(),
    },
  });
  return id;
}

function updateStep(
  onProgress: ProgressCb,
  id: string,
  status: ChatAgentStepStatus,
  detail?: string,
  label?: string,
): void {
  onProgress?.({ type: "step_update", id, status, detail, label });
}

/** Stream deltas into the message bubble and keep the live progress title AI-authored. */
function bindProgressDelta(
  progress: ProgressCb,
  stepId: string,
  onDelta: (text: string) => void,
): {
  onDelta: (chunk: string) => void;
  getTitle: () => string | null;
} {
  let accumulated = "";
  let lastTitle: string | null = null;
  return {
    onDelta: (chunk: string) => {
      onDelta(chunk);
      if (!chunk) return;
      accumulated += chunk;
      const next = progressTitleFromText(accumulated);
      if (!next || next === lastTitle) return;
      lastTitle = next;
      updateStep(progress, stepId, "running", undefined, next);
    },
    getTitle: () => lastTitle,
  };
}

export type RunChatTurnResult = {
  text: string;
  actionCard?: ChatActionCard;
  pendingPlan?: ChatPendingPlan;
};

function historyToApiMessages(
  history: ChatMessage[],
): AnthropicChatMessage[] {
  const recent = history.slice(-6);
  return recent.map((m) => {
    let content = m.content;
    // Past reference images are summarized only — bytes are not resent.
    if (m.images && m.images.length > 0) {
      const note =
        m.images.length === 1
          ? "[1 reference image was attached on this turn]"
          : `[${m.images.length} reference images were attached on this turn]`;
      content = content ? `${content}\n${note}` : note;
    }
    if (m.actionCard) {
      content = content
        ? `${content}\n[Action Card: ${m.actionCard.summary}]`
        : `[Action Card: ${m.actionCard.summary}]`;
      if (m.actionCard.detail) {
        content += `\n[${m.actionCard.detail}]`;
      }
      if (m.actionCard.restoredAt) {
        content += `\n[user restored checkpoint ${m.actionCard.checkpointId}]`;
      }
    }
    if (m.pendingPlan && !m.pendingPlan.cancelledAt) {
      content = content
        ? `${content}\n[Pending plan awaiting confirm: ${m.pendingPlan.summary}]`
        : `[Pending plan awaiting confirm: ${m.pendingPlan.summary}]`;
    }
    return { role: m.role, content };
  });
}

function imageBlockFromAttachment(
  att: CheapCompositeAttachment | UserReferenceAttachment,
): AnthropicImageBlock {
  const media =
    att.mimeType === "image/png"
      ? "image/png"
      : att.mimeType === "image/webp"
        ? "image/webp"
        : "image/jpeg";
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: media,
      data: att.base64,
    },
  };
}

function toolResultBlock(
  toolUseId: string,
  result: ToolResult,
): AnthropicContentBlock {
  if (result.contentBlocks && result.contentBlocks.length > 0) {
    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: result.contentBlocks,
      is_error: !result.ok,
    };
  }
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: JSON.stringify(result.data),
    is_error: !result.ok,
  };
}

function contentHasImage(
  content: string | AnthropicContentBlock[],
): boolean {
  if (typeof content === "string") return false;
  return content.some((b) => {
    if (b.type === "image") return true;
    if (b.type === "tool_result" && Array.isArray(b.content)) {
      return b.content.some((c) => c.type === "image");
    }
    return false;
  });
}

/**
 * Drop prior vision image bytes from the in-turn message list so later
 * API rounds do not re-bill old captures. Keeps text / JSON summaries.
 */
function stripPriorVisionImages(
  messages: AnthropicChatMessage[],
): void {
  for (const msg of messages) {
    if (typeof msg.content === "string") continue;
    const next: AnthropicContentBlock[] = [];
    for (const block of msg.content) {
      if (block.type === "image") {
        next.push({
          type: "text",
          text: "[prior vision frame omitted to save tokens]",
        });
        continue;
      }
      if (block.type === "tool_result" && Array.isArray(block.content)) {
        const filtered = block.content.flatMap((c) => {
          if (c.type !== "image") return [c];
          return [
            {
              type: "text" as const,
              text: "[prior capture image omitted to save tokens]",
            },
          ];
        });
        next.push({ ...block, content: filtered });
        continue;
      }
      next.push(block);
    }
    msg.content = next;
  }
}

type BatchThumb = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  detail?: string;
};

function clipDisplayName(
  clip: Clip,
  mediaNameById?: Map<string, string>,
): string {
  if (clip.kind === "text" && clip.text?.content) {
    const t = clip.text.content.trim();
    return t.length > 40 ? `${t.slice(0, 37)}…` : t || "text";
  }
  if (clip.stickerId) return `sticker:${clip.stickerId}`;
  if (clip.mediaId) {
    const mediaName = mediaNameById?.get(clip.mediaId)?.trim();
    if (mediaName) return mediaName;
    return clip.mediaId;
  }
  return clip.kind;
}

function resolveAffectedClipName(
  clipId: string,
  tracks: Track[] | undefined,
  mediaNameById?: Map<string, string>,
): string {
  if (!tracks?.length) return clipId;
  const found = findClip(tracks, clipId);
  if (!found) return clipId;
  return clipDisplayName(found.clip, mediaNameById);
}

function stripClipIdSuffix(summary: string, clipId: string): string {
  const suffix = ` on ${clipId}`;
  return summary.endsWith(suffix)
    ? summary.slice(0, -suffix.length)
    : summary;
}

export function collectAffectedItems(
  results: Array<{ result: ToolResult }>,
  opts?: {
    tracks?: Track[];
    beforeTracks?: Track[];
    mediaNameById?: Map<string, string>;
  },
): ChatActionAffectedItem[] {
  const items: ChatActionAffectedItem[] = [];
  const seen = new Set<string>();

  for (const { result } of results) {
    if (!result.ok || !result.mutated) continue;
    if (!result.data || typeof result.data !== "object") continue;
    const data = result.data as Record<string, unknown>;
    const trackId =
      typeof data.trackId === "string" && data.trackId
        ? data.trackId
        : undefined;

    const clipIds: string[] = [];
    if (typeof data.clipId === "string" && data.clipId) {
      clipIds.push(data.clipId);
    }
    if (Array.isArray(data.clipIds)) {
      for (const id of data.clipIds) {
        if (typeof id === "string" && id) clipIds.push(id);
      }
    }
    if (typeof data.rightClipId === "string" && data.rightClipId) {
      clipIds.push(data.rightClipId);
    }
    // Nested document_patch results
    if (Array.isArray(data.results)) {
      for (const nested of data.results) {
        if (!nested || typeof nested !== "object") continue;
        const nd = (nested as { data?: Record<string, unknown> }).data;
        if (nd && typeof nd.clipId === "string") clipIds.push(nd.clipId);
      }
    }

    const uniqueIds = [...new Set(clipIds)];
    for (const clipId of uniqueIds) {
      const key = `${clipId}\0${result.summary}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const base = stripClipIdSuffix(result.summary, clipId);
      let name = resolveAffectedClipName(
        clipId,
        opts?.tracks,
        opts?.mediaNameById,
      );
      if (name === clipId) {
        name = resolveAffectedClipName(
          clipId,
          opts?.beforeTracks,
          opts?.mediaNameById,
        );
      }
      items.push({
        clipId,
        trackId,
        label: `${base} on ${name}`,
      });
    }
  }

  return items;
}

async function executeToolBatch(
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  signal?: AbortSignal,
  opts?: { skipConfirmGate?: boolean },
): Promise<{
  results: Array<{ toolUseId: string; result: ToolResult }>;
  mutated: boolean;
  before: ProjectEditSnapshot | null;
  after: ProjectEditSnapshot | null;
  summary: string;
  pendingPlan: PendingPlan | null;
  resultThumb: BatchThumb | null;
  affected: ChatActionAffectedItem[];
}> {
  if (!opts?.skipConfirmGate) {
    const gated = inspectConfirmGate(
      toolUses as StreamToolUse[],
      getEditorStore().project.tracks,
    );
    if (gated) {
      return {
        results: toolUses.map((tu) => ({
          toolUseId: tu.id,
          result: {
            ok: false,
            summary: "Waiting for user Confirm",
            data: {
              error: "needs_confirm",
              planId: gated.id,
              summary: gated.summary,
            },
          },
        })),
        mutated: false,
        before: null,
        after: null,
        summary: gated.summary,
        pendingPlan: gated,
        resultThumb: null,
        affected: [],
      };
    }
  }

  const batch = createMutationBatch();
  const before = structuredClone(batch.before);
  const results: Array<{ toolUseId: string; result: ToolResult }> = [];

  for (const tu of toolUses) {
    if (signal?.aborted) break;
    const tool = findTool(tu.name);
    if (!tool) {
      results.push({
        toolUseId: tu.id,
        result: {
          ok: false,
          summary: `Unknown tool: ${tu.name}`,
          data: { error: "unknown_tool", name: tu.name },
        },
      });
      continue;
    }
    const result = await tool.handler(tu.input ?? {}, { batch, signal });
    results.push({ toolUseId: tu.id, result });
  }

  if (signal?.aborted) {
    return {
      results,
      mutated: false,
      before: null,
      after: null,
      summary: "Aborted",
      pendingPlan: null,
      resultThumb: null,
      affected: [],
    };
  }

  if (batch.dirty) {
    commitMutationBatch(batch);
    const summaries = results
      .filter((r) => r.result.mutated && r.result.ok)
      .map((r) => r.result.summary);
    const after = afterSnapshotFromBatch(batch);
    after.importedMediaIds = [...batch.importedMediaIds];
    const store = getEditorStore();
    const mediaNameById = new Map(
      store.project.mediaIndex.map((m) => [m.id, m.name] as const),
    );
    return {
      results,
      mutated: true,
      before,
      after,
      summary: summaries.join("; ") || "Updated project",
      pendingPlan: null,
      resultThumb: batch.resultThumb ?? null,
      affected: collectAffectedItems(results, {
        tracks: after.tracks,
        beforeTracks: before.tracks,
        mediaNameById,
      }),
    };
  }

  return {
    results,
    mutated: false,
    before: null,
    after: null,
    summary: results.map((r) => r.result.summary).join("; "),
    pendingPlan: null,
    resultThumb: null,
    affected: [],
  };
}

async function writeActionCheckpoint(args: {
  projectPath: string;
  before: ProjectEditSnapshot;
  after: ProjectEditSnapshot;
  summary: string;
  resultThumb?: BatchThumb | null;
  affected?: ChatActionAffectedItem[];
  onProgress?: ProgressCb;
  onActionCard?: (card: ChatActionCard) => void;
}): Promise<ChatActionCard | undefined> {
  const checkpointId = createCheckpointId();
  const doc: ProjectCheckpointV2 = {
    version: 2,
    id: checkpointId,
    createdAt: new Date().toISOString(),
    summary: args.summary,
    before: args.before,
    after: args.after,
  };
  const saveStep = emitStep(args.onProgress, {
    kind: "edit",
    label: "Saving checkpoint",
    status: "running",
  });
  try {
    await writeCheckpoint(args.projectPath, doc);
    let thumbRelPath: string | undefined;
    let detail: string | undefined;
    if (args.resultThumb) {
      detail = args.resultThumb.detail;
      const path = await writeActionThumb({
        projectPath: args.projectPath,
        cardId: checkpointId,
        bytes: args.resultThumb.bytes,
        mimeType: args.resultThumb.mimeType,
      });
      if (path) thumbRelPath = path;
    }
    const actionCard: ChatActionCard = {
      id: checkpointId,
      summary: args.summary,
      checkpointId,
      createdAt: doc.createdAt,
      thumbRelPath,
      detail,
      affected:
        args.affected && args.affected.length > 0 ? args.affected : undefined,
    };
    args.onActionCard?.(actionCard);
    updateStep(args.onProgress, saveStep, "done", "Undo available");
    return actionCard;
  } catch (err) {
    console.warn("Failed to write AI checkpoint", err);
    updateStep(args.onProgress, saveStep, "error", "Checkpoint failed");
    return undefined;
  }
}

export async function executeConfirmedPlan(
  opts: ExecuteConfirmedPlanOpts,
): Promise<RunChatTurnResult> {
  const progress = opts.onProgress;
  const waitStep = emitStep(progress, {
    kind: "status",
    label: "Running confirmed plan",
    status: "running",
  });

  const toolUses = opts.pendingPlan.toolUses.map((tu) => ({
    id: tu.id,
    name: tu.name,
    input: tu.input ?? {},
  }));

  const toolStepIds = toolUses.map((tu) =>
    emitStep(progress, {
      kind: "tool",
      label: protocolToolLabel(tu.name, tu.input),
      detail: tu.name,
      status: "running",
    }),
  );

  const executed = await executeToolBatch(toolUses, opts.signal, {
    skipConfirmGate: true,
  });

  executed.results.forEach((r, i) => {
    const sid = toolStepIds[i];
    if (!sid) return;
    updateStep(
      progress,
      sid,
      r.result.ok ? "done" : "error",
      r.result.summary,
    );
  });

  if (opts.signal?.aborted) {
    updateStep(progress, waitStep, "error", "Aborted");
    return { text: "Cancelled." };
  }

  updateStep(
    progress,
    waitStep,
    executed.mutated ? "done" : "error",
    executed.summary,
  );

  let textOut = "";
  let actionCard: ChatActionCard | undefined;

  if (executed.mutated && executed.before && executed.after) {
    emitStep(progress, {
      kind: "edit",
      label: "Applied edit",
      detail: executed.summary,
      status: "done",
    });
    if (opts.projectPath) {
      actionCard = await writeActionCheckpoint({
        projectPath: opts.projectPath,
        before: executed.before,
        after: executed.after,
        summary: executed.summary || opts.pendingPlan.summary,
        resultThumb: executed.resultThumb,
        affected: executed.affected,
        onProgress: progress,
        onActionCard: opts.onActionCard,
      });
    }
    textOut = `Done: ${executed.summary}`;
    opts.onDelta(textOut);
  } else {
    textOut = executed.summary || "Plan did not apply changes.";
    opts.onDelta(textOut);
  }

  return { text: textOut, actionCard };
}

export async function runChatTurn(
  opts: RunChatTurnOpts,
): Promise<RunChatTurnResult> {
  const progress = opts.onProgress;

  const contextStep = emitStep(progress, {
    kind: "status",
    label: "Gathering project context",
    status: "running",
  });

  const pack = assembleContextPack({
    messages: [
      ...opts.historyMessages,
      {
        id: "pending",
        role: "user",
        content: opts.userText,
        createdAt: new Date().toISOString(),
      },
    ],
  });

  updateStep(
    progress,
    contextStep,
    "done",
    pack.selection.clipIds.length
      ? `${pack.selection.clipIds.length} selected`
      : "No selection",
  );

  const interactionMode: ChatInteractionMode =
    opts.mode === "ask" ? "ask" : "agent";
  const imageGemini = hasGeminiKey();
  const voiceElevenlabs = hasElevenLabsVoice();
  const sfxElevenlabs = hasElevenLabsSfx();
  const catalogOpts = { imageGemini, voiceElevenlabs, sfxElevenlabs };
  const system = [
    interactionMode === "ask"
      ? buildAskSystemPrompt()
      : buildSystemPrompt(catalogOpts),
    "",
    formatContextPackForPrompt(pack),
  ].join("\n");

  const tools =
    interactionMode === "ask" ? undefined : getAnthropicTools(catalogOpts);
  const apiHistory = historyToApiMessages(opts.historyMessages);

  let attachment: CheapCompositeAttachment | null = null;
  if (
    shouldAttachCheapComposite({
      mode: opts.visionMode,
      userText: opts.userText,
      hasSelection: pack.selection.clipIds.length > 0,
    })
  ) {
    const visionStep = emitStep(progress, {
      kind: "status",
      label: "Capturing preview frame",
      status: "running",
    });
    try {
      attachment = await captureCheapComposite();
      updateStep(
        progress,
        visionStep,
        "done",
        attachment
          ? `${attachment.width}×${attachment.height}`
          : "Skipped (unavailable)",
      );
    } catch (err) {
      console.warn("Cheap composite capture failed", err);
      updateStep(progress, visionStep, "error", "Capture failed");
    }
  }

  const userContent: AnthropicContentBlock[] = [];
  const userImages = opts.userImages?.slice(0, 3) ?? [];
  for (const img of userImages) {
    userContent.push(imageBlockFromAttachment(img));
    userContent.push({
      type: "text",
      text: `[user reference image "${img.name}" ${img.width}×${img.height}]`,
    });
  }
  if (attachment) {
    userContent.push(imageBlockFromAttachment(attachment));
    userContent.push({
      type: "text",
      text: `[attached composite ${attachment.width}px @ playhead ${attachment.playheadMs}ms]`,
    });
  }
  const userText =
    opts.userText.trim() ||
    (userImages.length > 0 ? "Please use the attached reference image(s)." : "");
  userContent.push({ type: "text", text: userText });

  const messages: AnthropicChatMessage[] = [
    ...apiHistory,
    { role: "user", content: userContent },
  ];

  if (interactionMode === "ask") {
    const thinkStep = emitStep(progress, {
      kind: "status",
      label: "Working…",
      status: "running",
    });
    const stream = bindProgressDelta(progress, thinkStep, opts.onDelta);
    const reply = await streamChat({
      apiKey: opts.apiKey,
      model: opts.model,
      system,
      messages,
      signal: opts.signal,
      onDelta: stream.onDelta,
    });
    updateStep(
      progress,
      thinkStep,
      opts.signal?.aborted ? "error" : "done",
      opts.signal?.aborted ? "Aborted" : undefined,
      stream.getTitle() ?? undefined,
    );
    return { text: reply.text };
  }

  let textOut = "";
  let turnBefore: ProjectEditSnapshot | null = null;
  let turnAfter: ProjectEditSnapshot | null = null;
  let turnResultThumb: BatchThumb | null = null;
  const mutateSummaries: string[] = [];
  const turnAffected: ChatActionAffectedItem[] = [];
  let lastHadTools = false;
  let pendingPlan: ChatPendingPlan | undefined;
  /** Last AI-authored progress title — reused on later rounds / tools. */
  let progressTitle: string | null = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (opts.signal?.aborted) break;

    const thinkStep = emitStep(progress, {
      kind: "status",
      label: progressTitle ?? "Working…",
      status: "running",
    });

    const stream = bindProgressDelta(progress, thinkStep, opts.onDelta);
    const reply = await streamChat({
      apiKey: opts.apiKey,
      model: opts.model,
      system,
      messages,
      tools,
      signal: opts.signal,
      onDelta: stream.onDelta,
    });

    textOut += reply.text;
    lastHadTools = reply.toolUses.length > 0;
    progressTitle =
      stream.getTitle() ??
      progressTitleFromText(reply.text) ??
      progressTitle;

    if (reply.toolUses.length === 0) {
      updateStep(
        progress,
        thinkStep,
        "done",
        textOut.trim() ? "Replied" : "Done",
        progressTitle ?? undefined,
      );
      break;
    }

    updateStep(
      progress,
      thinkStep,
      "done",
      `${reply.toolUses.length} tool${reply.toolUses.length === 1 ? "" : "s"}`,
      progressTitle ?? undefined,
    );

    const toolStepIds = reply.toolUses.map((tu) =>
      emitStep(progress, {
        kind: "tool",
        // Prefer the model's own status sentence over generic tool names.
        label: progressTitle ?? protocolToolLabel(tu.name, tu.input),
        detail: tu.name,
        status: "running",
      }),
    );

    const executed = await executeToolBatch(reply.toolUses, opts.signal);

    if (executed.pendingPlan) {
      for (const sid of toolStepIds) {
        updateStep(progress, sid, "done", "Waiting for confirm");
      }
      emitStep(progress, {
        kind: "status",
        label: "Waiting for confirm",
        detail: executed.pendingPlan.summary,
        status: "done",
      });
      pendingPlan = executed.pendingPlan;
      opts.onPendingPlan?.(pendingPlan);

      messages.push(
        { role: "assistant", content: reply.content },
        {
          role: "user",
          content: executed.results.map((r) =>
            toolResultBlock(r.toolUseId, r.result),
          ),
        },
      );

      if (!textOut.trim()) {
        const notice = `${executed.pendingPlan.summary}. Click Run plan to apply, or Cancel.`;
        opts.onDelta(notice);
        textOut = notice;
      }
      lastHadTools = false;
      break;
    }

    executed.results.forEach((r, i) => {
      const sid = toolStepIds[i];
      if (!sid) return;
      updateStep(
        progress,
        sid,
        r.result.ok ? "done" : "error",
        r.result.summary,
      );
    });

    if (executed.mutated && executed.before && executed.after) {
      if (!turnBefore) turnBefore = executed.before;
      // Merge imported media ids across rounds
      if (turnAfter) {
        turnAfter = {
          ...executed.after,
          importedMediaIds: [
            ...new Set([
              ...turnAfter.importedMediaIds,
              ...executed.after.importedMediaIds,
            ]),
          ],
        };
      } else {
        turnAfter = executed.after;
      }
      mutateSummaries.push(executed.summary);
      if (executed.resultThumb) turnResultThumb = executed.resultThumb;
      turnAffected.push(...executed.affected);
      emitStep(progress, {
        kind: "edit",
        label: "Applied edit",
        detail: executed.summary,
        status: "done",
      });
    }

    const toolResultBlocks: AnthropicContentBlock[] = executed.results.map(
      (r) => toolResultBlock(r.toolUseId, r.result),
    );

    // New captures supersede older ones — avoid re-sending image tiles every round.
    if (toolResultBlocks.some((b) => contentHasImage([b]))) {
      stripPriorVisionImages(messages);
    }

    messages.push(
      { role: "assistant", content: reply.content },
      { role: "user", content: toolResultBlocks },
    );

    if (opts.signal?.aborted) break;

    if (round === MAX_TOOL_ROUNDS - 1) {
      const wrapStep = emitStep(progress, {
        kind: "status",
        label: progressTitle ?? "Wrapping up…",
        status: "running",
      });
      const wrapStream = bindProgressDelta(progress, wrapStep, opts.onDelta);
      const wrap = await streamChat({
        apiKey: opts.apiKey,
        model: opts.model,
        system,
        messages,
        signal: opts.signal,
        onDelta: wrapStream.onDelta,
      });
      textOut += wrap.text;
      progressTitle =
        wrapStream.getTitle() ??
        progressTitleFromText(wrap.text) ??
        progressTitle;
      updateStep(progress, wrapStep, "done", undefined, progressTitle ?? undefined);
      lastHadTools = false;
      break;
    }
  }

  if (lastHadTools && textOut.trim().length < 8 && !opts.signal?.aborted) {
    const wrapStep = emitStep(progress, {
      kind: "status",
      label: progressTitle ?? "Wrapping up…",
      status: "running",
    });
    const wrapStream = bindProgressDelta(progress, wrapStep, opts.onDelta);
    const wrap = await streamChat({
      apiKey: opts.apiKey,
      model: opts.model,
      system,
      messages,
      signal: opts.signal,
      onDelta: wrapStream.onDelta,
    });
    textOut += wrap.text;
    progressTitle =
      wrapStream.getTitle() ??
      progressTitleFromText(wrap.text) ??
      progressTitle;
    updateStep(progress, wrapStep, "done", undefined, progressTitle ?? undefined);
  }

  let actionCard: ChatActionCard | undefined;
  if (turnBefore && turnAfter && opts.projectPath && !pendingPlan) {
    const summary = mutateSummaries.join("; ") || "Updated project";
    actionCard = await writeActionCheckpoint({
      projectPath: opts.projectPath,
      before: turnBefore,
      after: turnAfter,
      summary,
      resultThumb: turnResultThumb,
      affected: turnAffected,
      onProgress: progress,
      onActionCard: opts.onActionCard,
    });
  }

  if (!textOut.trim() && mutateSummaries.length > 0) {
    const fallback = mutateSummaries.join("; ");
    opts.onDelta(fallback);
    textOut = fallback;
  }

  return { text: textOut, actionCard, pendingPlan };
}
