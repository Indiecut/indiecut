import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  editImage,
  geminiAspectFromProject,
  generateImage,
  GEMINI_IMAGE_MODEL,
} from "./gemini";

function tinyPngBase64(): string {
  // 1×1 transparent PNG
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

afterEach(() => {
  mock.restoreAll();
});

describe("geminiAspectFromProject", () => {
  it("passes through supported aspect labels", () => {
    assert.equal(
      geminiAspectFromProject({ aspectRatio: "9:16", width: 1080, height: 1920 }),
      "9:16",
    );
  });

  it("nearest-matches from dimensions", () => {
    assert.equal(
      geminiAspectFromProject({ aspectRatio: "custom", width: 1920, height: 1080 }),
      "16:9",
    );
  });
});

describe("generateImage", () => {
  it("rejects empty key", async () => {
    await assert.rejects(
      () => generateImage({ apiKey: "  ", prompt: "a cat" }),
      /missing/i,
    );
  });

  it("rejects empty prompt", async () => {
    await assert.rejects(
      () => generateImage({ apiKey: "k", prompt: "  " }),
      /prompt/i,
    );
  });

  it("parses inline image from generateContent", async () => {
    const b64 = tinyPngBase64();
    mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      assert.match(url, new RegExp(GEMINI_IMAGE_MODEL));
      assert.match(url, /key=test-key/);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "ok" },
                  { inlineData: { mimeType: "image/png", data: b64 } },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await generateImage({
      apiKey: "test-key",
      prompt: "a red square",
      aspectRatio: "1:1",
    });
    assert.equal(result.mimeType, "image/png");
    assert.ok(result.bytes.byteLength > 0);
  });

  it("surfaces non-image responses", async () => {
    mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "nope" }] } }],
        }),
        { status: 200 },
      ),
    );
    await assert.rejects(
      () => generateImage({ apiKey: "k", prompt: "x" }),
      /did not include an image/i,
    );
  });
});

describe("editImage", () => {
  it("sends source plate as inlineData", async () => {
    const b64 = tinyPngBase64();
    const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

    mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        contents: Array<{ parts: Array<{ inlineData?: { data?: string }; text?: string }> }>;
      };
      const parts = body.contents[0]!.parts;
      assert.ok(parts.some((p) => p.inlineData?.data));
      assert.ok(parts.some((p) => p.text === "make it blue"));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "image/png", data: b64 } }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const result = await editImage({
      apiKey: "k",
      prompt: "make it blue",
      imageBytes: png,
      imageMimeType: "image/png",
    });
    assert.equal(result.mimeType, "image/png");
  });
});
