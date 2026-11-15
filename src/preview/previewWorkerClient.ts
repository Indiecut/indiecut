import type { CompositorFit } from "../compositor/types";
import type {
  PreviewAssetKind,
  PreviewSeekLayer,
  PreviewTextLayout,
  PreviewWorkerRequest,
  PreviewWorkerResponse,
} from "./previewWorkerProtocol";

const SCRUB_THROTTLE_MS = 50;

/** Latest text layout sizes from the preview worker (logical px). */
let textLayoutsByKey = new Map<string, { width: number; height: number }>();
const textLayoutListeners = new Set<() => void>();

function setTextLayouts(layouts: PreviewTextLayout[] | undefined) {
  const next = new Map<string, { width: number; height: number }>();
  for (const row of layouts ?? []) {
    if (!row.key) continue;
    next.set(row.key, { width: row.width, height: row.height });
  }
  textLayoutsByKey = next;
  for (const listener of textLayoutListeners) listener();
}

/** Logical blit size for a text layer key (`clipId` or `clipId:cueId`). */
export function getPreviewTextLayout(
  key: string,
): { width: number; height: number } | null {
  return textLayoutsByKey.get(key) ?? null;
}

export function subscribePreviewTextLayouts(listener: () => void): () => void {
  textLayoutListeners.add(listener);
  return () => {
    textLayoutListeners.delete(listener);
  };
}

type PendingSeek = {
  layers: PreviewSeekLayer[];
  fps: number;
  layoutWidth: number;
  layoutHeight: number;
  force: boolean;
};

let worker: Worker | null = null;
let ready = false;
let requestId = 0;
let transferred = false;

let pendingSeek: PendingSeek | null = null;
let lastSeekArgs: PendingSeek | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let lastSeekSentAt = 0;
let scrubbing = false;
/** One seek in flight — latest pending wins so play doesn't backlog Out frames. */
let seekInFlight = false;
let seekInFlightId = 0;

const loadedAssets = new Set<string>();
const loadingAssets = new Map<string, Promise<void>>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./previewWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", onWorkerMessage);
    worker.addEventListener("error", (err) => {
      console.error("Preview worker error", err);
    });
  }
  return worker;
}

export function getPreviewWorker(): Worker {
  return getWorker();
}

function onSeekSettled(requestId?: number) {
  if (requestId !== undefined && requestId !== seekInFlightId) return;
  seekInFlight = false;
  // Drain latest-wins queue so playback stays near the playhead.
  if (pendingSeek) {
    flushPendingSeek(true);
  }
}

function onWorkerMessage(event: MessageEvent<PreviewWorkerResponse>) {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === "ready") {
    ready = true;
    seekInFlight = false;
    flushPendingSeek(true);
    return;
  }
  if (msg.type === "seeked") {
    if (msg.textLayouts) setTextLayouts(msg.textLayouts);
    onSeekSettled(msg.requestId);
    return;
  }
  if (msg.type === "failure") {
    console.warn("Preview worker:", msg.error);
    // Failure may be for an in-flight seek — unblock the queue.
    onSeekSettled(msg.requestId);
  }
}

function post(msg: PreviewWorkerRequest, transfer?: Transferable[]) {
  getWorker().postMessage(msg, transfer ?? []);
}

export function initPreviewWorker(args: {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  fit: CompositorFit;
  devicePixelRatio?: number;
}): void {
  if (transferred) {
    resizePreviewWorker({
      width: args.width,
      height: args.height,
      fit: args.fit,
      devicePixelRatio: args.devicePixelRatio,
    });
    return;
  }
  transferred = true;
  ready = false;
  post(
    {
      type: "init",
      canvas: args.canvas,
      width: args.width,
      height: args.height,
      fit: args.fit,
      devicePixelRatio: args.devicePixelRatio ?? 1,
    },
    [args.canvas],
  );
}

export function resizePreviewWorker(args: {
  width: number;
  height: number;
  fit: CompositorFit;
  devicePixelRatio?: number;
}): void {
  if (!transferred) return;
  post({
    type: "resize",
    width: args.width,
    height: args.height,
    fit: args.fit,
    devicePixelRatio: args.devicePixelRatio ?? 1,
  });
  if (lastSeekArgs) {
    seekPreview({
      layers: lastSeekArgs.layers,
      fps: lastSeekArgs.fps,
      layoutWidth: lastSeekArgs.layoutWidth,
      layoutHeight: lastSeekArgs.layoutHeight,
      force: true,
    });
  }
}

export function setPreviewScrubbing(value: boolean): void {
  scrubbing = value;
  if (!value) {
    flushPendingSeek(true);
  }
}

