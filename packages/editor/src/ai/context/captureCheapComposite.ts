import { getEditorStore } from "../../store/editorStore";
import { capturePreviewComposite } from "../../preview/previewWorkerClient";
import type { CheapCompositeAttachment } from "./types";

/** Cheap turn attach — token cost tracks dimensions more than JPEG quality. */
const CHEAP_MAX_WIDTH = 640;
const CHEAP_QUALITY = 0.65;

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Capture a downscaled composite of the current preview stage.
 * Returns null if the preview worker is unavailable.
 */
export async function captureCheapComposite(): Promise<CheapCompositeAttachment | null> {
  const playheadMs = getEditorStore().project.playheadMs;
  try {
    const captured = await capturePreviewComposite({
      maxWidth: CHEAP_MAX_WIDTH,
      quality: CHEAP_QUALITY,
      mimeType: "image/jpeg",
    });
    return {
      kind: "composite",
      playheadMs,
      width: captured.width,
      height: captured.height,
      mimeType: captured.mimeType,
      base64: bufferToBase64(captured.buffer),
    };
  } catch (err) {
    console.warn("captureCheapComposite:", err);
    return null;
  }
}
