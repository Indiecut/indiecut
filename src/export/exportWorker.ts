/// <reference lib="webworker" />

import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
} from "mediabunny";
import { applyCropToCanvas } from "../compositor/crop";
import { draw } from "../compositor/draw";
import {
  measureTextSize,
  rasterizeText,
  textPropsFingerprint,
  textRasterPixelRatio,
} from "../compositor/rasterizeText";
import { compositeCaptionKaraoke } from "../compositor/captionKaraoke";
import {
  ANIMATED_TEXT_OVERFLOW_PAD,
  compositeAnimatedText,
  layoutTextUnits,
  rasterizeTextUnit,
} from "../compositor/textUnits";
import { resolveTransform } from "../compositor/transform";
import type { CompositorFit, CompositorLayerSource } from "../compositor/types";
import { sampleEffect } from "../engine/effects";
import {
  applyLut,
  cacheLut,
  getCachedLut,
  parseCubeLut,
  type CubeLut,
} from "../engine/lutCube";
import { blendSourcePair } from "../engine/speedRemap";
import { applyWholeLayerAnimation } from "../compositor/layerAnimation";
import {
  hasActiveTextAnimation,
  sampleTextUnitMotion,
} from "../engine/textAnimation";
import { sampleTransition } from "../engine/transitions";
import { ensureTextFontsLoaded } from "../fonts/registry";
import type { TextProps } from "../project/types";
import type {
  ExportQualityConfig,
  ExportWorkerRequest,
  ExportWorkerResponse,
  PreviewSeekLayer,
} from "./exportWorkerProtocol";
import {
  acquireExportCanvas,
  clearExportCanvasPool,
  releaseAllExportCanvases,
  releaseExportCanvas,
} from "./exportCanvasPool";
import { ForwardCanvasCursor } from "./forwardCanvasCursor";

type VideoEntry = {
  kind: "video";
  input: Input;
  sink: CanvasSink;
  cursor: ForwardCanvasCursor;
  lastFrameIndex: number;
};

type ImageEntry = {
  kind: "image";
  bitmap: ImageBitmap;
};

type AssetEntry = VideoEntry | ImageEntry;

let stage: OffscreenCanvas | null = null;
let stageCtx: OffscreenCanvasRenderingContext2D | null = null;
let stageWidth = 0;
let stageHeight = 0;
let fit: CompositorFit = "contain";

const assets = new Map<string, AssetEntry>();
/** Cached text rasters keyed by textKey + props/scale fingerprint. */
const textCache = new Map<
  string,
  {
    fp: string;
    canvas: OffscreenCanvas;
    width: number;
    height: number;
    logicalWidth: number;
    logicalHeight: number;
  }
>();

/** Per-unit bitmaps for animated text — keyed by textKey@props@unitIndex. */
const textUnitCache = new Map<
  string,
  {
    canvas: OffscreenCanvas;
    width: number;
    height: number;
    logicalWidth: number;
    logicalHeight: number;
  }
>();
let devicePixelRatio = 1;
let seekGeneration = 0;
/** Scratch canvas for frame blending. */
let blendCanvas: OffscreenCanvas | null = null;
let blendCtx: OffscreenCanvasRenderingContext2D | null = null;
/** Scratch canvas for filter/effect stage post-pass. */
let stageSnapCanvas: OffscreenCanvas | null = null;
let stageSnapCtx: OffscreenCanvasRenderingContext2D | null = null;
/** Downscaled JPEG preview for the export modal. */
let previewScratch: OffscreenCanvas | null = null;
let emitPreview = false;
const PREVIEW_EVERY_FRAMES = 12;
const PREVIEW_MAX_WIDTH = 320;

function post(msg: ExportWorkerResponse, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) {
    self.postMessage(msg, transfer);
  } else {
    self.postMessage(msg);
  }
}

function qualityFromConfig(config: ExportQualityConfig): Quality {
  if (config.kind === "bitrate") {
    return new Quality({ bitrate: config.bitrate });
  }
  return new Quality(config.name);
}

