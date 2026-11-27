const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("indiecut", {
  version: "1.4.0",
  dialog: {
    pickProjectFolder: () => ipcRenderer.invoke("dialog:pickProjectFolder"),
    createProjectFolder: (suggestedName) =>
      ipcRenderer.invoke("dialog:createProjectFolder", suggestedName),
    pickMediaFiles: () => ipcRenderer.invoke("dialog:pickMediaFiles"),
    pickExportFolder: () => ipcRenderer.invoke("dialog:pickExportFolder"),
  },
  exportStream: {
    open: (opts) => ipcRenderer.invoke("exportStream:open", opts),
    write: (streamId, position, data) =>
      ipcRenderer.invoke("exportStream:write", streamId, position, data),
    close: (streamId, options) =>
      ipcRenderer.invoke("exportStream:close", streamId, options),
  },
  shell: {
    openPath: (targetPath) => ipcRenderer.invoke("shell:openPath", targetPath),
    showItemInFolder: (targetPath) =>
      ipcRenderer.invoke("shell:showItemInFolder", targetPath),
  },
  fs: {
    ensureProjectLayout: (projectPath) =>
      ipcRenderer.invoke("fs:ensureProjectLayout", projectPath),
    readProjectJson: (projectPath) =>
      ipcRenderer.invoke("fs:readProjectJson", projectPath),
    writeProjectJson: (projectPath, jsonText) =>
      ipcRenderer.invoke("fs:writeProjectJson", projectPath, jsonText),
    pathExists: (targetPath) =>
      ipcRenderer.invoke("fs:pathExists", targetPath),
    copyFile: (sourcePath, destPath) =>
      ipcRenderer.invoke("fs:copyFile", sourcePath, destPath),
    readFile: (filePath) => ipcRenderer.invoke("fs:readFile", filePath),
    unlink: (filePath) => ipcRenderer.invoke("fs:unlink", filePath),
    removeDirectory: (dirPath) =>
      ipcRenderer.invoke("fs:removeDirectory", dirPath),
    writeFile: (filePath, data, encoding) =>
      ipcRenderer.invoke("fs:writeFile", filePath, data, encoding),
    writeProjectFile: (projectPath, relativePath, data, encoding) =>
      ipcRenderer.invoke(
        "fs:writeProjectFile",
        projectPath,
        relativePath,
        data,
        encoding,
      ),
    listProjectDir: (projectPath, relativeDir) =>
      ipcRenderer.invoke("fs:listProjectDir", projectPath, relativeDir),
  },
  power: {
    blockSleep: () => ipcRenderer.invoke("power:blockSleep"),
    allowSleep: () => ipcRenderer.invoke("power:allowSleep"),
  },
  secrets: {
    getAiSecrets: () => ipcRenderer.invoke("secrets:getAiSecrets"),
    setAiSecrets: (next) => ipcRenderer.invoke("secrets:setAiSecrets", next),
  },
  ai: {
    streamAnthropic: (opts) => ipcRenderer.invoke("ai:anthropicStream", opts),
    abortAnthropic: (streamId) =>
      ipcRenderer.invoke("ai:anthropicAbort", streamId),
    probeAnthropic: (opts) => ipcRenderer.invoke("ai:anthropicProbe", opts),
    onAnthropicEvent: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on("ai:anthropic-event", handler);
      return () => ipcRenderer.removeListener("ai:anthropic-event", handler);
    },
    streamOpenAI: (opts) => ipcRenderer.invoke("ai:openaiStream", opts),
    abortOpenAI: (streamId) => ipcRenderer.invoke("ai:openaiAbort", streamId),
    probeOpenAI: (opts) => ipcRenderer.invoke("ai:openaiProbe", opts),
    onOpenAIEvent: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on("ai:openai-event", handler);
      return () => ipcRenderer.removeListener("ai:openai-event", handler);
    },
  },
  window: {
    isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
    onFullScreenChange: (listener) => {
      const handler = (_event, fullScreen) => listener(Boolean(fullScreen));
      ipcRenderer.on("window:fullscreen-changed", handler);
      return () =>
        ipcRenderer.removeListener("window:fullscreen-changed", handler);
    },
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
