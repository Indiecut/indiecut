import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { MediaAssetRef } from "../project/types";
import { toArrayBuffer, toUint8Array } from "./bytes";

function mimeForPath(path: string, kind: MediaAssetRef["kind"]): string {
  const lower = path.toLowerCase();
  if (kind === "image") {
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
  }
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

/**
 * Load a media asset into a blob: URL for &lt;video&gt; / &lt;img&gt; preview.
 * Prefer proxy for video when available. Caller must revoke the URL.
 */
export async function loadMediaBlobUrl(args: {
  asset: MediaAssetRef;
  projectPath: string;
}): Promise<{ url: string; width: number; height: number }> {
  const bridge = window.indiecut;
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }

  const { asset, projectPath } = args;
  const storedPath =
    asset.kind === "video" && asset.proxyPath ? asset.proxyPath : asset.path;
  const abs = resolveMediaAbsolutePath({ projectPath, storedPath });
  const bytes = toUint8Array(await bridge.fs.readFile(abs));
  if (bytes.byteLength === 0) {
    throw new Error("Empty media file");
  }

  const mime = mimeForPath(storedPath, asset.kind);
  const blob = new Blob([toArrayBuffer(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  return {
    url,
    width: asset.width && asset.width > 0 ? asset.width : 1,
    height: asset.height && asset.height > 0 ? asset.height : 1,
  };
}
