import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_SFX_MODEL,
  ELEVENLABS_STT_MODEL,
  ELEVENLABS_TTS_MODEL,
  encodeMonoWavPcm16,
  generateSoundEffect,
  generateSpeech,
  transcribeSpeech,
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

describe("generateSoundEffect", () => {
  it("rejects empty key and text", async () => {
    await assert.rejects(
      () => generateSoundEffect({ apiKey: " ", text: "rain" }),
      /missing/i,
    );
    await assert.rejects(
      () => generateSoundEffect({ apiKey: "key", text: "  " }),
      /description/i,
    );
  });

  it("POSTs sound-generation with SFX model", async () => {
    const audioBytes = new Uint8Array([9, 8, 7]).buffer;
    mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        assert.match(url, /\/v1\/sound-generation/);
        assert.match(url, new RegExp(`output_format=${ELEVENLABS_OUTPUT_FORMAT}`));
        assert.equal(init?.method, "POST");
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers["xi-api-key"], "sfx-key");
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          text: string;
          model_id: string;
          duration_seconds?: number;
        };
        assert.equal(body.text, "Soft rain on glass");
        assert.equal(body.model_id, ELEVENLABS_SFX_MODEL);
        assert.equal(body.duration_seconds, 3);
        return new Response(audioBytes, {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    );

    const result = await generateSoundEffect({
      apiKey: "sfx-key",
      text: "Soft rain on glass",
      durationSeconds: 3,
    });
    assert.equal(result.mimeType, "audio/mpeg");
    assert.equal(result.bytes.byteLength, 3);
  });
});

describe("encodeMonoWavPcm16", () => {
  it("writes a RIFF header and sample payload", () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const buf = encodeMonoWavPcm16(samples, 16000);
    const view = new DataView(buf);
    assert.equal(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), "RIFF");
    assert.equal(view.getUint32(24, true), 16000);
    assert.equal(buf.byteLength, 44 + samples.length * 2);
  });
});

describe("transcribeSpeech", () => {
  it("rejects empty key and empty samples", async () => {
    await assert.rejects(
      () =>
        transcribeSpeech({
          apiKey: " ",
          samples: new Float32Array([0.1]),
        }),
      /missing/i,
    );
    await assert.rejects(
      () =>
        transcribeSpeech({
          apiKey: "key",
          samples: new Float32Array(0),
        }),
      /empty/i,
    );
  });

  it("POSTs multipart STT with scribe model and maps word timings", async () => {
    mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        assert.match(url, /\/v1\/speech-to-text$/);
        assert.equal(init?.method, "POST");
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers["xi-api-key"], "stt-key");
        assert.ok(init?.body instanceof FormData);
        const form = init.body as FormData;
        assert.equal(form.get("model_id"), ELEVENLABS_STT_MODEL);
        assert.equal(form.get("timestamps_granularity"), "word");
        assert.equal(form.get("language_code"), "en");
        assert.ok(form.get("file") instanceof Blob);
        return Response.json({
          text: "Hello world",
          language_code: "en",
          words: [
            { text: "Hello", type: "word", start: 0.1, end: 0.4 },
            { text: " ", type: "spacing", start: 0.4, end: 0.45 },
            { text: "world", type: "word", start: 0.45, end: 0.9 },
          ],
        });
      },
    );

    const result = await transcribeSpeech({
      apiKey: "stt-key",
      samples: new Float32Array(1600),
      sampleRate: 16000,
      language: "en",
    });
    assert.equal(result.text, "Hello world");
    assert.equal(result.words.length, 2);
    assert.equal(result.words[0]?.text, "Hello");
    assert.equal(result.words[0]?.startSec, 0.1);
    assert.equal(result.words[1]?.text, "world");
  });
});
