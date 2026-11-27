export interface IndieCutDialogBridge {
  pickProjectFolder: () => Promise<string | null>;
  createProjectFolder: (suggestedName?: string) => Promise<string | null>;
  pickMediaFiles: () => Promise<string[]>;
  pickExportFolder: () => Promise<string | null>;
}

export interface IndieCutExportStreamBridge {
  open: (opts: {
    folder: string;
    title: string;
    overwrite?: boolean;
    /** File extension without dot; defaults to mp4. Use m4a for audio-only. */
    extension?: string;
  }) => Promise<{ streamId: string; tmpPath: string; finalPath: string }>;
  write: (
    streamId: string,
    position: number,
    data: Uint8Array,
  ) => Promise<{ written: number }>;
  close: (
    streamId: string,
    options?: { abort?: boolean },
  ) => Promise<{
    ok: boolean;
    aborted?: boolean;
    finalPath?: string;
    bytesWritten?: number;
    error?: string;
  }>;
}

export interface IndieCutFsBridge {
  ensureProjectLayout: (projectPath: string) => Promise<void>;
  readProjectJson: (projectPath: string) => Promise<string>;
  writeProjectJson: (projectPath: string, jsonText: string) => Promise<void>;
  pathExists: (targetPath: string) => Promise<boolean>;
  copyFile: (sourcePath: string, destPath: string) => Promise<string>;
  readFile: (filePath: string) => Promise<Uint8Array>;
  unlink: (filePath: string) => Promise<{ ok: boolean; missing?: boolean }>;
  /** Recursively delete a directory (project folder). Missing path is ok. */
  removeDirectory: (
    dirPath: string,
  ) => Promise<{ ok: boolean; missing?: boolean }>;
  writeFile: (
    filePath: string,
    data: Uint8Array | ArrayBuffer | string,
    encoding?: "utf8",
  ) => Promise<string>;
  writeProjectFile: (
    projectPath: string,
    relativePath: string,
    data: Uint8Array | ArrayBuffer | string,
    encoding?: "utf8",
  ) => Promise<string>;
  listProjectDir: (
    projectPath: string,
    relativeDir: string,
  ) => Promise<string[]>;
}

export interface IndieCutShellBridge {
  openPath: (targetPath: string) => Promise<boolean>;
  showItemInFolder: (targetPath: string) => Promise<boolean>;
  /**
   * Browser / PWA: save or download a finished export once.
   * Desktop may omit this (uses openPath / Finder instead).
   */
  downloadPath?: (targetPath: string) => Promise<boolean>;
}

export interface IndieCutPowerBridge {
  blockSleep: () => Promise<{ id: number }>;
  allowSleep: () => Promise<{ ok: boolean }>;
}

/** Platform UI/feature flags so the editor can hide desktop-only actions. */
export interface IndieCutCapabilities {
  /** Reveal file in Finder/Explorer (desktop only). */
  revealInFolder: boolean;
  /** Open file with the OS default app (desktop only). */
  openLocalPath: boolean;
}

/** Claude model allowlist ids. */
export type ClaudeModelId = "claude-sonnet-5-5" | "claude-haiku-5-5";

/** App-scoped AI secrets — never stored in project folders. */
export type AiSecretsV1 = {
  version: 1;
  anthropicKey?: string;
  geminiKey?: string;
  elevenLabsKey?: string;
  elevenLabsVoiceId?: string;
  /**
   * Last ElevenLabs sound-generation probe result.
   * `false` disables the SFX skill even if an API key is present.
   */
  elevenLabsSfxOk?: boolean;
  claudeModelId?: ClaudeModelId;
};

export interface IndieCutSecretsBridge {
  getAiSecrets: () => Promise<AiSecretsV1 | null>;
  setAiSecrets: (next: AiSecretsV1) => Promise<void>;
}

/** Anthropic Messages API content blocks (Phase 2 tool + vision). */
export type AnthropicBridgeContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: {
            type: "base64";
            media_type: string;
            data: string;
          };
        }
      | {
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, unknown>;
        }
      | {
          type: "tool_result";
          tool_use_id: string;
          content:
            | string
            | Array<
                | { type: "text"; text: string }
                | {
                    type: "image";
                    source: {
                      type: "base64";
                      media_type: string;
                      data: string;
                    };
                  }
              >;
          is_error?: boolean;
        }
    >;

/**
 * Optional Anthropic streaming proxy (desktop). Avoids browser CORS;
 * web may omit and use renderer fetch.
 */
export type IndieCutAiStreamUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type IndieCutAiStreamEvent = {
  streamId: string;
  type: "delta" | "tool_use" | "usage" | "done" | "error";
  text?: string;
  error?: string;
  toolUse?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  usage?: IndieCutAiStreamUsage;
};

export interface IndieCutAiBridge {
  streamAnthropic: (opts: {
    streamId: string;
    apiKey: string;
    model: string;
    system: string;
    messages: Array<{
      role: "user" | "assistant";
      content: AnthropicBridgeContent;
    }>;
    tools?: Array<{
      name: string;
      description: string;
      input_schema: Record<string, unknown>;
    }>;
  }) => Promise<void>;
  abortAnthropic: (streamId: string) => Promise<void>;
  /** Lightweight API-key check (desktop; avoids CORS). */
  probeAnthropic?: (opts: {
    apiKey: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onAnthropicEvent: (
    listener: (event: IndieCutAiStreamEvent) => void,
  ) => () => void;
}

/** Desktop window chrome helpers (Electron). */
export interface IndieCutWindowBridge {
  isFullScreen: () => Promise<boolean>;
  onFullScreenChange: (listener: (fullScreen: boolean) => void) => () => void;
}

export interface IndieCutBridge {
  version: string;
  dialog: IndieCutDialogBridge;
  exportStream: IndieCutExportStreamBridge;
  shell: IndieCutShellBridge;
  fs: IndieCutFsBridge;
  power?: IndieCutPowerBridge;
  capabilities?: IndieCutCapabilities;
  secrets?: IndieCutSecretsBridge;
  ai?: IndieCutAiBridge;
  window?: IndieCutWindowBridge;
  getPathForFile: (file: File) => string;
}
