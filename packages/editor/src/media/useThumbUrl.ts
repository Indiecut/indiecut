import { useEffect, useState } from "react";
import { resolveMediaAbsolutePath } from "../project/mediaPath";
import { toUint8Array } from "./bytes";
import { getPlatform } from "@indiecut/platform";

function bytesToJpegDataUrl(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** Load a project-relative thumb as a data URL (reliable in Electron). */
export function useThumbUrl(
  projectPath: string,
  thumbPath: string | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const bridge = getPlatform();
      if (!projectPath || !thumbPath || !bridge) {
        setUrl(null);
        return;
      }
      try {
        const abs = resolveMediaAbsolutePath({
          projectPath,
          storedPath: thumbPath,
        });
        const raw = await bridge.fs.readFile(abs);
        const bytes = toUint8Array(raw);
        if (bytes.byteLength === 0) {
          throw new Error("Empty thumb file");
        }
        const dataUrl = bytesToJpegDataUrl(bytes);
        if (!cancelled) setUrl(dataUrl);
      } catch (err) {
        console.warn("Failed to load thumb", thumbPath, err);
        if (!cancelled) setUrl(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectPath, thumbPath]);

  return url;
}
