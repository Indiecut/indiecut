/// <reference lib="webworker" />

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import type {
  FilmstripWorkerRequest,
  FilmstripWorkerResponse,
} from "./filmstripProtocol";

type AssetEntry = {
  input: Input;
  trackReady: Promise<void>;
  sink: CanvasSink | null;
  sinkKey: string;
};

const assets = new Map<string, AssetEntry>();

function post(msg: FilmstripWorkerResponse, transfer?: Transferable[]) {
  self.postMessage(msg, transfer ?? []);
}

async function ensureSink(
  entry: AssetEntry,
  width: number,
  height: number,
): Promise<CanvasSink | null> {
  await entry.trackReady;
  const key = `${width}x${height}`;
  if (entry.sink && entry.sinkKey === key) return entry.sink;

  const track = await entry.input.getPrimaryVideoTrack();
  if (!track) return null;
  entry.sink = new CanvasSink(track, {
    width,
    height,
    fit: "cover",
    poolSize: 2,
  });
  entry.sinkKey = key;
  return entry.sink;
}

async function handleLoad(
  msg: Extract<FilmstripWorkerRequest, { type: "load" }>,
) {
  const existing = assets.get(msg.assetId);
  if (existing) {
    await existing.input.dispose();
    assets.delete(msg.assetId);
  }

  const blob = new Blob([msg.buffer], { type: msg.mimeHint || "video/mp4" });
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });

  const entry: AssetEntry = {
    input,
    trackReady: input.getPrimaryVideoTrack().then(() => undefined),
    sink: null,
    sinkKey: "",
  };
  assets.set(msg.assetId, entry);

  try {
    await entry.trackReady;
    post({ type: "loaded", assetId: msg.assetId });
  } catch (err) {
    assets.delete(msg.assetId);
    await input.dispose();
    post({
      type: "failure",
      assetId: msg.assetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleTile(
  msg: Extract<FilmstripWorkerRequest, { type: "tile" }>,
) {
  const entry = assets.get(msg.assetId);
  if (!entry) {
    post({
      type: "tile",
      requestId: msg.requestId,
      assetId: msg.assetId,
      tileIndex: msg.tileIndex,
      zoomBucket: msg.zoomBucket,
      error: "Asset not loaded",
    });
    return;
  }

  try {
    const sink = await ensureSink(entry, msg.width, msg.height);
    if (!sink) {
      post({
        type: "tile",
        requestId: msg.requestId,
        assetId: msg.assetId,
        tileIndex: msg.tileIndex,
        zoomBucket: msg.zoomBucket,
        error: "No video track",
      });
      return;
    }

    const wrapped = await sink.getCanvas(Math.max(0, msg.timestampSec));
    if (!wrapped) {
      post({
        type: "tile",
        requestId: msg.requestId,
        assetId: msg.assetId,
        tileIndex: msg.tileIndex,
        zoomBucket: msg.zoomBucket,
        error: "No frame",
      });
      return;
    }

    // Snapshot out of the CanvasSink pool before async JPEG encode —
    // pool canvases are reused and would corrupt in-flight encodes.
    const src = wrapped.canvas;
    const w = Math.max(1, src.width || msg.width);
    const h = Math.max(1, src.height || msg.height);
    const snapshot = new OffscreenCanvas(w, h);
    const ctx = snapshot.getContext("2d");
    if (!ctx) {
      post({
        type: "tile",
        requestId: msg.requestId,
        assetId: msg.assetId,
        tileIndex: msg.tileIndex,
        zoomBucket: msg.zoomBucket,
        error: "2D context unavailable",
      });
      return;
    }
    ctx.drawImage(src, 0, 0, w, h);

    const blob = await snapshot.convertToBlob({
      type: "image/jpeg",
      quality: 0.72,
    });
    const jpeg = await blob.arrayBuffer();
    if (jpeg.byteLength === 0) {
      post({
        type: "tile",
        requestId: msg.requestId,
        assetId: msg.assetId,
        tileIndex: msg.tileIndex,
        zoomBucket: msg.zoomBucket,
        error: "Empty JPEG",
      });
      return;
    }

    post(
      {
        type: "tile",
        requestId: msg.requestId,
        assetId: msg.assetId,
        tileIndex: msg.tileIndex,
        zoomBucket: msg.zoomBucket,
        jpeg,
      },
      [jpeg],
    );
  } catch (err) {
    post({
      type: "tile",
      requestId: msg.requestId,
      assetId: msg.assetId,
      tileIndex: msg.tileIndex,
      zoomBucket: msg.zoomBucket,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleUnload(
  msg: Extract<FilmstripWorkerRequest, { type: "unload" }>,
) {
  const entry = assets.get(msg.assetId);
  if (!entry) return;
  await entry.input.dispose();
  assets.delete(msg.assetId);
}

let chain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<FilmstripWorkerRequest>) => {
  const msg = event.data;
  if (!msg?.type) return;
  chain = chain
    .then(async () => {
      switch (msg.type) {
        case "load":
          await handleLoad(msg);
          break;
        case "tile":
          await handleTile(msg);
          break;
        case "unload":
          await handleUnload(msg);
          break;
        default:
          break;
      }
    })
    .catch((err) => console.error("Filmstrip worker error", err));
};
