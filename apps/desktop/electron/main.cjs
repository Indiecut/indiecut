const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  powerSaveBlocker,
  session,
  shell,
} = require("electron");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/** Keep Mac from sleeping mid-export. */
let exportSleepBlockerId = null;

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

/**
 * MediaPipe WASM needs eval/wasm-eval; keep CSP otherwise tight in production.
 *
 * In Vite dev, the React Refresh preamble is an *inline* <script type="module">
 * injected at the top of <head>. A header CSP applies to the whole document and
 * will block that preamble (meta CSP does not — it only affects nodes after it),
 * which crashes the renderer: "@vitejs/plugin-react can't detect preamble".
 */
const APP_CSP_PROD = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "connect-src 'self' http: https: ws: wss:",
].join("; ");

const APP_CSP_DEV = [
  "default-src 'self'",
  // 'unsafe-inline' required for Vite React Refresh preamble in Electron.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "connect-src 'self' http: https: ws: wss:",
].join("; ");

function installContentSecurityPolicy() {
  const policy = isDev ? APP_CSP_DEV : APP_CSP_PROD;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...(details.responseHeaders ?? {}) };
    // Override any page meta CSP so WASM (and Vite HMR in dev) can run.
    headers["Content-Security-Policy"] = [policy];
    callback({ responseHeaders: headers });
  });
}

const PROJECT_SUBDIRS = [
  "media",
  "proxies",
  "thumbs",
  "peaks",
  "exports",
  "filters",
  "cache",
];

const MEDIA_EXTENSIONS = [
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "mp3",
  "wav",
  "aac",
  "m4a",
  "flac",
  "ogg",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
];

const APP_ICON = path.join(__dirname, "icon.png");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    title: "IndieCut",
    backgroundColor: "#0e1012",
    show: false,
    icon: APP_ICON,
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 16, y: 14 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function handle(channel, listener) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}

