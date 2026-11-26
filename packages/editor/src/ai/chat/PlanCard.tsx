import { useState } from "react";
import type { ChatPendingPlan } from "../persistence/chatTranscript";
import { useChatStore } from "./chatStore";

type PlanCardProps = {
  messageId: string;
  plan: ChatPendingPlan;
  stale?: boolean;
};

export function PlanCardView({ messageId, plan, stale }: PlanCardProps) {
  const confirmPendingPlan = useChatStore((s) => s.confirmPendingPlan);
  const cancelPendingPlan = useChatStore((s) => s.cancelPendingPlan);
  const streaming = useChatStore((s) => s.streaming);
  const [error, setError] = useState<string | null>(null);

  const cancelled = Boolean(plan.cancelledAt);
  const canRun = !cancelled && !stale && !streaming;

  const onRun = () => {
    setError(null);
    void confirmPendingPlan(messageId).catch((err) => {
      setError(err instanceof Error ? err.message : "Run plan failed");
    });
  };

  const onCancel = () => {
    setError(null);
    cancelPendingPlan(messageId);
  };

  return (
    <div className="chat-plan-card">
      <div className="chat-plan-card__summary">{plan.summary}</div>
      {plan.steps.length > 0 ? (
        <ul className="chat-plan-card__steps">
          {plan.steps.map((step, i) => (
            <li key={`${step.tool}-${i}`}>{step.summary}</li>
          ))}
        </ul>
      ) : null}
      <div className="chat-plan-card__actions">
        {cancelled ? (
          <span className="chat-plan-card__status">Cancelled</span>
        ) : stale ? (
          <span className="chat-plan-card__status">Stale</span>
        ) : (
          <>
            <button
              type="button"
              className="chat-plan-card__btn chat-plan-card__btn--run"
              disabled={!canRun}
              onClick={onRun}
            >
              Run plan
            </button>
            <button
              type="button"
              className="chat-plan-card__btn"
              disabled={!canRun}
              onClick={onCancel}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {error ? (
        <p className="chat-plan-card__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
