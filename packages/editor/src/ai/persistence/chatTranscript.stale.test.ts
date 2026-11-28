import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  markMessagesStaleAfter,
  markMessagesStaleFrom,
  turnStartIndex,
  type ChatMessage,
} from "./chatTranscript";

function msg(
  id: string,
  role: "user" | "assistant",
  withCard = false,
): ChatMessage {
  const m: ChatMessage = {
    id,
    role,
    content: id,
    createdAt: new Date().toISOString(),
  };
  if (withCard) {
    m.actionCard = {
      id: `c-${id}`,
      summary: "edit",
      checkpointId: `cp-${id}`,
      createdAt: m.createdAt,
    };
  }
  return m;
}

describe("stale after undo", () => {
  it("greys the user prompt with the action card and everything after", () => {
    const messages = [
      msg("u1", "user"),
      msg("a1", "assistant", true),
      msg("u2", "user"),
      msg("a2", "assistant", true),
    ];
    assert.equal(turnStartIndex(messages, "a1"), 0);
    const next = markMessagesStaleFrom(messages, "a1");
    assert.equal(next[0]?.stale, true);
    assert.equal(next[1]?.stale, true);
    assert.equal(next[2]?.stale, true);
    assert.equal(next[3]?.stale, true);
  });

  it("undo on later card keeps earlier turn active", () => {
    const messages = [
      msg("u1", "user"),
      msg("a1", "assistant", true),
      msg("u2", "user"),
      msg("a2", "assistant", true),
    ];
    const next = markMessagesStaleFrom(messages, "a2");
    assert.equal(next[0]?.stale, undefined);
    assert.equal(next[1]?.stale, undefined);
    assert.equal(next[2]?.stale, true);
    assert.equal(next[3]?.stale, true);
  });

  it("re-apply clears the turn and greys only after", () => {
    const messages = markMessagesStaleFrom(
      [
        msg("u1", "user"),
        msg("a1", "assistant", true),
        msg("u2", "user"),
        msg("a2", "assistant", true),
      ],
      "a1",
    );
    const next = markMessagesStaleAfter(messages, "a1");
    assert.equal(next[0]?.stale, undefined);
    assert.equal(next[1]?.stale, undefined);
    assert.equal(next[2]?.stale, true);
    assert.equal(next[3]?.stale, true);
  });
});
