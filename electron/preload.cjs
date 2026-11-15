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
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
