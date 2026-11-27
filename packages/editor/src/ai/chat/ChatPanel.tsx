import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import { IconImage, IconSend, IconStop } from "../../icons/Icons";
import { MAX_USER_REFERENCE_IMAGES } from "../context/downscaleUserImage";
import {
  getChatModelId,
  hasAnthropicKey,
  hasElevenLabsSfx,
  hasElevenLabsVoice,
  hasGeminiKey,
  subscribeAiSecrets,
} from "../secrets/aiSecrets";
import { useEditorStore } from "../../store/editorStore";
import { ActionCardView } from "./ActionCard";
import { AgentSteps } from "./AgentSteps";
import { useChatStore } from "./chatStore";
import { ModePicker } from "./ModePicker";
import { ModelPicker } from "./ModelPicker";
import { PlanCardView } from "./PlanCard";
import { VisionModePicker } from "./VisionModePicker";
import "./ChatPanel.css";

type ChatCopyMenuState = {
  x: number;
  y: number;
  text: string;
};

function getSelectedTextIn(root: HTMLElement | null): string {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !root) return "";
  if (sel.rangeCount === 0) return "";
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return "";
  return sel.toString();
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export function ChatPanel() {
  const setAiSettingsOpen = useEditorStore((s) => s.setAiSettingsOpen);
  const messages = useChatStore((s) => s.messages);
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const draftImages = useChatStore((s) => s.draftImages);
  const addDraftImages = useChatStore((s) => s.addDraftImages);
  const removeDraftImage = useChatStore((s) => s.removeDraftImage);
  const modelId = useChatStore((s) => s.modelId);
  const setModelId = useChatStore((s) => s.setModelId);
  const selectModel = useChatStore((s) => s.selectModel);
  const visionMode = useChatStore((s) => s.visionMode);
  const setVisionMode = useChatStore((s) => s.setVisionMode);
  const chatMode = useChatStore((s) => s.chatMode);
  const setChatMode = useChatStore((s) => s.setChatMode);
  const streaming = useChatStore((s) => s.streaming);
  const error = useChatStore((s) => s.error);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);

  const [keyReady, setKeyReady] = useState(() => hasAnthropicKey());
  const [imageSkill, setImageSkill] = useState(() => hasGeminiKey());
  const [voiceSkill, setVoiceSkill] = useState(() => hasElevenLabsVoice());
  const [sfxSkill, setSfxSkill] = useState(() => hasElevenLabsSfx());
  const [copyMenu, setCopyMenu] = useState<ChatCopyMenuState | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = Boolean(draft.trim() || draftImages.length > 0);

  useEffect(() => {
    setKeyReady(hasAnthropicKey());
    setImageSkill(hasGeminiKey());
    setVoiceSkill(hasElevenLabsVoice());
    setSfxSkill(hasElevenLabsSfx());
    setModelId(getChatModelId());
    return subscribeAiSecrets(() => {
      setKeyReady(hasAnthropicKey());
      setImageSkill(hasGeminiKey());
      setVoiceSkill(hasElevenLabsVoice());
      setSfxSkill(hasElevenLabsSfx());
      setModelId(getChatModelId());
    });
  }, [setModelId]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const blocked = !keyReady;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!blocked && !streaming && canSend) void sendMessage();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    void addDraftImages(files);
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) void addDraftImages(files);
    e.target.value = "";
  };

  const onTranscriptContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    const selected = getSelectedTextIn(transcriptRef.current).trim();
    let text = selected;
    if (!text) {
      const bubble = (e.target as HTMLElement | null)?.closest?.(
        ".chat-panel__bubble",
      );
      const body = bubble?.querySelector(".chat-panel__bubble-text");
      text = (body?.textContent ?? "").trim();
    }
    if (!text) return;
    e.preventDefault();
    setCopyMenu({ x: e.clientX, y: e.clientY, text });
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        <div className="chat-panel__title-row">
          <span className="chat-panel__title">Chat</span>
          <div className="chat-panel__skills" aria-label="Skills">
            <span
              className={
                imageSkill
                  ? "chat-panel__skill"
                  : "chat-panel__skill chat-panel__skill--disabled"
              }
              title={
                imageSkill
                  ? "Gemini image generate / edit available"
                  : "Add Gemini API key in Settings → AI"
              }
            >
              Image
            </span>
            <span
              className={
                voiceSkill
                  ? "chat-panel__skill"
                  : "chat-panel__skill chat-panel__skill--disabled"
              }
              title={
                voiceSkill
                  ? "ElevenLabs voiceover available"
                  : "Add ElevenLabs API key and Voice ID in Settings → AI"
              }
            >
              Voice
            </span>
            <span
              className={
                sfxSkill
                  ? "chat-panel__skill"
                  : "chat-panel__skill chat-panel__skill--disabled"
              }
              title={
                sfxSkill
                  ? "ElevenLabs sound effects available"
                  : "Add ElevenLabs API key and pass Test (SFX) in Settings → AI"
              }
            >
              SFX
            </span>
          </div>
        </div>
      </div>

      <div
        className="chat-panel__transcript"
        ref={transcriptRef}
        onContextMenu={onTranscriptContextMenu}
      >
        {messages.length === 0 && !blocked ? (
          <p className="chat-panel__empty">
            {chatMode === "ask"
              ? "Ask for editing suggestions — IndieCut won’t change the timeline in Ask mode. Switch to Agent to apply edits."
              : "Ask IndieCut to edit the timeline or selected clip — for example “split at the playhead” or “make the selected title bigger and white”. Destructive multi-clip deletes ask for Confirm first."}
          </p>
        ) : null}
        {messages.map((m) => {
          const isLiveAssistant =
            streaming && m.role === "assistant" && m === messages[messages.length - 1];
          const showLiveProgress =
            isLiveAssistant && !!m.agentSteps && m.agentSteps.length > 0;
          const empty =
            !m.content &&
            isLiveAssistant &&
            !m.actionCard &&
            !m.pendingPlan &&
            !showLiveProgress
              ? "…"
              : null;
          return (
            <div
              key={m.id}
              className={`chat-panel__bubble chat-panel__bubble--${m.role}${m.stale ? " chat-panel__bubble--stale" : ""}`}
            >
              <div className="chat-panel__bubble-role">
                {m.role === "user" ? "You" : "IndieCut"}
              </div>
              {showLiveProgress ? (
                <AgentSteps steps={m.agentSteps!} live />
              ) : null}
              {m.role === "assistant" ? (
                m.content || empty ? (
                  <div className="chat-panel__bubble-text chat-panel__md">
                    {empty ? (
                      empty
                    ) : (
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    )}
                  </div>
                ) : null
              ) : (
                <>
                  {m.images && m.images.length > 0 ? (
                    <div className="chat-panel__bubble-images">
                      {m.images.map((img) => (
                        <img
                          key={img.id}
                          className="chat-panel__bubble-image"
                          src={`data:${img.mimeType};base64,${img.base64}`}
                          alt={img.name}
                          title={`${img.name} (${img.width}×${img.height})`}
                        />
                      ))}
                    </div>
                  ) : null}
                  {m.content ? (
                    <div className="chat-panel__bubble-text chat-panel__bubble-text--plain">
                      {m.content}
                    </div>
                  ) : null}
                </>
              )}
              {m.pendingPlan ? (
                <PlanCardView
                  messageId={m.id}
                  plan={m.pendingPlan}
                  stale={Boolean(m.stale)}
                />
              ) : null}
              {m.actionCard ? (
                <ActionCardView
                  messageId={m.id}
                  card={m.actionCard}
                  stale={Boolean(m.stale)}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {copyMenu ? (
        <ChatCopyMenu
          menu={copyMenu}
          onClose={() => setCopyMenu(null)}
          onCopy={() => {
            void copyTextToClipboard(copyMenu.text).finally(() =>
              setCopyMenu(null),
            );
          }}
        />
      ) : null}

      {error ? (
        <p className="chat-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="chat-panel__composer">
        {blocked ? (
          <div className="chat-panel__blocked">
            <p className="chat-panel__blocked-text">
              Add an Anthropic API key to use Chat.
            </p>
            <button
              type="button"
              className="chat-panel__cta"
              onClick={() => setAiSettingsOpen(true)}
            >
              Settings → AI
            </button>
          </div>
        ) : (
          <div className="chat-panel__input-wrap">
            {draftImages.length > 0 ? (
              <div className="chat-panel__draft-images" aria-label="Attached images">
                {draftImages.map((img) => (
                  <div key={img.id} className="chat-panel__draft-image">
                    <img
                      src={`data:${img.mimeType};base64,${img.base64}`}
                      alt={img.name}
                      title={`${img.name} (${img.width}×${img.height})`}
                    />
                    <button
                      type="button"
                      className="chat-panel__draft-image-remove"
                      title="Remove image"
                      aria-label={`Remove ${img.name}`}
                      disabled={streaming}
                      onClick={() => removeDraftImage(img.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              className="chat-panel__input"
              rows={3}
              placeholder={
                chatMode === "ask"
                  ? "Ask for a suggestion… (paste or attach a reference image)"
                  : "Ask IndieCut… (paste or attach a reference image)"
              }
              value={draft}
              disabled={streaming}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              multiple
              hidden
              onChange={onPickFiles}
            />
            <div className="chat-panel__composer-bar">
              <div className="chat-panel__composer-left">
                <ModePicker
                  value={chatMode}
                  disabled={streaming}
                  onChange={setChatMode}
                />
                <ModelPicker
                  value={modelId}
                  disabled={streaming}
                  onChange={(id) => {
                    void selectModel(id);
                  }}
                />
                <button
                  type="button"
                  className="chat-panel__attach-btn"
                  title={
                    draftImages.length >= MAX_USER_REFERENCE_IMAGES
                      ? `Up to ${MAX_USER_REFERENCE_IMAGES} reference images`
                      : "Attach reference image"
                  }
                  aria-label="Attach reference image"
                  disabled={
                    streaming || draftImages.length >= MAX_USER_REFERENCE_IMAGES
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  <IconImage size={14} />
                </button>
              </div>
              <div className="chat-panel__composer-right">
                <VisionModePicker
                  value={visionMode}
                  disabled={streaming}
                  onChange={setVisionMode}
                />
                {streaming ? (
                  <button
                    type="button"
                    className="chat-panel__icon-btn chat-panel__icon-btn--stop"
                    title="Stop"
                    aria-label="Stop"
                    onClick={() => stopStreaming()}
                  >
                    <IconStop size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chat-panel__icon-btn chat-panel__icon-btn--send"
                    title="Send"
                    aria-label="Send"
                    disabled={!canSend}
                    onClick={() => void sendMessage()}
                  >
                    <IconSend size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatCopyMenu({
  menu,
  onClose,
  onCopy,
}: {
  menu: ChatCopyMenuState;
  onClose: () => void;
  onCopy: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const left = Math.min(menu.x, window.innerWidth - 140);
  const top = Math.min(menu.y, window.innerHeight - 56);

  return (
    <div
      ref={rootRef}
      className="chat-copy-menu"
      style={{ left, top }}
      role="menu"
      aria-label="Chat text menu"
    >
      <button
        type="button"
        role="menuitem"
        className="chat-copy-menu__item"
        onClick={onCopy}
      >
        Copy
      </button>
    </div>
  );
}
