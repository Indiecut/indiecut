import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_TTS_MODEL,
  generateSpeech,
} from "./elevenlabs";

afterEach(() => {
  mock.restoreAll();
});

describe("generateSpeech", () => {
  it("rejects empty key", async () => {
    await assert.rejects(
      () =>
        generateSpeech({
          apiKey: "  ",
          voiceId: "voice_1",
          text: "Hello",
        }),
      /missing/i,
    );
  });

  it("rejects empty voice id", async () => {
    await assert.rejects(
      () =>
        generateSpeech({
          apiKey: "key",
          voiceId: "  ",
          text: "Hello",
        }),
      /voice id/i,
    );
  });

  it("rejects empty text", async () => {
    await assert.rejects(
      () =>
        generateSpeech({
          apiKey: "key",
          voiceId: "voice_1",
          text: "  ",
        }),
      /text/i,
    );
  });

  it("POSTs TTS with voice path, xi-api-key, and model_id", async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        assert.match(url, /\/v1\/text-to-speech\/voice_abc/);
        assert.match(url, new RegExp(`output_format=${ELEVENLABS_OUTPUT_FORMAT}`));
        assert.equal(init?.method, "POST");
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers["xi-api-key"], "test-key");
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          text: string;
          model_id: string;
        };
        assert.equal(body.text, "Welcome back");
        assert.equal(body.model_id, ELEVENLABS_TTS_MODEL);
        return new Response(audioBytes, {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    );

    const result = await generateSpeech({
      apiKey: "test-key",
      voiceId: "voice_abc",
      text: "Welcome back",
    });
    assert.equal(result.mimeType, "audio/mpeg");
    assert.equal(result.bytes.byteLength, 4);
  });

  it("surfaces HTTP error messages", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ detail: { message: "invalid voice" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await assert.rejects(
      () =>
        generateSpeech({
          apiKey: "k",
          voiceId: "v",
          text: "hi",
        }),
      /invalid voice/i,
    );
  });

  it("rejects empty audio body", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(new ArrayBuffer(0), { status: 200 }),
    );
    await assert.rejects(
      () =>
        generateSpeech({
          apiKey: "k",
          voiceId: "v",
          text: "hi",
        }),
      /empty audio/i,
    );
  });
});