export async function loadPreviewAsset(args: {
  assetId: string;
  kind: PreviewAssetKind;
  buffer?: ArrayBuffer;
  mimeHint?: string;
  /** Pre-decoded bitmap — transferred to the worker (preferred for stickers). */
  bitmap?: ImageBitmap;
}): Promise<void> {
  const { assetId, kind, buffer, mimeHint, bitmap } = args;
  if (loadedAssets.has(assetId)) return;

  const existing = loadingAssets.get(assetId);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const w = getWorker();
    const onMessage = (event: MessageEvent<PreviewWorkerResponse>) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "loaded" && msg.assetId === assetId) {
        w.removeEventListener("message", onMessage);
        loadedAssets.add(assetId);
        loadingAssets.delete(assetId);
        resolve();
      } else if (msg.type === "failure" && msg.assetId === assetId) {
        w.removeEventListener("message", onMessage);
        loadingAssets.delete(assetId);
        reject(new Error(msg.error));
      }
    };
    w.addEventListener("message", onMessage);
    const transfer: Transferable[] = [];
    if (bitmap) transfer.push(bitmap);
    else if (buffer) transfer.push(buffer);
    post(
      {
        type: "load",
        assetId,
        kind,
        buffer: bitmap ? undefined : buffer,
        mimeHint,
        bitmap,
      },
      transfer,
    );
  });

  loadingAssets.set(assetId, promise);
  return promise;
}

export function unloadPreviewAsset(assetId: string): void {
  loadedAssets.delete(assetId);
  loadingAssets.delete(assetId);
  post({ type: "unload", assetId });
}

export function isPreviewAssetLoaded(assetId: string): boolean {
  return loadedAssets.has(assetId);
}

const loadedLuts = new Set<string>();

/** Parse/cache a .cube LUT inside the preview worker. */
export function loadPreviewLut(lutId: string, text: string): void {
  if (loadedLuts.has(lutId)) return;
  loadedLuts.add(lutId);
  post({ type: "loadLut", lutId, text });
}

export function isPreviewLutLoaded(lutId: string): boolean {
  return loadedLuts.has(lutId);
}

export function clearPreviewStage(): void {
  pendingSeek = null;
  lastSeekArgs = {
    layers: [],
    fps: 30,
    layoutWidth: 1920,
    layoutHeight: 1080,
    force: true,
  };
  post({ type: "clear" });
}

/**
 * Request a multi-layer seek.
 * - Scrub: throttle ~20 fps (latest-wins).
 * - Play / force: still latest-wins, but never queue more than one seek in the
 *   worker — otherwise Out text anim draws after the playhead has left the clip.
 */
export function seekPreview(args: {
  layers: PreviewSeekLayer[];
  fps: number;
  layoutWidth: number;
  layoutHeight: number;
  force?: boolean;
}): void {
  pendingSeek = {
    layers: args.layers,
    fps: args.fps,
    layoutWidth: args.layoutWidth,
    layoutHeight: args.layoutHeight,
    force: Boolean(args.force),
  };

  if (seekInFlight) {
    // Keep latest pending; flush when current seeked/failure arrives.
    return;
  }

  if (args.force || !scrubbing) {
    flushPendingSeek(true);
    return;
  }

  const elapsed = performance.now() - lastSeekSentAt;
  if (elapsed >= SCRUB_THROTTLE_MS) {
    flushPendingSeek(false);
    return;
  }

  if (throttleTimer) return;
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    if (!seekInFlight) flushPendingSeek(false);
  }, SCRUB_THROTTLE_MS - elapsed);
}

function flushPendingSeek(force: boolean) {
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  if (!pendingSeek) return;
  if (!ready && !transferred) return;
  if (seekInFlight) return;

  const next = pendingSeek;
  pendingSeek = null;
  lastSeekArgs = next;
  lastSeekSentAt = performance.now();
  requestId += 1;
  seekInFlight = true;
  seekInFlightId = requestId;
  post({
    type: "seek",
    layers: next.layers,
    requestId,
    fps: next.fps,
    layoutWidth: next.layoutWidth,
    layoutHeight: next.layoutHeight,
    force: force || next.force,
  });
}

let sampleRequestId = 0;

/** Sample RGB from a loaded asset's decoded source frame at UV (pre-adjust). */
export function samplePreviewSourcePixel(args: {
  assetId: string;
  sourceMs: number;
  u: number;
  v: number;
}): Promise<{ r: number; g: number; b: number }> {
  const w = getWorker();
  sampleRequestId += 1;
  const id = sampleRequestId;
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<PreviewWorkerResponse>) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "sampledSourcePixel" && msg.requestId === id) {
        w.removeEventListener("message", onMessage);
        resolve({ r: msg.r, g: msg.g, b: msg.b });
      } else if (
        msg.type === "failure" &&
        msg.requestId === id
      ) {
        w.removeEventListener("message", onMessage);
        reject(new Error(msg.error));
      }
    };
    w.addEventListener("message", onMessage);
    post({
      type: "sampleSourcePixel",
      requestId: id,
      assetId: args.assetId,
      sourceMs: args.sourceMs,
      u: args.u,
      v: args.v,
    });
  });
}

export function disposePreviewWorker(): void {
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  pendingSeek = null;
  seekInFlight = false;
  seekInFlightId = 0;
  loadedAssets.clear();
  loadingAssets.clear();
  ready = false;
  transferred = false;
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
