/** Fixed Gemini image model — no Settings picker in v1. */
export const GEMINI_IMAGE_MODEL = "gemini-nano-banana-2.1";

export type GeminiImageMime = "image/png" | "image/jpeg" | "image/webp";

export type GeminiImageResult = {
  bytes: ArrayBuffer;
  mimeType: GeminiImageMime;
};

export type GenerateImageOpts = {
  apiKey: string;
  prompt: string;
  /** Aspect ratio hint, e.g. "16:9". */
  aspectRatio?: string;
  signal?: AbortSignal;
};

export type EditImageOpts = {
  apiKey: string;
  prompt: string;
  imageBytes: ArrayBuffer;
  imageMimeType: GeminiImageMime | "image/gif";
  aspectRatio?: string;
  signal?: AbortSignal;
};

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string };
};

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function normalizeMime(raw: string | undefined): GeminiImageMime | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().split(";")[0]!.trim();
  if (lower === "image/png") return "image/png";
  if (lower === "image/jpeg" || lower === "image/jpg") return "image/jpeg";
  if (lower === "image/webp") return "image/webp";
  return null;
}

function extractImage(parts: GeminiPart[] | undefined): GeminiImageResult {
  if (!parts?.length) {
    throw new Error("Gemini returned no image parts");
  }
  for (const part of parts) {
    const mime = normalizeMime(part.inlineData?.mimeType);
    const data = part.inlineData?.data;
    if (mime && data) {
      return { bytes: base64ToArrayBuffer(data), mimeType: mime };
    }
  }
  throw new Error("Gemini response did not include an image");
}

async function callGenerateContent(args: {
  apiKey: string;
  parts: GeminiPart[];
  aspectRatio?: string;
  signal?: AbortSignal;
}): Promise<GeminiImageResult> {
  const key = args.apiKey.trim();
  if (!key) {
    throw new Error("Gemini API key is missing");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["TEXT", "IMAGE"],
  };
  if (args.aspectRatio) {
    generationConfig.imageConfig = { aspectRatio: args.aspectRatio };
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: args.parts,
      },
    ],
    generationConfig,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: args.signal,
  });

  let json: GeminiGenerateResponse;
  try {
    json = (await res.json()) as GeminiGenerateResponse;
  } catch {
    throw new Error(`Gemini HTTP ${res.status}: invalid JSON`);
  }

  if (!res.ok) {
    const msg = json.error?.message || `Gemini HTTP ${res.status}`;
    throw new Error(msg);
  }

  const parts = json.candidates?.[0]?.content?.parts;
  return extractImage(parts);
}

/** Text → still. Never logs the API key. */
export async function generateImage(
  opts: GenerateImageOpts,
): Promise<GeminiImageResult> {
  const prompt = opts.prompt.trim();
  if (!prompt) throw new Error("Image prompt is required");

  return callGenerateContent({
    apiKey: opts.apiKey,
    parts: [{ text: prompt }],
    aspectRatio: opts.aspectRatio,
    signal: opts.signal,
  });
}

/** Source plate + edit instruction → still. */
export async function editImage(
  opts: EditImageOpts,
): Promise<GeminiImageResult> {
  const prompt = opts.prompt.trim();
  if (!prompt) throw new Error("Edit prompt is required");
  if (!opts.imageBytes || opts.imageBytes.byteLength === 0) {
    throw new Error("Source image bytes are required");
  }

  return callGenerateContent({
    apiKey: opts.apiKey,
    parts: [
      {
        inlineData: {
          mimeType: opts.imageMimeType,
          data: bufferToBase64(opts.imageBytes),
        },
      },
      { text: prompt },
    ],
    aspectRatio: opts.aspectRatio,
    signal: opts.signal,
  });
}

/** Map project aspect / dimensions to a Gemini-supported ratio string. */
export function geminiAspectFromProject(opts: {
  aspectRatio?: string;
  width: number;
  height: number;
}): string {
  const supported = new Set([
    "21:9",
    "16:9",
    "4:3",
    "3:2",
    "1:1",
    "9:16",
    "3:4",
    "2:3",
    "5:4",
    "4:5",
  ]);
  const ar = (opts.aspectRatio ?? "").trim();
  if (supported.has(ar)) return ar;

  const w = Math.max(1, opts.width);
  const h = Math.max(1, opts.height);
  const r = w / h;
  const candidates: Array<{ label: string; value: number }> = [
    { label: "21:9", value: 21 / 9 },
    { label: "16:9", value: 16 / 9 },
    { label: "5:4", value: 5 / 4 },
    { label: "4:3", value: 4 / 3 },
    { label: "3:2", value: 3 / 2 },
    { label: "1:1", value: 1 },
    { label: "4:5", value: 4 / 5 },
    { label: "3:4", value: 3 / 4 },
    { label: "2:3", value: 2 / 3 },
    { label: "9:16", value: 9 / 16 },
  ];
  let best = candidates[0]!;
  let bestDist = Math.abs(r - best.value);
  for (const c of candidates) {
    const d = Math.abs(r - c.value);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best.label;
}
