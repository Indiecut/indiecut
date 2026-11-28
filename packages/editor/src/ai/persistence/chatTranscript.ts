import { getPlatform } from "@indiecut/platform";
import { pruneCheckpoints } from "../tools/snapshots";

export type ChatRole = "user" | "assistant";

/** One clip touched by an AI edit — clickable in the Action Card. */
export type ChatActionAffectedItem = {
  clipId: string;
  trackId?: string;
  /** Human label for the list (tool summary). */
  label: string;
};

export type ChatActionCard = {
  id: string;
  summary: string;
  checkpointId: string;
  createdAt: string;
  restoredAt?: string;
  reappliedAt?: string;
  /** Project-relative small JPEG for generative results. */
  thumbRelPath?: string;
  /** One-line detail (prompt / clip / time). */
  detail?: string;
  /** Clips created/updated by this edit; selecting one selects it on the timeline. */
  affected?: ChatActionAffectedItem[];
};

/** Host-gated destructive / large-trim plan awaiting Run plan. */
export type ChatPendingPlanStep = {
  tool: string;
  summary: string;
};

export type ChatPendingPlanToolUse = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ChatPendingPlan = {
  id: string;
  summary: string;
  steps: ChatPendingPlanStep[];
  toolUses: ChatPendingPlanToolUse[];
  createdAt: string;
  /** Set when user cancelled without running. */
  cancelledAt?: string;
};

export type ChatAgentStepStatus = "running" | "done" | "error";

/** Live / persisted trail of what the agent did in a turn. */
export type ChatAgentStep = {
  id: string;
  kind: "status" | "tool" | "edit";
  label: string;
  detail?: string;
  status: ChatAgentStepStatus;
  at: string;
};

/** Downscaled reference image attached to a user chat turn. */
export type ChatUserImage = {
  id: string;
  name: string;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** Base64 (no data: prefix). Already downscaled before attach. */
  base64: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** User reference images for this turn (downscaled JPEG/PNG/WebP). */
  images?: ChatUserImage[];
  actionCard?: ChatActionCard;
  /** Waiting for user Confirm / Run plan (destructive batches). */
  pendingPlan?: ChatPendingPlan;
  /** Agent progress steps for this assistant turn. */
  agentSteps?: ChatAgentStep[];
  /**
   * Soft-invalidated after Restore/Re-apply of an earlier card.
   * Shown grey until the next user send, then dropped from history.
   */
  stale?: boolean;
};

export type ChatTranscriptV1 = {
  version: 1;
  messages: ChatMessage[];
};

export type ChatTranscriptV2 = {
  version: 2;
  messages: ChatMessage[];
};

export const MAX_CHAT_MESSAGES = 50;
const RELATIVE_PATH = "ai/chat.json";

function transcriptPath(projectPath: string): string {
  const root = projectPath.replace(/[/\\]+$/, "");
  const sep = projectPath.includes("\\") ? "\\" : "/";
  return `${root}${sep}ai${sep}chat.json`;
}

function normalizeAffectedItems(
  raw: unknown,
): ChatActionAffectedItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ChatActionAffectedItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (typeof a.clipId !== "string" || !a.clipId) continue;
    if (typeof a.label !== "string" || !a.label.trim()) continue;
    out.push({
      clipId: a.clipId,
      trackId: typeof a.trackId === "string" ? a.trackId : undefined,
      label: a.label.trim(),
    });
  }
  return out.length > 0 ? out : undefined;
}

function normalizeActionCard(raw: unknown): ChatActionCard | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id) return undefined;
  if (typeof c.summary !== "string") return undefined;
  if (typeof c.checkpointId !== "string" || !c.checkpointId) return undefined;
  const affected = normalizeAffectedItems(c.affected);
  return {
    id: c.id,
    summary: c.summary,
    checkpointId: c.checkpointId,
    createdAt:
      typeof c.createdAt === "string" && c.createdAt
        ? c.createdAt
        : new Date().toISOString(),
    restoredAt: typeof c.restoredAt === "string" ? c.restoredAt : undefined,
    reappliedAt: typeof c.reappliedAt === "string" ? c.reappliedAt : undefined,
    thumbRelPath:
      typeof c.thumbRelPath === "string" && c.thumbRelPath
        ? c.thumbRelPath
        : undefined,
    detail: typeof c.detail === "string" && c.detail ? c.detail : undefined,
    affected,
  };
}

