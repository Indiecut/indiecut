import { getPlatform } from "@indiecut/platform";
import { toArrayBuffer, toUint8Array } from "../../media/bytes";

const THUMB_MAX_WIDTH = 160;
const THUMB_QUALITY = 0.8;

/**
 * Downscale generative result bytes to a small JPEG under ai/thumbs/.
 * Returns project-relative path or null on failure.
 */
export async function writeActionThumb(args: {
  projectPath: string;
  cardId: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<string | null> {
  const bridge = getPlatform();
  if (!bridge?.fs?.writeProjectFile) return null;

  try {
    const blob = new Blob([toArrayBuffer(args.bytes)], {
      type: args.mimeType || "image/png",
    });
    const bitmap = await createImageBitmap(blob);
    try {
      const scale =
        bitmap.width > THUMB_MAX_WIDTH ? THUMB_MAX_WIDTH / bitmap.width : 1;
      const tw = Math.max(1, Math.round(bitmap.width * scale));
      const th = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(tw, th);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, tw, th);
      const out = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: THUMB_QUALITY,
      });
      const jpeg = toUint8Array(await out.arrayBuffer());
      const relPath = `ai/thumbs/${args.cardId}.jpg`;
      await bridge.fs.writeProjectFile(args.projectPath, relPath, jpeg);
      return relPath;
    } finally {
      bitmap.close();
    }
  } catch (err) {
    console.warn("Failed to write AI action thumb", err);
    return null;
  }
}
