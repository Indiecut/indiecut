import { create } from "zustand";
import {
  executeConfirmedPlan,
  runChatTurn,
  type AgentProgressEvent,
} from "../agent/runChatTurn";
import type { ChatInteractionMode, VisionMode } from "../context/types";
import {
  capMessages,
  createMessageId,
  dropStaleMessages,
  loadChatTranscript,
  markMessagesStaleAfter,
  markMessagesStaleFrom,
  saveChatTranscript,
  type ChatActionCard,
  type ChatAgentStep,
  type ChatMessage,
  type ChatPendingPlan,
} from "../persistence/chatTranscript";
import {
  getAiSecretsCached,
  getClaudeModelId,
  hasAnthropicKey,
  type ClaudeModelId,
} from "../secrets/aiSecrets";

const SAVE_DEBOUNCE_MS = 400;

type ChatStoreState = {
  messages: ChatMessage[];
  projectPath: string | null;
  streaming: boolean;
  error: string | null;
  draft: string;
  modelId: ClaudeModelId;
  visionMode: VisionMode;
  /** Agent (default) can edit; Ask is suggestions only. */
  chatMode: ChatInteractionMode;
  abortController: AbortController | null;

  setDraft: (text: string) => void;
  setModelId: (id: ClaudeModelId) => void;
  setVisionMode: (mode: VisionMode) => void;
  setChatMode: (mode: ChatInteractionMode) => void;
  loadForProject: (projectPath: string | null) => Promise<void>;
  clearSession: () => void;
  sendMessage: () => Promise<void>;
  stopStreaming: () => void;
  scheduleSave: () => void;
  markCardRestored: (messageId: string) => void;
  markCardReapplied: (messageId: string) => void;
  confirmPendingPlan: (messageId: string) => Promise<void>;
  cancelPendingPlan: (messageId: string) => void;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function persistNow(projectPath: string | null, messages: ChatMessage[]) {
  if (!projectPath) return;
  try {
    await saveChatTranscript(projectPath, messages);
  } catch (err) {
    console.warn("Failed to save AI chat transcript", err);
  }
}

function applyProgress(
  assistantId: string,
  event: AgentProgressEvent,
): (s: ChatStoreState) => Partial<ChatStoreState> {
  return (s) => ({
    messages: s.messages.map((m) => {
      if (m.id !== assistantId) return m;
      const steps = m.agentSteps ? [...m.agentSteps] : [];
      if (event.type === "step") {
        steps.push(event.step);
        return { ...m, agentSteps: steps.slice(-40) };
      }
      const idx = steps.findIndex((st) => st.id === event.id);
      if (idx < 0) return m;
      const prev = steps[idx]!;
      const next: ChatAgentStep = {
        ...prev,
        status: event.status,
        detail: event.detail ?? prev.detail,
        label: event.label ?? prev.label,
      };
      steps[idx] = next;
      return { ...m, agentSteps: steps };
    }),
  });
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  messages: [],
  projectPath: null,
  streaming: false,
  error: null,
  draft: "",
  modelId: getClaudeModelId(),
  visionMode: "auto",
  chatMode: "agent",
  abortController: null,

  setDraft: (text) => set({ draft: text }),

  setModelId: (id) => set({ modelId: id }),

  setVisionMode: (mode) => set({ visionMode: mode }),

  setChatMode: (mode) => set({ chatMode: mode }),

  loadForProject: async (projectPath) => {
    const prevState = get();
    prevState.abortController?.abort();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (prevState.projectPath && prevState.projectPath !== projectPath) {
      await persistNow(prevState.projectPath, prevState.messages);
    }
    if (!projectPath) {
      set({
        messages: [],
        projectPath: null,
        streaming: false,
        error: null,
        draft: "",
        abortController: null,
        modelId: getClaudeModelId(),
      });
      return;
    }
    const messages = await loadChatTranscript(projectPath);
    set({
      messages,
      projectPath,
      streaming: false,
      error: null,
      draft: "",
      abortController: null,
      modelId: getClaudeModelId(),
    });
  },

  clearSession: () => {
    get().abortController?.abort();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({
      messages: [],
      projectPath: null,
      streaming: false,
      error: null,
      draft: "",
      abortController: null,
    });
  },

  scheduleSave: () => {
    const projectPath = get().projectPath;
    if (!projectPath) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistNow(projectPath, get().messages);
    }, SAVE_DEBOUNCE_MS);
  },

  stopStreaming: () => {
    const { abortController } = get();
    abortController?.abort();
  },

  markCardRestored: (messageId) => {
    const now = new Date().toISOString();
    set((s) => {
      const withMeta = s.messages.map((m) =>
        m.id === messageId && m.actionCard
          ? {
              ...m,
              actionCard: { ...m.actionCard, restoredAt: now },
            }
          : m,
      );
      return { messages: markMessagesStaleFrom(withMeta, messageId) };
    });
    get().scheduleSave();
  },

  markCardReapplied: (messageId) => {
    const now = new Date().toISOString();
    set((s) => {
      const withMeta = s.messages.map((m) =>
        m.id === messageId && m.actionCard
          ? {
              ...m,
              actionCard: {
                ...m.actionCard,
                reappliedAt: now,
                restoredAt: undefined,
              },
            }
          : m,
      );
      return { messages: markMessagesStaleAfter(withMeta, messageId) };
    });
    get().scheduleSave();
  },

  cancelPendingPlan: (messageId) => {
    const now = new Date().toISOString();
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId && m.pendingPlan && !m.pendingPlan.cancelledAt
          ? {
              ...m,
              pendingPlan: { ...m.pendingPlan, cancelledAt: now },
              content: m.content
                ? `${m.content}\n\n(Plan cancelled.)`
                : "Plan cancelled.",
            }
          : m,
      ),
    }));
    get().scheduleSave();
  },

  confirmPendingPlan: async (messageId) => {
    const state = get();
    if (state.streaming) return;
    const msg = state.messages.find((m) => m.id === messageId);
    const plan = msg?.pendingPlan;
    if (!plan || plan.cancelledAt) return;
    if (!hasAnthropicKey()) {
      set({ error: "Add an Anthropic API key in AI settings to chat." });
      return;
    }
    const apiKey = getAiSecretsCached().anthropicKey;
    if (!apiKey) return;

    const controller = new AbortController();
    set({
      error: null,
      streaming: true,
      abortController: controller,
      messages: state.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              // Clear pending so Plan Card hides; keep plan data for execute.
              pendingPlan: undefined,
              content: m.content || `Running: ${plan.summary}`,
            }
          : m,
      ),
    });

    try {
      const result = await executeConfirmedPlan({
        apiKey,
        model: state.modelId,
        projectPath: state.projectPath,
        pendingPlan: plan,
        signal: controller.signal,
        onDelta: (delta) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    content:
                      m.content && !m.content.endsWith(delta)
                        ? `${m.content}\n${delta}`
                        : m.content || delta,
                  }
                : m,
            ),
          }));
        },
        onProgress: (event) => set(applyProgress(messageId, event)),
        onActionCard: (card: ChatActionCard) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === messageId ? { ...m, actionCard: card } : m,
            ),
          }));
        },
      });

      if (result.actionCard) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  actionCard: m.actionCard ?? result.actionCard,
                  content: m.content || result.text,
                  pendingPlan: undefined,
                }
              : m,
          ),
        }));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const message =
          err instanceof Error ? err.message : "Run plan failed";
        // Restore pending plan so user can retry.
        set((s) => ({
          error: message,
          messages: s.messages.map((m) =>
            m.id === messageId && !m.actionCard
              ? { ...m, pendingPlan: plan }
              : m,
          ),
        }));
      }
    } finally {
      set({ streaming: false, abortController: null });
      get().scheduleSave();
    }
  },

  sendMessage: async () => {
    const state = get();
    const text = state.draft.trim();
    if (!text || state.streaming) return;
    if (!hasAnthropicKey()) {
      set({ error: "Add an Anthropic API key in AI settings to chat." });
      return;
    }
    const apiKey = getAiSecretsCached().anthropicKey;
    if (!apiKey) return;

    // Drop greyed-out post-restore turns — they can't stay in history.
    const kept = dropStaleMessages(state.messages);

    const userMsg: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const assistantId = createMessageId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };

    const historyMessages = kept.slice();

    const controller = new AbortController();
    set({
      draft: "",
      error: null,
      streaming: true,
      abortController: controller,
      messages: capMessages([...kept, userMsg, assistantMsg]),
    });

    try {
      const result = await runChatTurn({
        apiKey,
        model: state.modelId,
        historyMessages,
        userText: text,
        projectPath: state.projectPath,
        visionMode: state.visionMode,
        mode: state.chatMode,
        signal: controller.signal,
        onDelta: (delta) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + delta }
                : m,
            ),
          }));
        },
        onProgress: (event: AgentProgressEvent) => {
          set(applyProgress(assistantId, event));
        },
        onActionCard: (card: ChatActionCard) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId ? { ...m, actionCard: card } : m,
            ),
          }));
        },
        onPendingPlan: (plan: ChatPendingPlan) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId ? { ...m, pendingPlan: plan } : m,
            ),
          }));
        },
      });

      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== assistantId) return m;
          return {
            ...m,
            actionCard: m.actionCard ?? result.actionCard,
            pendingPlan: m.pendingPlan ?? result.pendingPlan,
            content: m.content || result.text,
          };
        }),
      }));
    } catch (err) {
      if (controller.signal.aborted) {
        // Keep partial assistant text
      } else {
        const message =
          err instanceof Error ? err.message : "Chat request failed";
        set((s) => {
          const current = s.messages.find((m) => m.id === assistantId);
          const empty =
            !current?.content &&
            !current?.actionCard &&
            !current?.pendingPlan &&
            !(current?.agentSteps && current.agentSteps.length > 0);
          return {
            error: message,
            messages: empty
              ? s.messages.filter((m) => m.id !== assistantId)
              : s.messages,
          };
        });
      }
    } finally {
      set({ streaming: false, abortController: null });
      get().scheduleSave();
    }
  },
}));
