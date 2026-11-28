import type { ChatAgentStep } from "../persistence/chatTranscript";

type AgentStepsProps = {
  steps: ChatAgentStep[];
  /** Only show while the turn is in flight — current action only, not history. */
  live?: boolean;
};

/** Pick the active step: prefer running, else the latest one while still live. */
function currentStep(steps: ChatAgentStep[]): ChatAgentStep | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]!.status === "running") return steps[i]!;
  }
  return steps.length > 0 ? steps[steps.length - 1]! : null;
}

export function AgentSteps({ steps, live }: AgentStepsProps) {
  // Steps stay on the message for persistence; UI only shows live progress.
  if (!live || !steps.length) return null;
  const step = currentStep(steps);
  if (!step) return null;
  const label = step.label.trim() || step.kind;

  return (
    <div className="chat-agent-steps chat-agent-steps--live" aria-live="polite">
      <div
        className={`chat-agent-steps__item chat-agent-steps__item--${step.status} chat-agent-steps__item--${step.kind}`}
      >
        <span className="chat-agent-steps__icon" aria-hidden>
          {step.status === "running" ? (
            <span className="chat-agent-steps__spinner" />
          ) : step.status === "error" ? (
            "!"
          ) : (
            "…"
          )}
        </span>
        <span className="chat-agent-steps__body">
          <span className="chat-agent-steps__label">{label}</span>
        </span>
      </div>
    </div>
  );
}