type EncodeSession = {
  output: Output;
  videoSource: CanvasSource;
  audioSource: AudioSampleSource | null;
  fps: number;
  totalFrames: number;
  layoutWidth: number;
  layoutHeight: number;
  cancelled: boolean;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function maybeEmitPreview(frameIndex: number): Promise<void> {
  if (!emitPreview || !stage) return;
  if (frameIndex !== 0 && frameIndex % PREVIEW_EVERY_FRAMES !== 0) return;

  const scale = Math.min(1, PREVIEW_MAX_WIDTH / Math.max(1, stageWidth));
  const w = Math.max(1, Math.round(stageWidth * scale));
  const h = Math.max(1, Math.round(stageHeight * scale));
  if (
    !previewScratch ||
    previewScratch.width !== w ||
    previewScratch.height !== h
  ) {
    previewScratch = new OffscreenCanvas(w, h);
  }
  const ctx = previewScratch.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(stage, 0, 0, w, h);
  try {
    const blob = await previewScratch.convertToBlob({
      type: "image/jpeg",
      quality: 0.7,
    });
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (buf.byteLength < 32) return;
    post({
      type: "previewFrame",
      frameIndex,
      dataUrl: `data:image/jpeg;base64,${bytesToBase64(buf)}`,
    });
  } catch {
    /* preview is best-effort */
  }
}

/**
 * Feed interleaved f32 PCM into AudioSampleSource without using AudioBuffer
 * (AudioBuffer is not defined in DedicatedWorkerGlobalScope).
 */
async function addPcmAsAudioSamples(
  audioSource: AudioSampleSource,
  pcm: Float32Array,
  sampleRate: number,
  numberOfChannels: number,
): Promise<void> {
  const framesTotal = Math.floor(pcm.length / numberOfChannels);
  if (framesTotal <= 0) return;

  // Chunk ~1s to keep encoder buffers reasonable
  const maxFrames = Math.max(1, Math.floor(sampleRate));
  let frame = 0;
  let timestamp = 0;

  while (frame < framesTotal) {
    const count = Math.min(maxFrames, framesTotal - frame);
    const interleaved = new Float32Array(count * numberOfChannels);
    interleaved.set(
      pcm.subarray(
        frame * numberOfChannels,
        (frame + count) * numberOfChannels,
      ),
    );
    const sample = new AudioSample({
      data: interleaved,
      format: "f32",
      numberOfChannels,
      sampleRate,
      timestamp,
    });
    await audioSource.add(sample);
    sample.close();
    timestamp += count / sampleRate;
    frame += count;
  }
}

let encodeSession: EncodeSession | null = null;
let nextWriteId = 1;
const pendingWrites = new Map<
  number,
  { resolve: () => void; reject: (err: Error) => void }
>();

function createStreamWritable(): WritableStream<{
  data: Uint8Array;
  position: number;
}> {
  return new WritableStream({
    async write(chunk) {
      const writeId = nextWriteId++;
      const copy = new Uint8Array(chunk.data.byteLength);
      copy.set(chunk.data);
      await new Promise<void>((resolve, reject) => {
        pendingWrites.set(writeId, { resolve, reject });
        post(
          {
            type: "streamWrite",
            writeId,
            position: chunk.position,
            data: copy,
          },
          [copy.buffer],
        );
      });
    },
  });
}

function clearStage() {
  if (!stageCtx || !stage) return;
  draw({
    ctx: stageCtx,
    width: stageWidth,
    height: stageHeight,
    fit,
    layers: [],
  });
}

async function disposeAsset(entry: AssetEntry) {
  if (entry.kind === "video") {
    entry.cursor.dispose();
    await entry.input.dispose();
  } else {
    entry.bitmap.close();
  }
}

/**
 * Content-sized sink — compositor owns contain/cover + transform.
 * Cap decode to the export stage box so 4K masters are not fully decoded
 * when exporting 720/1080; never upscale smaller sources.
 */
function createContentSink(
  track: NonNullable<Awaited<ReturnType<Input["getPrimaryVideoTrack"]>>>,
): CanvasSink {
  const displayW = Math.max(1, track.displayWidth);
  const displayH = Math.max(1, track.displayHeight);
  const maxW = Math.max(1, stageWidth);
  const maxH = Math.max(1, stageHeight);
  const scale = Math.min(1, maxW / displayW, maxH / displayH);

  if (scale < 1) {
    // Both dims are aspect-correct already; fit is required by MediaBunny.
    return new CanvasSink(track, {
      width: Math.max(1, Math.round(displayW * scale)),
      height: Math.max(1, Math.round(displayH * scale)),
      fit: "fill",
      poolSize: 2,
      // Software decode avoids macOS IOSurface exhaustion on long exports.
      decoderOptions: { hardwareAcceleration: "prefer-software" },
    });
  }

  return new CanvasSink(track, {
    poolSize: 2,
    decoderOptions: { hardwareAcceleration: "prefer-software" },
  });
}

/** Downscale stills to the export stage box when masters are larger. */
async function createExportImageBitmap(blob: Blob): Promise<ImageBitmap> {
  const full = await createImageBitmap(blob);
  const maxW = Math.max(1, stageWidth);
  const maxH = Math.max(1, stageHeight);
  const scale = Math.min(1, maxW / full.width, maxH / full.height);
  if (scale >= 1) return full;

  try {
    const resized = await createImageBitmap(full, {
      resizeWidth: Math.max(1, Math.round(full.width * scale)),
      resizeHeight: Math.max(1, Math.round(full.height * scale)),
      resizeQuality: "high",
    });
    full.close();
    return resized;
  } catch {
    return full;
  }
}

function ensureBlendCanvas(w: number, h: number): OffscreenCanvasRenderingContext2D {
  if (!blendCanvas || blendCanvas.width !== w || blendCanvas.height !== h) {
    blendCanvas = new OffscreenCanvas(w, h);
    blendCtx = blendCanvas.getContext("2d");
  }
  if (!blendCtx) throw new Error("Blend canvas 2D unavailable");
  return blendCtx;
}

function ensureStageSnap(
  w: number,
  h: number,
): OffscreenCanvasRenderingContext2D {
  if (
    !stageSnapCanvas ||
    stageSnapCanvas.width !== w ||
    stageSnapCanvas.height !== h
  ) {
    stageSnapCanvas = new OffscreenCanvas(w, h);
    stageSnapCtx = stageSnapCanvas.getContext("2d");
  }
  if (!stageSnapCtx || !stageSnapCanvas) {
    throw new Error("Stage snap 2D unavailable");
  }
  return stageSnapCtx;
}

async function handleInit(msg: Extract<ExportWorkerRequest, { type: "init" }>) {
  stage = msg.canvas;
  stageWidth = Math.max(1, Math.round(msg.width));
  stageHeight = Math.max(1, Math.round(msg.height));
  fit = "contain";
  devicePixelRatio = 1;
  stage.width = stageWidth;
  stage.height = stageHeight;
  stageCtx = stage.getContext("2d", { alpha: false });
  if (!stageCtx) {
    post({ type: "failure", error: "OffscreenCanvas 2D context unavailable" });
    return;
  }
  try {
    await ensureTextFontsLoaded();
  } catch {
    /* system fonts still work */
  }
  textCache.clear();
  textUnitCache.clear();
  clearExportCanvasPool();
  blendCanvas = null;
  blendCtx = null;
  stageSnapCanvas = null;
  stageSnapCtx = null;
  previewScratch = null;
  emitPreview = false;
  clearStage();
  post({ type: "ready" });
}

async function handleLoad(msg: Extract<ExportWorkerRequest, { type: "load" }>) {
  const existing = assets.get(msg.assetId);
  if (existing) {
    await disposeAsset(existing);
    assets.delete(msg.assetId);
  }

  try {
    if (msg.kind === "image") {
      const blob = new Blob([msg.buffer], {
        type: msg.mimeHint || "image/*",
      });
      const bitmap = await createExportImageBitmap(blob);
      assets.set(msg.assetId, { kind: "image", bitmap });
    } else {
      const blob = new Blob([msg.buffer], {
        type: msg.mimeHint || "video/mp4",
      });
      const input = new Input({
        source: new BlobSource(blob),
        formats: ALL_FORMATS,
      });
      const track = await input.getPrimaryVideoTrack();
      if (!track) {
        await input.dispose();
        throw new Error("No video track in preview media");
      }
      const sink = createContentSink(track);
      assets.set(msg.assetId, {
        kind: "video",
        input,
        sink,
        cursor: new ForwardCanvasCursor(sink),
        lastFrameIndex: -1,
      });
    }
    post({ type: "loaded", assetId: msg.assetId });
  } catch (err) {
    post({
      type: "failure",
      assetId: msg.assetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function ensureLut(filter: {
  lutId: string;
  lutUrl: string;
}): Promise<CubeLut | null> {
  const cached = getCachedLut(filter.lutId);
  if (cached) return cached;
  // Project LUTs are injected via loadLut from the main thread.
  if (filter.lutUrl.startsWith("project://")) return null;
  try {
    const res = await fetch(filter.lutUrl);
    if (!res.ok) return null;
    const text = await res.text();
    const lut = parseCubeLut(text);
    cacheLut(filter.lutId, lut);
    return lut;
  } catch {
    return null;
  }
}

function getTextLayer(
  layer: PreviewSeekLayer,
  layoutWidth: number,
  layoutHeight: number,
): CompositorLayerSource | null {
  if (!layer.text) return null;
  const base = resolveTransform(layer.transform);
  const sx = base.uniformScale !== false ? base.scaleX : base.scaleX;
  const sy = base.uniformScale !== false ? base.scaleX : base.scaleY;
  const logical = measureTextSize(layer.text);
  if (!logical) return null;

  const pixelRatio = textRasterPixelRatio({
    scaleX: sx,
    scaleY: sy,
    stageWidth,
    layoutWidth: Math.max(1, layoutWidth),
    devicePixelRatio,
  });

  const toLayer = (entry: {
    canvas: OffscreenCanvas;
    width: number;
    height: number;
    logicalWidth: number;
    logicalHeight: number;
  }): CompositorLayerSource => ({
    frame: {
      canvas: entry.canvas,
      width: entry.width,
      height: entry.height,
    },
    image: null,
    // Full transform (incl. scale); blit bakes scale into dest via layoutSize.
    transform: base,
    transform3d: layer.transform3d ?? null,
    blendMode: layer.blendMode,
    opacity: layer.opacity,
    adjust: layer.adjust,
    placement: layer.placement ?? "native",
    layoutSize: {
      width: entry.logicalWidth,
      height: entry.logicalHeight,
    },
  });

  if (
    layer.captionKaraoke &&
    layer.captionKaraoke.visible.length > 0 &&
    !hasActiveTextAnimation(layer.animation)
  ) {
    const { content: _c, ...baseStyle } = layer.text;
    const karaoke = compositeCaptionKaraoke({
      baseStyle,
      visible: layer.captionKaraoke.visible,
      activeIndex: layer.captionKaraoke.activeIndex,
      contentMs: layer.captionKaraoke.contentMs,
      display: layer.captionKaraoke.display,
      maxWrapWidth: layer.captionKaraoke.maxWrapWidth,
      pixelRatio,
    });
    if (!karaoke) return null;
    return toLayer(karaoke);
  }

  if (hasActiveTextAnimation(layer.animation)) {
    const layout = layoutTextUnits(layer.text, layer.animation);
    if (!layout) return null;
    const localMs = typeof layer.localMs === "number" ? layer.localMs : 0;
    const clipDur =
      typeof layer.clipDurationMs === "number" && layer.clipDurationMs > 0
        ? layer.clipDurationMs
        : 3000;
    const bounds = {
      blockW: layout.blockWidth,
      blockH: layout.blockHeight,
      stageW: Math.max(1, layoutWidth),
      stageH: Math.max(1, layoutHeight),
    };
    const states = layout.units.map((u) =>
      sampleTextUnitMotion({
        localMs,
        clipDurMs: clipDur,
        animation: layer.animation,
        unitIndex: u.index,
        unitCount: layout.units.length,
        bounds,
      }),
    );

    const propsFp = textPropsFingerprint(layer.text, pixelRatio);
    const unitBitmaps = new Map<
      number,
      {
        canvas: OffscreenCanvas;
        width: number;
        height: number;
        logicalWidth: number;
        logicalHeight: number;
      }
    >();
    const textKey = layer.textKey || "text";
    for (const u of layout.units) {
      if (u.text === "\n" || u.text.length === 0) continue;
      const uk = `${textKey}@${propsFp}|u${u.index}|${u.text}`;
      let cached = textUnitCache.get(uk);
      if (!cached) {
        // Whole-block uses full multiline rasterizer; fragments use unit raster.
        const raster =
          layout.granularity === "whole"
            ? rasterizeText(layer.text as TextProps, pixelRatio)
            : rasterizeTextUnit(layer.text, u.text, pixelRatio);
        if (!raster) continue;
        cached = {
          canvas: raster.canvas,
          width: raster.width,
          height: raster.height,
          logicalWidth: raster.logicalWidth,
          logicalHeight: raster.logicalHeight,
        };
        textUnitCache.set(uk, cached);
      }
      unitBitmaps.set(u.index, cached);
    }

    const composed = compositeAnimatedText({
      props: layer.text,
      layout,
      states,
      pixelRatio,
      overflowPad: ANIMATED_TEXT_OVERFLOW_PAD,
      unitBitmaps,
    });
    if (!composed) return null;
    // compositeAnimatedText allocates a throwaway canvas each call — copy
    // onto the export pool so GPU surfaces stay bounded across frames.
    const pooled = acquireExportCanvas(composed.width, composed.height);
    const pctx = pooled.getContext("2d", { willReadFrequently: true });
    if (!pctx) return toLayer(composed);
    pctx.clearRect(0, 0, composed.width, composed.height);
    pctx.drawImage(composed.canvas, 0, 0);
    return toLayer({
      canvas: pooled,
      width: composed.width,
      height: composed.height,
      logicalWidth: composed.logicalWidth,
      logicalHeight: composed.logicalHeight,
    });
  }

  const fp = `${textPropsFingerprint(layer.text, pixelRatio)}|${stageWidth}x${stageHeight}|dpr${devicePixelRatio}`;
  const cacheKey = `${layer.textKey || "text"}@${fp}`;
  const cached = textCache.get(cacheKey);

  if (cached && cached.fp === fp) {
    return toLayer(cached);
  }
  const raster = rasterizeText(layer.text as TextProps, pixelRatio);
  if (!raster) return null;
  const entry = {
    fp,
    canvas: raster.canvas,
    width: raster.width,
    height: raster.height,
    logicalWidth: raster.logicalWidth,
    logicalHeight: raster.logicalHeight,
  };
  textCache.set(cacheKey, entry);
  return toLayer(entry);
}

async function resolveLayerLut(
  layer: PreviewSeekLayer,
): Promise<CubeLut | null> {
  if (!layer.filter?.lutId || !layer.filter.lutUrl) return null;
  return ensureLut(layer.filter);
}

function withFilterFields(
  base: CompositorLayerSource,
  layer: PreviewSeekLayer,
  lut: CubeLut | null,
): CompositorLayerSource {
  return {
    ...base,
    transform3d: layer.transform3d ?? null,
    filter: layer.filter ?? null,
    lut,
    masksEnabled: layer.masksEnabled ?? null,
    masks: layer.masks ?? null,
    removeBg: layer.removeBg ?? null,
    crop: layer.crop ?? null,
  };
}

async function decodeVideoLayer(
  entry: VideoEntry,
  layer: PreviewSeekLayer,
  fps: number,
  gen: number,
): Promise<CompositorLayerSource | null> {
  const mode = layer.frameMode === "blend" ? "blend" : "nearest";
  const lut = await resolveLayerLut(layer);

  if (mode === "blend") {
    const { aMs, bMs, alpha } = blendSourcePair(layer.sourceMs, fps);
    if (alpha < 0.02 || Math.abs(aMs - bMs) < 0.5) {
      const canvas = await entry.cursor.get(Math.max(0, aMs / 1000));
      if (gen !== seekGeneration || !canvas) return null;
      return withFilterFields(
        {
          frame: {
            canvas,
            width: canvas.width,
            height: canvas.height,
          },
          image: null,
          transform: layer.transform,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
          adjust: layer.adjust,
        },
        layer,
        lut,
      );
    }

    // Queue both times before awaiting so they share one MediaBunny iterator.
    const [frameA, frameB] = await Promise.all([
      entry.cursor.get(Math.max(0, aMs / 1000)),
      entry.cursor.get(Math.max(0, bMs / 1000)),
    ]);
    if (gen !== seekGeneration || !frameA || !frameB) return null;

    const w = frameA.width;
    const h = frameA.height;
    const bctx = ensureBlendCanvas(w, h);
    bctx.clearRect(0, 0, w, h);
    bctx.globalAlpha = 1;
    bctx.drawImage(frameA, 0, 0);
    bctx.globalAlpha = alpha;
    bctx.drawImage(frameB, 0, 0);
    bctx.globalAlpha = 1;
    releaseExportCanvas(frameA);
    releaseExportCanvas(frameB);

    // Copy off blendCanvas — it is reused on the next blend.
    const out = acquireExportCanvas(w, h);
    const octx = out.getContext("2d", { willReadFrequently: true });
    if (!octx) return null;
    octx.drawImage(blendCanvas!, 0, 0);

    entry.lastFrameIndex = Math.floor((layer.sourceMs / 1000) * fps);
    return withFilterFields(
      {
        frame: { canvas: out, width: w, height: h },
        image: null,
        transform: layer.transform,
        blendMode: layer.blendMode,
        opacity: layer.opacity,
        adjust: layer.adjust,
      },
      layer,
      lut,
    );
  }

  const timestampSec = Math.max(0, layer.sourceMs / 1000);
  const canvas = await entry.cursor.get(timestampSec);
  if (gen !== seekGeneration || !canvas) return null;
  entry.lastFrameIndex = Math.floor((layer.sourceMs / 1000) * fps);
  return withFilterFields(
    {
      frame: {
        canvas,
        width: canvas.width,
        height: canvas.height,
      },
      image: null,
      transform: layer.transform,
      blendMode: layer.blendMode,
      opacity: layer.opacity,
      adjust: layer.adjust,
    },
    layer,
    lut,
  );
}

async function decodeMediaLayer(
  layer: PreviewSeekLayer,
  fps: number,
  gen: number,
  layoutWidth = stageWidth,
  layoutHeight = stageHeight,
): Promise<CompositorLayerSource | null> {
  if (!layer.assetId) return null;
  const entry = assets.get(layer.assetId);
  if (!entry) return null;
  if (entry.kind === "image") {
    const lut = await resolveLayerLut(layer);
    const animated = applyWholeLayerAnimation({
      transform: layer.transform,
      opacity: layer.opacity,
      animation: layer.animation,
      localMs: layer.localMs,
      clipDurationMs: layer.clipDurationMs,
      layoutSize: layer.layoutSize,
      layoutWidth,
      layoutHeight,
    });
    return withFilterFields(
      {
        image: entry.bitmap,
        frame: null,
        transform: animated.transform,
        blendMode: layer.blendMode,
        opacity: animated.opacity,
        adjust: layer.adjust,
        placement: layer.placement ?? null,
        layoutSize: layer.layoutSize ?? null,
      },
      layer,
      lut,
    );
  }
  return decodeVideoLayer(entry, layer, fps, gen);
}

/** Raw decoded frame source for transition sampling (no transform; crop applied). */
async function decodeRawFrame(
  layer: PreviewSeekLayer,
  fps: number,
  gen: number,
): Promise<{ canvas: CanvasImageSource; width: number; height: number } | null> {
  const src = await decodeMediaLayer(layer, fps, gen);
  if (!src) return null;
  let canvas: CanvasImageSource | null = null;
  let width = 0;
  let height = 0;
  if (src.frame) {
    canvas = src.frame.canvas;
    width = src.frame.width;
    height = src.frame.height;
  } else if (src.image) {
    const img = src.image;
    canvas = img;
    width =
      "width" in img && typeof img.width === "number" ? img.width : stageWidth;
    height =
      "height" in img && typeof img.height === "number" ? img.height : stageHeight;
  }
  if (!canvas || width < 1 || height < 1) return null;
  return applyCropToCanvas(canvas, width, height, layer.crop);
}

function flushComposed(
  composed: CompositorLayerSource[],
  layoutWidth: number,
  layoutHeight: number,
  clear: boolean,
): void {
  if (!stageCtx || composed.length === 0) return;
  draw({
    ctx: stageCtx,
    width: stageWidth,
    height: stageHeight,
    layoutWidth,
    layoutHeight,
    fit,
    layers: composed,
    clear,
  });
  composed.length = 0;
}

async function applyStagePostPass(
  kind: "filter" | "effect",
  layer: PreviewSeekLayer,
): Promise<void> {
  if (!stageCtx || !stage) return;
  const sctx = ensureStageSnap(stageWidth, stageHeight);
  sctx.drawImage(stage, 0, 0);

  if (kind === "filter" && layer.filter) {
    const lut = await ensureLut(layer.filter);
    if (!lut) return;
    const graded = applyLut(
      stageSnapCanvas!,
      stageWidth,
      stageHeight,
      lut,
      layer.filter.strength ?? 1,
    );
    stageCtx.clearRect(0, 0, stageWidth, stageHeight);
    stageCtx.drawImage(graded.canvas, 0, 0, stageWidth, stageHeight);
    return;
  }

  if (kind === "effect" && layer.effect?.effectId) {
    const result = sampleEffect(
      layer.effect.effectId,
      stageSnapCanvas!,
      stageWidth,
      stageHeight,
      layer.localMs ?? 0,
      layer.effect.intensity ?? 1,
    );
    stageCtx.clearRect(0, 0, stageWidth, stageHeight);
    stageCtx.drawImage(result.canvas, 0, 0, stageWidth, stageHeight);
  }
}

/** Always redraw for export (no skip cache). */
async function drawExportFrame(
  layers: PreviewSeekLayer[],
  fps: number,
  layoutWidth: number,
  layoutHeight: number,
): Promise<void> {
  if (!stageCtx || !stage) return;
  const gen = ++seekGeneration;

  if (layers.length === 0) {
    clearStage();
    return;
  }

  const composed: CompositorLayerSource[] = [];
  let cleared = false;

  const ensureCleared = () => {
    if (cleared) return;
    draw({
      ctx: stageCtx!,
      width: stageWidth,
      height: stageHeight,
      layoutWidth,
      layoutHeight,
      fit,
      layers: [],
      clear: true,
    });
    cleared = true;
  };

  for (const layer of layers) {
    if (layer.role === "filter" || layer.role === "effect") {
      ensureCleared();
      if (composed.length > 0) {
        flushComposed(composed, layoutWidth, layoutHeight, false);
      }
      await applyStagePostPass(layer.role, layer);
      continue;
    }

    if (layer.text) {
      const textLayer = getTextLayer(layer, layoutWidth, layoutHeight);
      if (textLayer) composed.push(textLayer);
      continue;
    }

    if (layer.transition) {
      const frameA = await decodeRawFrame(layer.transition.partner, fps, gen);
      const frameB = await decodeRawFrame(layer, fps, gen);
      if (frameA && frameB) {
        const sampled = sampleTransition(
          layer.transition.presetId,
          frameA,
          frameB,
          layer.transition.progress,
          {
            direction: layer.transition.direction,
            intensity: layer.transition.intensity,
          },
        );
        composed.push({
          frame: {
            canvas: sampled.canvas as OffscreenCanvas,
            width: sampled.width,
            height: sampled.height,
          },
          image: null,
          transform: layer.transform,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
          adjust: null,
          masksEnabled: layer.masksEnabled ?? null,
          masks: layer.masks ?? null,
          removeBg: layer.removeBg ?? null,
          placement: "frame",
        });
      }
      continue;
    }

    const decoded = await decodeMediaLayer(
      layer,
      fps,
      gen,
      layoutWidth,
      layoutHeight,
    );
    if (decoded) composed.push(decoded);
  }

  if (!cleared) {
    draw({
      ctx: stageCtx,
      width: stageWidth,
      height: stageHeight,
      layoutWidth,
      layoutHeight,
      fit,
      layers: composed,
      clear: true,
    });
  } else if (composed.length > 0) {
    flushComposed(composed, layoutWidth, layoutHeight, false);
  }
}

async function handleBeginEncode(
  msg: Extract<ExportWorkerRequest, { type: "beginEncode" }>,
) {
  if (!stage) {
    post({ type: "failure", error: "Export stage not initialized" });
    return;
  }
  if (encodeSession) {
    post({ type: "failure", error: "Export already in progress" });
    return;
  }

  stageWidth = Math.max(1, Math.round(msg.width));
  stageHeight = Math.max(1, Math.round(msg.height));
  stage.width = stageWidth;
  stage.height = stageHeight;
  stageCtx = stage.getContext("2d", { alpha: false });
  textCache.clear();
  textUnitCache.clear();
  emitPreview = Boolean(msg.emitPreview);

  const target = new StreamTarget(createStreamWritable(), {
    chunked: true,
    chunkSize: 16 * 1024 * 1024,
  });
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });

  const videoSource = new CanvasSource(stage, {
    codec: "avc",
    quality: qualityFromConfig(msg.videoQuality),
    // Software encode avoids competing with decode for IOSurface backing.
    hardwareAcceleration: "prefer-software",
  });
  output.addVideoTrack(videoSource, { frameRate: msg.fps });

  let audioSource: AudioSampleSource | null = null;
  if (msg.audio && msg.audio.pcm.length > 0) {
    const { sampleRate, numberOfChannels, pcm, audioQuality } = msg.audio;
    audioSource = new AudioSampleSource({
      codec: "aac",
      quality: qualityFromConfig(audioQuality),
    });
    output.addAudioTrack(audioSource);
    await output.start();
    await addPcmAsAudioSamples(audioSource, pcm, sampleRate, numberOfChannels);
    audioSource.close();
  } else {
    await output.start();
  }

  encodeSession = {
    output,
    videoSource,
    audioSource,
    fps: msg.fps,
    totalFrames: msg.totalFrames,
    layoutWidth: msg.layoutWidth,
    layoutHeight: msg.layoutHeight,
    cancelled: false,
  };
}

async function handleEncodeFrame(
  msg: Extract<ExportWorkerRequest, { type: "encodeFrame" }>,
) {
  const session = encodeSession;
  if (!session || session.cancelled) {
    post({
      type: "failure",
      frameIndex: msg.frameIndex,
      error: "No active encode session",
    });
    return;
  }
  try {
    await drawExportFrame(
      msg.layers,
      session.fps,
      session.layoutWidth,
      session.layoutHeight,
    );
    const timestamp = msg.frameIndex / session.fps;
    const duration = 1 / session.fps;
    await session.videoSource.add(timestamp, duration);
    await maybeEmitPreview(msg.frameIndex);
    releaseAllExportCanvases();
    post({ type: "frameDone", frameIndex: msg.frameIndex });
  } catch (err) {
    releaseAllExportCanvases();
    post({
      type: "failure",
      frameIndex: msg.frameIndex,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleFinishEncode() {
  const session = encodeSession;
  if (!session) {
    post({ type: "failure", error: "No active encode session" });
    return;
  }
  try {
    session.videoSource.close();
    await session.output.finalize();
    encodeSession = null;
    post({ type: "encodeDone" });
  } catch (err) {
    encodeSession = null;
    post({
      type: "failure",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleCancelEncode() {
  const session = encodeSession;
  if (!session) return;
  session.cancelled = true;
  encodeSession = null;
  for (const entry of assets.values()) {
    if (entry.kind === "video") entry.cursor.dispose();
  }
  releaseAllExportCanvases();
  try {
    session.videoSource.close();
  } catch {
    /* ignore */
  }
  try {
    await session.output.cancel();
  } catch {
    /* ignore */
  }
  for (const [, pending] of pendingWrites) {
    pending.reject(new Error("Export cancelled"));
  }
  pendingWrites.clear();
}

let messageChain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ExportWorkerRequest>) => {
  const msg = event.data;
  if (!msg?.type) return;

  if (msg.type === "streamWriteAck") {
    const pending = pendingWrites.get(msg.writeId);
    if (pending) {
      pendingWrites.delete(msg.writeId);
      if (msg.ok) pending.resolve();
      else pending.reject(new Error(msg.error || "Stream write failed"));
    }
    return;
  }

  messageChain = messageChain
    .then(async () => {
      switch (msg.type) {
        case "init":
          await handleInit(msg);
          break;
        case "load":
          await handleLoad(msg);
          break;
        case "loadLut": {
          try {
            const lut = parseCubeLut(msg.text);
            cacheLut(msg.lutId, lut);
          } catch (err) {
            post({
              type: "failure",
              error: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }
        case "beginEncode":
          await handleBeginEncode(msg);
          break;
        case "encodeFrame":
          await handleEncodeFrame(msg);
          break;
        case "finishEncode":
          await handleFinishEncode();
          break;
        case "cancelEncode":
          await handleCancelEncode();
          break;
        default:
          break;
      }
    })
    .catch((err) => {
      console.error("Export worker message failed", err);
      post({
        type: "failure",
        error: err instanceof Error ? err.message : String(err),
      });
    });
};
