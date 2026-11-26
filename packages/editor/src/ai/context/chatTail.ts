import type { ChatMessage } from "../persistence/chatTranscript";
import type { AiChatTurnSummary } from "./types";

export const CHAT_TAIL_TURNS = 6;

/** Build a short rolling history for the model (no image bytes / raw tool JSON). */
export function buildChatTail(
  messages: ChatMessage[],
  maxTurns = CHAT_TAIL_TURNS,
): AiChatTurnSummary[] {
  const recent = messages.slice(-maxTurns);
  return recent.map((m) => {
    let summary = m.content.trim();
    if (m.images && m.images.length > 0) {
      const note =
        m.images.length === 1
          ? "[1 reference image attached]"
          : `[${m.images.length} reference images attached]`;
      summary = summary ? `${summary}\n${note}` : note;
    }
    if (m.actionCard) {
      const cardNote = `[Action Card ${m.actionCard.id}: ${m.actionCard.summary}]`;
      summary = summary ? `${summary}\n${cardNote}` : cardNote;
      if (m.actionCard.detail) {
        summary += `\n[${m.actionCard.detail}]`;
      }
      if (m.actionCard.restoredAt) {
        summary += `\n[user restored checkpoint ${m.actionCard.checkpointId}]`;
      }
      if (m.actionCard.reappliedAt) {
        summary += `\n[user re-applied checkpoint ${m.actionCard.checkpointId}]`;
      }
    }
    if (summary.length > 600) {
      summary = `${summary.slice(0, 597)}…`;
    }
    return { role: m.role, summary: summary || "(empty)" };
  });
}
