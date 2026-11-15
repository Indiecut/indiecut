import { resolveMediaAbsolutePath } from "../project/mediaPath";
import type { MediaAssetRef } from "../project/types";
import type {
  FilmstripWorkerRequest,
  FilmstripWorkerResponse,
} from "./filmstripProtocol";

const TILE_WIDTH = 80;
const TILE_HEIGHT = 45;

let worker: Worker | null = null;
let requestId = 0;

const loadedAssets = new Set<string>();
const loadingAssets = new Map<string, Promise<void>>();
/** key = `${assetId}:${zoomBucket}:${tileIndex}` — stable data URLs (no revoke). */
const tileUrls = new Map<string, string>();
/** In-flight tile fetches deduped by cache key. */
const inflightTiles = new Map<string, Promise<string | null>>();
const pendingByRequestId = new Map<
  number,
  { key: string; resolve: (url: string | null) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./filmstripWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", onMessage);
  }
  return worker;
}

function bytesToJpegDataUrl(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

function onMessage(event: MessageEvent<FilmstripWorkerResponse>) {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === "loaded") {
    loadedAssets.add(msg.assetId);
    return;
  }

  if (msg.type === "tile") {
    const pending = pendingByRequestId.get(msg.requestId);
    if (!pending) return;
    pendingByRequestId.delete(msg.requestId);

    if (msg.jpeg && msg.jpeg.byteLength > 0) {
      const url = bytesToJpegDataUrl(new Uint8Array(msg.jpeg));
      tileUrls.set(pending.key, url);
      pending.resolve(url);
    } else {
      if (msg.error) {
        console.warn("Filmstrip tile failed", pending.key, msg.error);
      }
      pending.resolve(null);
    }
  }
}

function post(msg: FilmstripWorkerRequest, transfer?: Transferable[]) {
  getWorker().postMessage(msg, transfer ?? []);
}

export function zoomBucket(pxPerSec: number): number {
  if (pxPerSec < 20) return 10;
  if (pxPerSec < 40) return 20;
  if (pxPerSec < 80) return 40;
  if (pxPerSec < 120) return 80;
  return 160;
}

/** Tile duration in ms at a zoom bucket (roughly one tile width of timeline). */
export function tileDurationMs(pxPerSec: number): number {
  return (TILE_WIDTH / Math.max(1, pxPerSec)) * 1000;
}

async function ensureAssetLoaded(
  asset: MediaAssetRef,
  projectPath: string,
): Promise<boolean> {
  if (asset.kind !== "video") return false;
  if (loadedAssets.has(asset.id)) return true;

  const existing = loadingAssets.get(asset.id);
  if (existing) {
    await existing;
    return loadedAssets.has(asset.id);
  }

  const bridge = window.indiecut;
  if (!bridge?.fs || !projectPath) return false;

  const promise = (async () => {
    const stored = asset.proxyPath ?? asset.path;
    const abs = resolveMediaAbsolutePath({
      projectPath,
      storedPath: stored,
    });
    const bytes = await bridge.fs.readFile(abs);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await new Promise<void>((resolve, reject) => {
      const w = getWorker();
      const onMsg = (event: MessageEvent<FilmstripWorkerResponse>) => {
        const msg = event.data;
        if (!msg) return;
        if (msg.type === "loaded" && msg.assetId === asset.id) {
          w.removeEventListener("message", onMsg);
          resolve();
        } else if (msg.type === "failure" && msg.assetId === asset.id) {
          w.removeEventListener("message", onMsg);
          reject(new Error(msg.error));
        }
      };
      w.addEventListener("message", onMsg);
      post(
        {
          type: "load",
          assetId: asset.id,
          buffer: copy.buffer,
          mimeHint: "video/mp4",
        },
        [copy.buffer],
      );
    });
  })();

  loadingAssets.set(asset.id, promise);
  try {
    await promise;
    return true;
  } catch (err) {
    console.warn("Filmstrip load failed", err);
    return false;
  } finally {
    loadingAssets.delete(asset.id);
  }
}

export function getCachedTileUrl(
  assetId: string,
  tileIndex: number,
  bucket: number,
): string | null {
  return tileUrls.get(`${assetId}:${bucket}:${tileIndex}`) ?? null;
}

export async function requestFilmstripTile(args: {
  asset: MediaAssetRef;
  projectPath: string;
  /** Source media time for the tile center/start */
  sourceMs: number;
  tileIndex: number;
  pxPerSec: number;
}): Promise<string | null> {
  const bucket = zoomBucket(args.pxPerSec);
  const key = `${args.asset.id}:${bucket}:${args.tileIndex}`;
  const cached = tileUrls.get(key);
  if (cached) return cached;

  const existing = inflightTiles.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    const ok = await ensureAssetLoaded(args.asset, args.projectPath);
    if (!ok) return null;

    // Another request may have filled the cache while we loaded the asset.
    const again = tileUrls.get(key);
    if (again) return again;

    const id = ++requestId;
    return new Promise<string | null>((resolve) => {
      pendingByRequestId.set(id, { key, resolve });
      post({
        type: "tile",
        requestId: id,
        assetId: args.asset.id,
        timestampSec: Math.max(0, args.sourceMs / 1000),
        tileIndex: args.tileIndex,
        zoomBucket: bucket,
        width: TILE_WIDTH,
        height: TILE_HEIGHT,
      });
    });
  })();

  inflightTiles.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightTiles.delete(key);
  }
}

export { TILE_WIDTH, TILE_HEIGHT };
