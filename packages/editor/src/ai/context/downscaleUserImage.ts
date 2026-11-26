import type { UserReferenceAttachment } from "./types";

/** Long edge for user reference images sent to Claude. */
export const USER_IMAGE_MAX_WIDTH = 1024;
const USER_IMAGE_QUALITY = 0.72;
export const MAX_USER_REFERENCE_IMAGES = 3;

function newAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function isSupportedImageFile(file: File | Blob): boolean {
  const type = file.type || "";
  if (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp" ||
    type === "image/gif"
  ) {
    return true;
  }
  if (file instanceof File) {
    const name = file.name.toLowerCase();
    return (
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png") ||
      name.endsWith(".webp") ||
      name.endsWith(".gif")
    );
  }
  return false;
}

/**
 * Downscale a user-picked/pasted image for Claude vision.
 * Always encodes JPEG so chat payloads stay small.
 */
export async function downscaleUserImage(
  file: File | Blob,
  opts?: { maxWidth?: number; quality?: number; name?: string },
): Promise<UserReferenceAttachment> {
  if (!isSupportedImageFile(file)) {
    throw new Error("Unsupported image type (use JPEG, PNG, WebP, or GIF)");
  }

  const maxWidth = Math.min(
    1920,
    Math.max(64, Math.round(opts?.maxWidth ?? USER_IMAGE_MAX_WIDTH)),
  );
  const quality = Math.min(
    0.92,
    Math.max(0.4, opts?.quality ?? USER_IMAGE_QUALITY),
  );
  const name =
    opts?.name ||
    (file instanceof File && file.name ? file.name : "reference.jpg");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create canvas for image downscale");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality,
    });
    const base64 = bufferToBase64(await blob.arrayBuffer());
    return {
      kind: "user_reference",
      id: newAttachmentId(),
      name,
      width,
      height,
      mimeType: "image/jpeg",
      base64,
    };
  } finally {
    bitmap.close();
  }
}