function normalizePendingPlan(raw: unknown): ChatPendingPlan | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id) return undefined;
  if (typeof p.summary !== "string") return undefined;
  if (!Array.isArray(p.toolUses) || p.toolUses.length === 0) return undefined;

  const toolUses: ChatPendingPlanToolUse[] = [];
  for (const item of p.toolUses) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (typeof t.id !== "string" || !t.id) continue;
    if (typeof t.name !== "string" || !t.name) continue;
    const input =
      t.input && typeof t.input === "object" && !Array.isArray(t.input)
        ? (t.input as Record<string, unknown>)
        : {};
    toolUses.push({ id: t.id, name: t.name, input });
  }
  if (toolUses.length === 0) return undefined;

  const steps: ChatPendingPlanStep[] = [];
  if (Array.isArray(p.steps)) {
    for (const item of p.steps) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      if (typeof s.tool !== "string" || typeof s.summary !== "string") continue;
      steps.push({ tool: s.tool, summary: s.summary });
    }
  }

  return {
    id: p.id,
    summary: p.summary,
    steps:
      steps.length > 0
        ? steps
        : toolUses.map((t) => ({ tool: t.name, summary: t.name })),
    toolUses,
    createdAt:
      typeof p.createdAt === "string" && p.createdAt
        ? p.createdAt
        : new Date().toISOString(),
    cancelledAt:
      typeof p.cancelledAt === "string" ? p.cancelledAt : undefined,
  };
}

function normalizeAgentSteps(raw: unknown): ChatAgentStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ChatAgentStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== "string" || !s.id) continue;
    if (typeof s.label !== "string") continue;
    if (s.kind !== "status" && s.kind !== "tool" && s.kind !== "edit") continue;
    if (s.status !== "running" && s.status !== "done" && s.status !== "error") {
      continue;
    }
    out.push({
      id: s.id,
      kind: s.kind,
      label: s.label,
      detail: typeof s.detail === "string" ? s.detail : undefined,
      status: s.status,
      at:
        typeof s.at === "string" && s.at ? s.at : new Date().toISOString(),
    });
  }
  return out.length > 0 ? out.slice(-40) : undefined;
}

function normalizeUserImages(raw: unknown): ChatUserImage[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ChatUserImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const img = item as Record<string, unknown>;
    if (typeof img.id !== "string" || !img.id) continue;
    if (typeof img.base64 !== "string" || !img.base64) continue;
    if (typeof img.width !== "number" || !Number.isFinite(img.width)) continue;
    if (typeof img.height !== "number" || !Number.isFinite(img.height)) {
      continue;
    }
    const mime =
      img.mimeType === "image/png" || img.mimeType === "image/webp"
        ? img.mimeType
        : "image/jpeg";
    out.push({
      id: img.id,
      name:
        typeof img.name === "string" && img.name.trim()
          ? img.name.trim()
          : "reference.jpg",
      width: Math.max(1, Math.round(img.width)),
      height: Math.max(1, Math.round(img.height)),
      mimeType: mime,
      base64: img.base64,
    });
    if (out.length >= 3) break;
  }
  return out.length > 0 ? out : undefined;
}

function normalizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (typeof m.id !== "string" || !m.id) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string") continue;
    const msg: ChatMessage = {
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt:
        typeof m.createdAt === "string" && m.createdAt
          ? m.createdAt
          : new Date().toISOString(),
    };
    const images = normalizeUserImages(m.images);
    if (images) msg.images = images;
    const card = normalizeActionCard(m.actionCard);
    if (card) msg.actionCard = card;
    const plan = normalizePendingPlan(m.pendingPlan);
    if (plan) msg.pendingPlan = plan;
    const steps = normalizeAgentSteps(m.agentSteps);
    if (steps) msg.agentSteps = steps;
    if (m.stale === true) msg.stale = true;
    out.push(msg);
  }
  return out.slice(-MAX_CHAT_MESSAGES);
}

/** Drop soft-invalidated messages (after Restore, once the user sends again). */
export function dropStaleMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => !m.stale);
}

function clearStale(m: ChatMessage): ChatMessage {
  if (!m.stale) return m;
  const { stale: _drop, ...rest } = m;
  void _drop;
  return rest;
}

/**
 * Action Card turn starts at the user prompt right before the assistant
 * card (when present), so Undo greys the request + reply as one unit.
 */
export function turnStartIndex(
  messages: ChatMessage[],
  cardMessageId: string,
): number {
  const idx = messages.findIndex((m) => m.id === cardMessageId);
  if (idx < 0) return -1;
  if (idx > 0 && messages[idx - 1]?.role === "user") return idx - 1;
  return idx;
}

/**
 * Undo: grey this card’s user prompt (if any), the card, and everything after.
 */
export function markMessagesStaleFrom(
  messages: ChatMessage[],
  anchorMessageId: string,
): ChatMessage[] {
  const cardIdx = messages.findIndex((m) => m.id === anchorMessageId);
  if (cardIdx < 0) return messages;
  const start = turnStartIndex(messages, anchorMessageId);
  return messages.map((m, i) => {
    if (i < start) return clearStale(m);
    return m.stale ? m : { ...m, stale: true };
  });
}

/**
 * Re-apply: this card’s turn is live again; grey only messages after the card.
 */
export function markMessagesStaleAfter(
  messages: ChatMessage[],
  anchorMessageId: string,
): ChatMessage[] {
  const cardIdx = messages.findIndex((m) => m.id === anchorMessageId);
  if (cardIdx < 0) return messages;
  const start = turnStartIndex(messages, anchorMessageId);
  return messages.map((m, i) => {
    if (i >= start && i <= cardIdx) return clearStale(m);
    if (i > cardIdx) return m.stale ? m : { ...m, stale: true };
    return clearStale(m);
  });
}

export function createMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function capMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_CHAT_MESSAGES) return messages;
  return messages.slice(-MAX_CHAT_MESSAGES);
}

export function collectCheckpointIds(messages: ChatMessage[]): string[] {
  const ids: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const id = messages[i]?.actionCard?.checkpointId;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export async function loadChatTranscript(
  projectPath: string,
): Promise<ChatMessage[]> {
  if (!projectPath) return [];
  const bridge = getPlatform();
  if (!bridge?.fs) return [];
  const path = transcriptPath(projectPath);
  try {
    const exists = await bridge.fs.pathExists(path);
    if (!exists) return [];
    const bytes = await bridge.fs.readFile(path);
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text) as { version?: number; messages?: unknown };
    if (!parsed || (parsed.version !== 1 && parsed.version !== 2)) return [];
    return normalizeMessages(parsed.messages);
  } catch {
    return [];
  }
}

export async function saveChatTranscript(
  projectPath: string,
  messages: ChatMessage[],
): Promise<void> {
  if (!projectPath) return;
  const bridge = getPlatform();
  if (!bridge?.fs?.writeProjectFile) return;
  const capped = capMessages(messages);
  const doc: ChatTranscriptV2 = { version: 2, messages: capped };
  await bridge.fs.ensureProjectLayout(projectPath);
  await bridge.fs.writeProjectFile(
    projectPath,
    RELATIVE_PATH,
    JSON.stringify(doc, null, 2),
    "utf8",
  );
  try {
    await pruneCheckpoints(projectPath, collectCheckpointIds(capped));
  } catch (err) {
    console.warn("Failed to prune AI checkpoints", err);
  }
}
