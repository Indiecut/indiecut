import type { IndieCutBridge } from "@indiecut/platform";
import { setPlatform } from "@indiecut/platform";

declare global {
  interface Window {
    indiecut?: IndieCutBridge;
  }
}

/** Wire the Electron preload bridge into the shared platform runtime. */
export function installDesktopPlatform(): void {
  const bridge = window.indiecut;
  if (!bridge) {
    throw new Error(
      "Electron preload bridge missing — window.indiecut is undefined",
    );
  }
  setPlatform({
    ...bridge,
    capabilities: {
      revealInFolder: true,
      openLocalPath: true,
      cloudAi: true,
      ...bridge.capabilities,
    },
  });
}
