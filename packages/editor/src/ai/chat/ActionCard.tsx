import { useState } from "react";
import type {
  ChatActionAffectedItem,
  ChatActionCard,
} from "../persistence/chatTranscript";
import {
  loadCheckpoint,
  projectHeadersEqual,
  restoreProjectEditSnapshot,
  tracksEqual,
} from "../tools/snapshots";
import { snapshotProjectHeader } from "../tools/mutationBatch";
import { useThumbUrl } from "../../media/useThumbUrl";
import { findClip, getEditorStore, useEditorStore } from "../../store/editorStore";
import { useChatStore } from "./chatStore";

type ActionCardProps = {
  messageId: string;
  card: ChatActionCard;
  /** Soft-invalidated by an earlier Restore — show Re-apply only. */
  stale?: boolean;
};

function selectAffectedClip(item: ChatActionAffectedItem): boolean {
  const store = getEditorStore();
  const found = findClip(store.project.tracks, item.clipId);
  if (!found) return false;
  store.selectClip(item.clipId, item.trackId ?? found.track.id);
  store.setPlayheadMs(found.clip.startMs);
  return true;
}

export function ActionCardView({ messageId, card, stale }: ActionCardProps) {
  const projectPath = useChatStore((s) => s.projectPath);
  const markCardRestored = useChatStore((s) => s.markCardRestored);
  const markCardReapplied = useChatStore((s) => s.markCardReapplied);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const thumbUrl = useThumbUrl(projectPath ?? "", card.thumbRelPath);

  const affected = card.affected ?? [];

  const runRestore = async (side: "before" | "after") => {
    if (!projectPath || busy) return;
    setBusy(true);
    setError(null);
    setWarn(null);
    try {
      const cp = await loadCheckpoint(projectPath, card.checkpointId);
      if (!cp) {
        setError("Checkpoint file missing");
        return;
      }
      const store = getEditorStore();
      const currentTracks = store.project.tracks;
      const snap = side === "before" ? cp.before : cp.after;
      const reference = side === "before" ? cp.after : cp.before;
      const headerDiverged = !projectHeadersEqual(
        snapshotProjectHeader(),
        reference.project,
      );
      const diverged =
        !tracksEqual(currentTracks, reference.tracks) || headerDiverged;
      if (diverged) {
        const message =
          side === "before"
            ? "Also undoes later timeline changes. Continue?"
            : "Project has moved past this checkpoint. Re-apply anyway?";
        setWarn(
          side === "before"
            ? "Also undoes later timeline changes."
            : "Project has moved past this checkpoint.",
        );
        if (typeof window !== "undefined" && !window.confirm(message)) {
          return;
        }
      }
      const label =
        side === "before"
          ? `AI Undo: ${card.summary}`
          : `AI Re-apply: ${card.summary}`;
      restoreProjectEditSnapshot(snap, label);
      if (side === "before") markCardRestored(messageId);
      else markCardReapplied(messageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setBusy(false);
    }
  };

  const onSelectAffected = (item: ChatActionAffectedItem) => {
    setError(null);
    if (!selectAffectedClip(item)) {
      setError("Clip no longer on the timeline");
    }
  };

  return (
    <div className="chat-action-card">
      {thumbUrl ? (
        <img
          className="chat-action-card__thumb"
          src={thumbUrl}
          alt=""
          width={160}
          height={90}
        />
      ) : null}
      {affected.length > 0 ? (
        <ul className="chat-action-card__affected" aria-label="Affected clips">
          {affected.map((item, index) => {
            const active = item.clipId === selectedClipId;
            return (
              <li key={`${item.clipId}-${index}`}>
                <button
                  type="button"
                  className={
                    active
                      ? "chat-action-card__affected-btn chat-action-card__affected-btn--active"
                      : "chat-action-card__affected-btn"
                  }
                  title="Select on timeline"
                  onClick={() => onSelectAffected(item)}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="chat-action-card__summary">{card.summary}</div>
      )}
      {card.detail ? (
        <p className="chat-action-card__meta">{card.detail}</p>
      ) : null}
      <div className="chat-action-card__actions">
        {!stale ? (
          <button
            type="button"
            className="chat-action-card__btn"
            disabled={busy}
            title="Undo this AI edit"
            onClick={() => void runRestore("before")}
          >
            Undo changes
          </button>
        ) : (
          <button
            type="button"
            className="chat-action-card__btn"
            disabled={busy}
            title="Bring back this edit"
            onClick={() => void runRestore("after")}
          >
            Re-apply
          </button>
        )}
      </div>
      {warn ? <p className="chat-action-card__warn">{warn}</p> : null}
      {error ? (
        <p className="chat-action-card__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
