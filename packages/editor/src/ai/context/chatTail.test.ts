import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage } from "../persistence/chatTranscript";
import { buildChatTail } from "./chatTail";

describe("buildChatTail", () => {
  it("caps to last N turns and summarizes action cards", () => {
    const messages: ChatMessage[] = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg ${i}`,
      createdAt: new Date().toISOString(),
    }));
    messages[7]!.actionCard = {
      id: "c1",
      summary: "Updated text color",
      checkpointId: "cp1",
      createdAt: new Date().toISOString(),
      restoredAt: new Date().toISOString(),
    };

    const tail = buildChatTail(messages, 4);
    assert.equal(tail.length, 4);
    assert.equal(tail[0]!.summary, "msg 4");
    assert.match(tail[3]!.summary, /Action Card/);
    assert.match(tail[3]!.summary, /restored checkpoint cp1/);
  });

  it("notes reference images on user turns", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "match this style",
        createdAt: new Date().toISOString(),
        images: [
          {
            id: "img1",
            name: "ref.jpg",
            width: 800,
            height: 600,
            mimeType: "image/jpeg",
            base64: "abc",
          },
        ],
      },
    ];
    const tail = buildChatTail(messages, 4);
    assert.match(tail[0]!.summary, /match this style/);
    assert.match(tail[0]!.summary, /1 reference image attached/);
  });
});