function assertString(value, label) {
  if (!value || typeof value !== "string") {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function resolveUnderProject(projectPath, relativeOrAbsolute) {
  const base = path.resolve(projectPath);
  const target = path.isAbsolute(relativeOrAbsolute)
    ? path.resolve(relativeOrAbsolute)
    : path.resolve(base, relativeOrAbsolute);
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes project folder");
  }
  return target;
}

async function ensureProjectDirs(projectPath) {
  await fs.mkdir(projectPath, { recursive: true });
  for (const dir of PROJECT_SUBDIRS) {
    await fs.mkdir(path.join(projectPath, dir), { recursive: true });
  }
}

// Register before app ready so a stale/hot-reloaded main always has handlers.
handle("dialog:pickProjectFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win ?? undefined, {
    title: "Open project folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

handle("dialog:createProjectFolder", async (event, suggestedName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const parent = await dialog.showOpenDialog(win ?? undefined, {
    title: "Choose where to save the project",
    properties: ["openDirectory", "createDirectory"],
  });
  if (parent.canceled || parent.filePaths.length === 0) return null;

  const safeName =
    String(suggestedName || "Untitled")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .trim() || "Untitled";
  const parentDir = parent.filePaths[0];

  // Never silently reuse a folder that already has an IndieCut project —
  // writing a fresh project.json would wipe the previous timeline.
  let projectPath = path.join(parentDir, safeName);
  let suffix = 2;
  while (true) {
    try {
      await fs.access(path.join(projectPath, "project.json"));
      projectPath = path.join(parentDir, `${safeName} (${suffix})`);
      suffix += 1;
    } catch {
      break;
    }
  }

  await ensureProjectDirs(projectPath);
  return projectPath;
});

handle("dialog:pickMediaFiles", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win ?? undefined, {
    title: "Import media",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media",
        extensions: MEDIA_EXTENSIONS,
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return result.filePaths;
});

handle("dialog:pickExportFolder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win ?? undefined, {
    title: "Export to",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

/** Open file handles for MediaBunny StreamTarget positioned writes. */
const exportStreams = new Map();

function safeExportBasename(title) {
  return (
    String(title || "Untitled")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .trim() || "Untitled"
  );
}

handle("exportStream:open", async (_event, opts) => {
  const folder = assertString(opts?.folder, "export folder");
  const title = safeExportBasename(opts?.title);
  const extension = String(opts?.extension || "mp4")
    .replace(/^\./, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase() || "mp4";
  await fs.mkdir(folder, { recursive: true });
  let finalPath = path.join(folder, `${title}.${extension}`);
  // Avoid clobbering an existing export unless overwrite requested.
  if (!opts?.overwrite) {
    let n = 1;
    while (true) {
      try {
        await fs.access(finalPath);
        n += 1;
        finalPath = path.join(folder, `${title} (${n}).${extension}`);
      } catch {
        break;
      }
    }
  }
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.partial`;
  const fd = fssync.openSync(tmpPath, "w");
  const streamId = crypto.randomUUID();
  exportStreams.set(streamId, {
    fd,
    tmpPath,
    finalPath,
    bytesWritten: 0,
  });
  return { streamId, tmpPath, finalPath };
});

handle("exportStream:write", async (_event, streamId, position, data) => {
  const session = exportStreams.get(streamId);
  if (!session) throw new Error("Unknown export stream");
  const bytes =
    data instanceof Uint8Array
      ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      : Buffer.from(data?.buffer ?? data, data?.byteOffset ?? 0, data?.byteLength);
  const pos = Number(position);
  if (!Number.isFinite(pos) || pos < 0) {
    throw new Error("Invalid export stream write position");
  }
  const written = fssync.writeSync(session.fd, bytes, 0, bytes.length, pos);
  session.bytesWritten = Math.max(session.bytesWritten, pos + written);
  return { written };
});

handle("exportStream:close", async (_event, streamId, options) => {
  const session = exportStreams.get(streamId);
  if (!session) {
    return { ok: false, error: "Unknown export stream" };
  }
  exportStreams.delete(streamId);
  try {
    fssync.closeSync(session.fd);
  } catch {
    /* already closed */
  }
  const abort = Boolean(options?.abort);
  if (abort) {
    try {
      await fs.unlink(session.tmpPath);
    } catch {
      /* ignore */
    }
    return { ok: true, aborted: true, bytesWritten: session.bytesWritten };
  }
  try {
    await fs.rename(session.tmpPath, session.finalPath);
  } catch (err) {
    // Cross-device rename fallback
    if (err && (err.code === "EXDEV" || err.code === "EPERM")) {
      await fs.copyFile(session.tmpPath, session.finalPath);
      await fs.unlink(session.tmpPath);
    } else {
      throw err;
    }
  }
  return {
    ok: true,
    aborted: false,
    finalPath: session.finalPath,
    bytesWritten: session.bytesWritten,
  };
});

handle("shell:openPath", async (_event, targetPath) => {
  const target = assertString(targetPath, "path");
  const err = await shell.openPath(target);
  if (err) throw new Error(err);
  return true;
});

handle("shell:showItemInFolder", async (_event, targetPath) => {
  const target = assertString(targetPath, "path");
  shell.showItemInFolder(target);
  return true;
});

app.on("before-quit", () => {
  for (const [id, session] of exportStreams) {
    try {
      fssync.closeSync(session.fd);
    } catch {
      /* ignore */
    }
    try {
      fssync.unlinkSync(session.tmpPath);
    } catch {
      /* ignore */
    }
    exportStreams.delete(id);
  }
});

handle("fs:ensureProjectLayout", async (_event, projectPath) => {
  await ensureProjectDirs(assertString(projectPath, "project path"));
});

handle("fs:readProjectJson", async (_event, projectPath) => {
  const root = assertString(projectPath, "project path");
  const filePath = path.join(root, "project.json");
  const raw = await fs.readFile(filePath, "utf8");
  return raw;
});

handle("fs:writeProjectJson", async (_event, projectPath, jsonText) => {
  const root = assertString(projectPath, "project path");
  if (typeof jsonText !== "string") {
    throw new Error("Invalid project JSON");
  }
  await ensureProjectDirs(root);
  const filePath = path.join(root, "project.json");
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, jsonText, "utf8");
  await fs.rename(tmpPath, filePath);
});

handle("fs:pathExists", async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== "string") return false;
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
});

handle("fs:copyFile", async (_event, sourcePath, destPath) => {
  const src = assertString(sourcePath, "source path");
  const dest = assertString(destPath, "dest path");
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  return dest;
});

handle("fs:readFile", async (_event, filePath) => {
  const target = assertString(filePath, "file path");
  const buf = await fs.readFile(target);
  // Return a plain Uint8Array so the renderer can build Blobs reliably.
  return new Uint8Array(buf);
});

handle("fs:unlink", async (_event, filePath) => {
  const target = assertString(filePath, "file path");
  try {
    await fs.unlink(target);
    return { ok: true };
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTFOUND")) {
      return { ok: true, missing: true };
    }
    throw err;
  }
});

handle("fs:removeDirectory", async (_event, dirPath) => {
  const target = assertString(dirPath, "directory path");
  try {
    await fs.rm(target, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTFOUND")) {
      return { ok: true, missing: true };
    }
    throw err;
  }
});

handle("fs:writeFile", async (_event, filePath, data, encoding) => {
  const target = assertString(filePath, "file path");
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (encoding === "utf8" || typeof data === "string") {
    await fs.writeFile(target, String(data), "utf8");
  } else {
    const bytes =
      data instanceof Uint8Array
        ? data
        : Buffer.from(data?.buffer ?? data, data?.byteOffset ?? 0, data?.byteLength);
    await fs.writeFile(target, Buffer.from(bytes));
  }
  return target;
});

handle("fs:writeProjectFile", async (_event, projectPath, relativePath, data, encoding) => {
  const root = assertString(projectPath, "project path");
  const rel = assertString(relativePath, "relative path");
  const target = resolveUnderProject(root, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (encoding === "utf8" || typeof data === "string") {
    await fs.writeFile(target, String(data), "utf8");
  } else {
    const bytes =
      data instanceof Uint8Array
        ? data
        : Buffer.from(data?.buffer ?? data, data?.byteOffset ?? 0, data?.byteLength);
    await fs.writeFile(target, Buffer.from(bytes));
  }
  return target;
});

handle("fs:listProjectDir", async (_event, projectPath, relativeDir) => {
  const root = assertString(projectPath, "project path");
  const rel = assertString(relativeDir, "relative dir");
  const dir = resolveUnderProject(root, rel);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => {
        const name = e.name;
        const joined = path.posix.join(rel.replace(/\\/g, "/"), name);
        return joined;
      });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
});

handle("power:blockSleep", () => {
  if (
    exportSleepBlockerId == null ||
    !powerSaveBlocker.isStarted(exportSleepBlockerId)
  ) {
    exportSleepBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  }
  return { id: exportSleepBlockerId };
});

handle("power:allowSleep", () => {
  if (
    exportSleepBlockerId != null &&
    powerSaveBlocker.isStarted(exportSleepBlockerId)
  ) {
    powerSaveBlocker.stop(exportSleepBlockerId);
  }
  exportSleepBlockerId = null;
  return { ok: true };
});

app.whenReady().then(() => {
  installContentSecurityPolicy();
  if (process.platform === "darwin" && app.dock && fssync.existsSync(APP_ICON)) {
    app.dock.setIcon(APP_ICON);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (
    exportSleepBlockerId != null &&
    powerSaveBlocker.isStarted(exportSleepBlockerId)
  ) {
    powerSaveBlocker.stop(exportSleepBlockerId);
  }
  exportSleepBlockerId = null;
  if (process.platform !== "darwin") {
    app.quit();
  }
});
