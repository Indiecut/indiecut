import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { MediaAssetRef } from "../project/types";
import { toArrayBuffer, toUint8Array } from "./bytes";
import { getPlatform } from "@indiecut/platform";

export type CropPreviewSession = {
  kind: "video" | "image";
  width: number;
  height: number;
  /** Draw the frame at sourceSec into `target` (video) or the full image. */
  draw: (
    target: HTMLCanvasElement,
    sourceSec: number,
  ) => Promise<{ width: number; height: number }>;
  dispose: () => Promise<void>;
};

/**
 * Open a mediabunny / image decode session for the crop dialog.
 * Prefer proxy for video when available (same as live preview).
 */
export async function openCropPreviewSession(args: {
  asset: MediaAssetRef;
  projectPath: string;
}): Promise<CropPreviewSession> {
  const bridge = getPlatform();
  if (!bridge?.fs) {
    throw new Error("IndieCut bridge unavailable — open in Electron");
  }

  const { asset, projectPath } = args;

  if (asset.kind === "image") {
    const abs = resolveMediaAbsolutePath({
      projectPath,
      storedPath: asset.path,
    });
    const bytes = toUint8Array(await bridge.fs.readFile(abs));
    const blob = new Blob([toArrayBuffer(bytes)]);
    const bitmap = await createImageBitmap(blob);
    const width = Math.max(1, bitmap.width);
    const height = Math.max(1, bitmap.height);
    let disposed = false;
    return {
      kind: "image",
      width,
      height,
      draw: async (target) => {
        if (disposed) throw new Error("Crop preview disposed");
        if (target.width !== width || target.height !== height) {
          target.width = width;
          target.height = height;
        }
        const ctx = target.getContext("2d");
        if (!ctx) throw new Error("2D context unavailable");
        ctx.drawImage(bitmap, 0, 0);
        return { width, height };
      },
      dispose: async () => {
        disposed = true;
        bitmap.close();
      },
    };
  }

  // Prefer master for crop — proxies are often letterboxed to 16:9 and
  // would make TikTok / portrait sources look like YouTube in the dialog.
  const tryPaths = [asset.path, asset.proxyPath].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  const uniquePaths = [...new Set(tryPaths)];
  let lastError: unknown = null;

  for (const storedPath of uniquePaths) {
    let input: Input | null = null;
    try {
      const abs = resolveMediaAbsolutePath({ projectPath, storedPath });
      const bytes = toUint8Array(await bridge.fs.readFile(abs));
      const blob = new Blob([toArrayBuffer(bytes)]);
      input = new Input({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      });
      const track = await input.getPrimaryVideoTrack();
      if (!track) {
        await input.dispose();
        input = null;
        throw new Error("No video track for crop preview");
      }
      const sink = new CanvasSink(track, { poolSize: 2 });
      const probe = await sink.getCanvas(0);
      if (!probe?.canvas) {
        await input.dispose();
        input = null;
        throw new Error("Could not decode crop preview frame");
      }
      const width = Math.max(1, probe.canvas.width || asset.width || 1);
      const height = Math.max(1, probe.canvas.height || asset.height || 1);
      const opened = input;
      input = null; // ownership transferred to session
      let disposed = false;
      return {
        kind: "video",
        width,
        height,
        draw: async (target, sourceSec) => {
          if (disposed) throw new Error("Crop preview disposed");
          const wrapped = await sink.getCanvas(Math.max(0, sourceSec));
          if (!wrapped?.canvas) throw new Error("Could not decode crop frame");
          const w = Math.max(1, wrapped.canvas.width);
          const h = Math.max(1, wrapped.canvas.height);
          if (target.width !== w || target.height !== h) {
            target.width = w;
            target.height = h;
          }
          const ctx = target.getContext("2d");
          if (!ctx) throw new Error("2D context unavailable");
          ctx.drawImage(wrapped.canvas, 0, 0, w, h);
          return { width: w, height: h };
        },
        dispose: async () => {
          disposed = true;
          await opened.dispose();
        },
      };
    } catch (err) {
      lastError = err;
      if (input) {
        try {
          await Promise.resolve(input.dispose());
        } catch {
          /* ignore */
        }
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not open crop preview");
}
