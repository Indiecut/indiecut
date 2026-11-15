/// <reference lib="webworker" />

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { resolveBlendMode, resolveOpacity } from "../compositor/blend";
import { adjustFingerprint } from "../compositor/colorAdjust";
import { draw } from "../compositor/draw";
import { applyCropToCanvas, cropFingerprint } from "../compositor/crop";
import { maskFingerprint } from "../compositor/maskFingerprint";
import { removeBgFingerprint } from "../compositor/removeBgColor";
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
import {
  resolveTransform,
  transformFingerprint,
} from "../compositor/transform";
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
  textAnimationFingerprint,
} from "../engine/textAnimation";
import { sampleTransition } from "../engine/transitions";
import type { ResolvedTransform } from "../engine/animatable";
import { ensureTextFontsLoaded } from "../fonts/registry";
import type { BlendMode, TextProps } from "../project/types";
import type {
  PreviewSeekLayer,
  PreviewTextLayout,
  PreviewWorkerRequest,
  PreviewWorkerResponse,
} from "./previewWorkerProtocol";

type VideoEntry = {
  kind: "video";
  input: Input;
  sink: CanvasSink;
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
/** Fingerprint of last drawn layer set for skip. */
let lastDrawKey = "";
let lastTextLayouts: PreviewTextLayout[] = [];

/** Scratch canvas for frame blending. */
let blendCanvas: OffscreenCanvas | null = null;
let blendCtx: OffscreenCanvasRenderingContext2D | null = null;

function post(msg: PreviewWorkerResponse) {
  self.postMessage(msg);
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
  lastDrawKey = "";
  lastTextLayouts = [];
}

async function disposeAsset(entry: AssetEntry) {
  if (entry.kind === "video") {
    await entry.input.dispose();
  } else {
    entry.bitmap.close();
  }
}

/** Content-sized sink — compositor owns contain/cover + transform. */
function createContentSink(
  track: NonNullable<Awaited<ReturnType<Input["getPrimaryVideoTrack"]>>>,
): CanvasSink {
  return new CanvasSink(track, { poolSize: 3 });
}

function ensureBlendCanvas(w: number, h: number): OffscreenCanvasRenderingContext2D {
  if (!blendCanvas || blendCanvas.width !== w || blendCanvas.height !== h) {
    blendCanvas = new OffscreenCanvas(w, h);
    blendCtx = blendCanvas.getContext("2d");
  }
  if (!blendCtx) throw new Error("Blend canvas 2D unavailable");
  return blendCtx;
}

async function handleInit(msg: Extract<PreviewWorkerRequest, { type: "init" }>) {
  stage = msg.canvas;
  stageWidth = Math.max(1, Math.round(msg.width));
  stageHeight = Math.max(1, Math.round(msg.height));
  fit = msg.fit;
  if (typeof msg.devicePixelRatio === "number" && msg.devicePixelRatio > 0) {
    devicePixelRatio = msg.devicePixelRatio;
  }
  stage.width = stageWidth;
  stage.height = stageHeight;
  stageCtx = stage.getContext("2d");
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
  clearStage();
  post({ type: "ready" });
}

async function handleResize(
  msg: Extract<PreviewWorkerRequest, { type: "resize" }>,
) {
  if (!stage || !stageCtx) return;
  stageWidth = Math.max(1, Math.round(msg.width));
  stageHeight = Math.max(1, Math.round(msg.height));
  fit = msg.fit;
  if (typeof msg.devicePixelRatio === "number" && msg.devicePixelRatio > 0) {
    devicePixelRatio = msg.devicePixelRatio;
  }
  stage.width = stageWidth;
  stage.height = stageHeight;
  // Sinks stay content-sized; only stage + compositor fit change.
  // Text supersample depends on stage size — drop cache.
  textCache.clear();
  lastDrawKey = "";
  lastTextLayouts = [];
}

async function handleLoad(msg: Extract<PreviewWorkerRequest, { type: "load" }>) {
  const existing = assets.get(msg.assetId);
  if (existing) {
    await disposeAsset(existing);
    assets.delete(msg.assetId);
  }

  try {
    if (msg.kind === "image") {
      let bitmap: ImageBitmap;
      if (msg.bitmap) {
        bitmap = msg.bitmap;
      } else if (msg.buffer) {
        const blob = new Blob([msg.buffer], {
          type: msg.mimeHint || "image/*",
        });
        bitmap = await createImageBitmap(blob);
      } else {
        throw new Error("Image load missing bitmap and buffer");
      }
      assets.set(msg.assetId, { kind: "image", bitmap });
    } else {
      if (!msg.buffer) throw new Error("Video load missing buffer");
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
        lastFrameIndex: -1,
      });
    }
    // Asset content changed — never skip the next identical seek fingerprint.
    lastDrawKey = "";
    post({ type: "loaded", assetId: msg.assetId });
  } catch (err) {
    post({
      type: "failure",
      assetId: msg.assetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleUnload(
  msg: Extract<PreviewWorkerRequest, { type: "unload" }>,
) {
  const entry = assets.get(msg.assetId);
  if (!entry) return;
  await disposeAsset(entry);
  assets.delete(msg.assetId);
}

function mediaFrameKey(layer: PreviewSeekLayer, fps: number): string {
  const frameF = (layer.sourceMs / 1000) * fps;
  return layer.frameMode === "blend"
    ? frameF.toFixed(3)
    : String(Math.floor(frameF));
}

function transform3dFingerprint(
  t: PreviewSeekLayer["transform3d"],
): string {
  if (!t?.enabled) return "";
  return `3d:${t.rotateX.toFixed(2)},${t.rotateY.toFixed(2)},${t.rotateZ.toFixed(2)},${t.z.toFixed(1)},${t.perspective.toFixed(0)}`;
}

function layerDrawKey(layer: PreviewSeekLayer, fps: number): string {
  const xf = transformFingerprint(layer.transform as ResolvedTransform | null);
  const x3 = transform3dFingerprint(layer.transform3d);
  const blend = resolveBlendMode(layer.blendMode as BlendMode | null);
  const opac = resolveOpacity(layer.opacity).toFixed(3);
  const adj = adjustFingerprint(layer.adjust);
  const mask = maskFingerprint(layer.masksEnabled, layer.masks);
  const rbg = removeBgFingerprint(layer.removeBg);
  const crop = cropFingerprint(layer.crop);
  const place = layer.placement === "native" ? "n" : "f";
  const filt = layer.filter
    ? `${layer.filter.lutId}@${(layer.filter.strength ?? 1).toFixed(3)}`
    : "";

  if (layer.role === "filter" && layer.filter) {
    return `role:filter|${filt}|${Math.round(layer.localMs ?? 0)}`;
  }
  if (layer.role === "effect" && layer.effect) {
    return `role:effect|${layer.effect.effectId}@${(layer.effect.intensity ?? 1).toFixed(3)}|${Math.round(layer.localMs ?? 0)}`;
  }

  if (layer.text) {
    const key = layer.textKey || "text";
    const tr = resolveTransform(layer.transform);
    const pr = textRasterPixelRatio({
      scaleX: tr.scaleX,
      scaleY: tr.uniformScale !== false ? tr.scaleX : tr.scaleY,
      stageWidth,
      layoutWidth: 1920, // refined in getTextLayer; key still includes xf scale
      devicePixelRatio,
    });
    const anim = textAnimationFingerprint(layer.animation);
    const local =
      hasActiveTextAnimation(layer.animation) &&
      typeof layer.localMs === "number"
        ? Math.round(layer.localMs)
        : "";
    const clipDur =
      typeof layer.clipDurationMs === "number"
        ? Math.round(layer.clipDurationMs)
        : "";
    const karaoke = layer.captionKaraoke
      ? (() => {
          const d = layer.captionKaraoke!.display;
          const wrap = Math.round(layer.captionKaraoke!.maxWrapWidth ?? 0);
          return `k${layer.captionKaraoke!.activeIndex}@${Math.round(layer.captionKaraoke!.contentMs)}|w${wrap}|${d.displayStyle}|${d.wordHighlight ? 1 : 0}|${d.highlightZoom ? 1 : 0}|${d.highlightEnergyZoom ? 1 : 0}|${d.highlightColor}|${d.highlightBackgroundColor}|${d.highlightBackgroundAlpha}|${d.backgroundColor}|${d.backgroundAlpha}|${layer.captionKaraoke!.visible.map((w) => w.text).join(" ")}`;
        })()
      : "";
    return `text:${key}@${textPropsFingerprint(layer.text, pr)}|${xf}|${x3}|${blend}|${opac}|${adj}|${place}|${stageWidth}|${anim}|${local}|${clipDur}|${karaoke}`;
  }

  if (layer.transition) {
    const t = layer.transition;
    const a = mediaFrameKey(t.partner, fps);
    const b = mediaFrameKey(layer, fps);
    return `tr:${t.presetId}@${t.progress.toFixed(3)}|${t.partner.assetId}@${a}|${layer.assetId}@${b}|${filt}|${blend}|${opac}|${crop}|${x3}`;
  }

  const frameIndex = mediaFrameKey(layer, fps);
  const fm = layer.frameMode === "blend" ? "b" : "n";
  const layout = layer.layoutSize
    ? `${Math.round(layer.layoutSize.width)}x${Math.round(layer.layoutSize.height)}`
    : "";
  const anim = textAnimationFingerprint(layer.animation);
  const local =
    hasActiveTextAnimation(layer.animation) &&
    typeof layer.localMs === "number"
      ? Math.round(layer.localMs)
      : "";
  return `${layer.assetId ?? "?"}@${frameIndex}|${xf}|${x3}|${blend}|${opac}|${adj}|${fm}|${place}|${layout}|${filt}|${mask}|${rbg}|${crop}|${anim}|${local}`;
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
    return toLayer(composed);
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
      const wrapped = await entry.sink.getCanvas(Math.max(0, aMs / 1000));
      if (gen !== seekGeneration || !wrapped) return null;
      return withFilterFields(
        {
          frame: {
            canvas: wrapped.canvas,
            width: wrapped.canvas.width,
            height: wrapped.canvas.height,
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

    const frameA = await entry.sink.getCanvas(Math.max(0, aMs / 1000));
    if (gen !== seekGeneration || !frameA) return null;
    const frameB = await entry.sink.getCanvas(Math.max(0, bMs / 1000));
    if (gen !== seekGeneration || !frameB) return null;

    const w = frameA.canvas.width;
    const h = frameA.canvas.height;
    const bctx = ensureBlendCanvas(w, h);
    bctx.clearRect(0, 0, w, h);
    bctx.globalAlpha = 1;
    bctx.drawImage(frameA.canvas, 0, 0);
    bctx.globalAlpha = alpha;
    bctx.drawImage(frameB.canvas, 0, 0);
    bctx.globalAlpha = 1;

    // Copy to a fresh canvas — blendCanvas is reused.
    const out = new OffscreenCanvas(w, h);
    const octx = out.getContext("2d");
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
  const wrapped = await entry.sink.getCanvas(timestampSec);
  if (gen !== seekGeneration || !wrapped) return null;
  entry.lastFrameIndex = Math.floor((layer.sourceMs / 1000) * fps);
  return withFilterFields(
    {
      frame: {
        canvas: wrapped.canvas,
        width: wrapped.canvas.width,
        height: wrapped.canvas.height,
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
  if (!entry) {
    console.warn("Preview worker: missing asset", layer.assetId);
    // Allow a later seek with the same fingerprint after load.
    lastDrawKey = "";
    return null;
  }
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
  const snap = new OffscreenCanvas(stageWidth, stageHeight);
  const sctx = snap.getContext("2d");
  if (!sctx) return;
  sctx.drawImage(stage, 0, 0);

  if (kind === "filter" && layer.filter) {
    const lut = await ensureLut(layer.filter);
    if (!lut) return;
    const graded = applyLut(
      snap,
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
      snap,
      stageWidth,
      stageHeight,
      layer.localMs ?? 0,
      layer.effect.intensity ?? 1,
    );
    stageCtx.clearRect(0, 0, stageWidth, stageHeight);
    stageCtx.drawImage(result.canvas, 0, 0, stageWidth, stageHeight);
  }
}

async function handleSeek(msg: Extract<PreviewWorkerRequest, { type: "seek" }>) {
  if (!stageCtx || !stage) {
    post({ type: "seeked", requestId: msg.requestId });
    return;
  }
  const fps = Math.max(1, msg.fps || 30);
  const layers = msg.layers ?? [];

  if (layers.length === 0) {
    clearStage();
    post({ type: "seeked", requestId: msg.requestId });
    return;
  }

  const layoutWidth = Math.max(1, msg.layoutWidth || stageWidth);
  const layoutHeight = Math.max(1, msg.layoutHeight || stageHeight);
  const drawKey = `${layoutWidth}x${layoutHeight}|${layers
    .map((l) => layerDrawKey(l, fps))
    .join("||")}`;

  if (!msg.force && drawKey === lastDrawKey) {
    post({
      type: "seeked",
      requestId: msg.requestId,
      textLayouts: lastTextLayouts,
    });
    return;
  }

  const gen = ++seekGeneration;

  try {
    const composed: CompositorLayerSource[] = [];
    const textLayouts: PreviewTextLayout[] = [];
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
        if (textLayer) {
          composed.push(textLayer);
          const key = layer.textKey;
          if (key && textLayer.layoutSize) {
            textLayouts.push({
              key,
              width: textLayer.layoutSize.width,
              height: textLayer.layoutSize.height,
            });
          }
        }
        continue;
      }

      if (layer.transition) {
        const frameA = await decodeRawFrame(layer.transition.partner, fps, gen);
        if (gen !== seekGeneration) {
          post({ type: "seeked", requestId: msg.requestId });
          return;
        }
        const frameB = await decodeRawFrame(layer, fps, gen);
        if (gen !== seekGeneration) {
          post({ type: "seeked", requestId: msg.requestId });
          return;
        }
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
      if (gen !== seekGeneration) {
        post({ type: "seeked", requestId: msg.requestId });
        return;
      }
      if (decoded) composed.push(decoded);
    }

    if (gen !== seekGeneration) {
      post({ type: "seeked", requestId: msg.requestId });
      return;
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

    lastDrawKey = drawKey;
    lastTextLayouts = textLayouts;
    post({
      type: "seeked",
      requestId: msg.requestId,
      textLayouts,
    });
  } catch (err) {
    if (gen !== seekGeneration) {
      post({ type: "seeked", requestId: msg.requestId });
      return;
    }
    post({
      type: "failure",
      requestId: msg.requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function handleClear() {
  clearStage();
}

async function handleSampleSourcePixel(
  msg: Extract<PreviewWorkerRequest, { type: "sampleSourcePixel" }>,
): Promise<void> {
  const entry = assets.get(msg.assetId);
  if (!entry) {
    post({
      type: "failure",
      assetId: msg.assetId,
      requestId: msg.requestId,
      error: `Asset not loaded: ${msg.assetId}`,
    });
    return;
  }

  let canvas: OffscreenCanvas | HTMLCanvasElement | ImageBitmap;
  let w: number;
  let h: number;

  if (entry.kind === "image") {
    canvas = entry.bitmap;
    w = entry.bitmap.width;
    h = entry.bitmap.height;
  } else {
    const wrapped = await entry.sink.getCanvas(
      Math.max(0, msg.sourceMs / 1000),
    );
    if (!wrapped) {
      post({
        type: "failure",
        assetId: msg.assetId,
        requestId: msg.requestId,
        error: "Failed to decode frame for sample",
      });
      return;
    }
    canvas = wrapped.canvas;
    w = wrapped.canvas.width;
    h = wrapped.canvas.height;
  }

  if (w < 1 || h < 1) {
    post({
      type: "failure",
      assetId: msg.assetId,
      requestId: msg.requestId,
      error: "Empty frame for sample",
    });
    return;
  }

  const scratch = new OffscreenCanvas(w, h);
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    post({
      type: "failure",
      assetId: msg.assetId,
      requestId: msg.requestId,
      error: "2D context unavailable for sample",
    });
    return;
  }
  ctx.drawImage(canvas, 0, 0);
  const u = Math.min(1, Math.max(0, msg.u));
  const v = Math.min(1, Math.max(0, msg.v));
  const x = Math.min(w - 1, Math.max(0, Math.floor(u * (w - 1))));
  const y = Math.min(h - 1, Math.max(0, Math.floor(v * (h - 1))));
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  post({
    type: "sampledSourcePixel",
    requestId: msg.requestId,
    r: pixel[0] ?? 0,
    g: pixel[1] ?? 0,
    b: pixel[2] ?? 0,
  });
}

let messageChain: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<PreviewWorkerRequest>) => {
  const msg = event.data;
  if (!msg?.type) return;

  messageChain = messageChain
    .then(async () => {
      switch (msg.type) {
        case "init":
          await handleInit(msg);
          break;
        case "resize":
          await handleResize(msg);
          break;
        case "load":
          await handleLoad(msg);
          break;
        case "unload":
          await handleUnload(msg);
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
        case "seek":
          await handleSeek(msg);
          break;
        case "clear":
          handleClear();
          break;
        case "sampleSourcePixel":
          await handleSampleSourcePixel(msg);
          break;
        default:
          break;
      }
    })
    .catch((err) => {
      console.error("Preview worker message failed", err);
    });
};
