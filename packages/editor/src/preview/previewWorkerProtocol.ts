import type { CompositorFit, LayerPlacement } from "../compositor/types";
import type {
  ResolvedTransform,
  ResolvedTransform3D,
} from "../engine/animatable";
import type {
  BlendMode,
  CropRect,
  FilterCategory,
  RemoveBgParams,
  ResolvedClipMask,
  ResolvedColorAdjust,
  SpeedFrameMode,
  TextAnimationParams,
  TextProps,
  TransitionParams,
} from "../project/types";

export type PreviewAssetKind = "video" | "image";

/** Clip-scoped or adjustment-layer filter with resolved LUT URL for the worker. */
export type PreviewFilterLayer = {
  lutId: string;
  lutPath?: string;
  /** Evaluated 0–1 strength (flat). */
  strength: number;
  category?: FilterCategory;
  /** Fetch URL for the .cube file (bundled or project-relative via asset protocol). */
  lutUrl: string;
};

export type PreviewEffectLayer = {
  effectId: string;
  /** Evaluated 0–1 intensity (flat). */
  intensity?: number;
};

export type PreviewTransitionLayer = {
  presetId: string;
  progress: number;
  direction?: TransitionParams["direction"];
  intensity?: number;
  /** Outgoing clip A — decoded like a normal media layer. */
  partner: PreviewSeekLayer;
};

export type PreviewSeekLayer = {
  /** Media / sticker asset id; omit for text-only / filter / effect layers. */
  assetId?: string;
  sourceMs: number;
  transform?: ResolvedTransform | null;
  /** Opt-in 3D plane params when enabled. */
  transform3d?: ResolvedTransform3D | null;
  blendMode?: BlendMode | null;
  /** Layer opacity for blend pass — 0..1, default 1 when omitted. */
  opacity?: number | null;
  adjust?: ResolvedColorAdjust | null;
  /** Clip masks — video/image media layers only. */
  masksEnabled?: boolean | null;
  masks?: ResolvedClipMask[] | null;
  /** Remove BG — video/image media layers only. */
  removeBg?: RemoveBgParams | null;
  /** Source crop — video/image media layers only. */
  crop?: CropRect | null;
  /** Clip-scoped LUT. */
  filter?: PreviewFilterLayer | null;
  /** Fractional source-frame synthesis for video. */
  frameMode?: SpeedFrameMode | null;
  /** When set, worker rasterizes text instead of decoding an asset. */
  text?: TextProps | null;
  /** Cache / draw-key id for text (usually clip id). */
  textKey?: string | null;
  placement?: LayerPlacement | null;
  /**
   * Logical content size for native placement (e.g. kinetic 256×256 while the
   * bitmap is supersampled larger for sharpness).
   */
  layoutSize?: { width: number; height: number } | null;
  /** Clip-local ms for text In/Out/Loop sampling / effects. */
  localMs?: number | null;
  /** Clip duration ms — phase windows for text animation. */
  clipDurationMs?: number | null;
  /** Text In/Out/Loop params. */
  animation?: TextAnimationParams | null;
  /**
   * Caption Display style karaoke (word highlight / reveal paint).
   * When set, worker composites per-word instead of a single text raster.
   */
  captionKaraoke?: {
    visible: Array<{ text: string; startMs: number; endMs: number }>;
    activeIndex: number;
    contentMs: number;
    /** Max wrap width in layout px. */
    maxWrapWidth?: number;
    display: {
      displayStyle: "full" | "line" | "word" | "reveal";
      wordHighlight: boolean;
      backgroundColor: string;
      backgroundAlpha: number;
      highlightColor: string;
      highlightBackgroundColor: string;
      highlightBackgroundAlpha: number;
      highlightZoom: boolean;
      highlightEnergyZoom: boolean;
    };
  } | null;
  /**
   * Adjustment-layer roles: filter/effect post-process the stage buffer.
   * Default is a normal drawable layer.
   */
  role?: "media" | "filter" | "effect";
  /** Effect-track params (when role === "effect"). */
  effect?: PreviewEffectLayer | null;
  /** Active transition — worker decodes this layer (B) + partner (A). */
  transition?: PreviewTransitionLayer | null;
};

export type PreviewWorkerInit = {
  type: "init";
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  fit: CompositorFit;
  devicePixelRatio?: number;
};

export type PreviewWorkerResize = {
  type: "resize";
  width: number;
  height: number;
  fit: CompositorFit;
  devicePixelRatio?: number;
};

export type PreviewWorkerLoad = {
  type: "load";
  assetId: string;
  kind: PreviewAssetKind;
  /** Transferred ArrayBuffer of proxy/master/image bytes */
  buffer?: ArrayBuffer;
  mimeHint?: string;
  /**
   * Optional pre-decoded bitmap (e.g. stickers rasterized on the main thread).
   * Transferred — preferred over buffer for images when set.
   */
  bitmap?: ImageBitmap;
};

export type PreviewWorkerUnload = {
  type: "unload";
  assetId: string;
};

export type PreviewWorkerLoadLut = {
  type: "loadLut";
  lutId: string;
  /** Raw .cube text */
  text: string;
};

export type PreviewWorkerSeek = {
  type: "seek";
  /** Layers bottom → top */
  layers: PreviewSeekLayer[];
  requestId: number;
  /** Project fps for frame-index skip */
  fps: number;
  /**
   * Project composition size — transform x/y are in these pixels.
   * Preview stage maps them via layoutWidth/Height → canvas size.
   */
  layoutWidth: number;
  layoutHeight: number;
  /** When true, bypass draw-key skip (e.g. after a late asset load). */
  force?: boolean;
};

export type PreviewWorkerClear = {
  type: "clear";
};

export type PreviewWorkerSampleSourcePixel = {
  type: "sampleSourcePixel";
  requestId: number;
  assetId: string;
  /** Source media time ms — video seeks here before sampling. */
  sourceMs: number;
  /** Normalized source UV 0..1. */
  u: number;
  v: number;
};

/** Capture the current stage composite as a downscaled JPEG/WebP. */
export type PreviewWorkerCaptureComposite = {
  type: "captureComposite";
  requestId: number;
  /** Max output width (height scales). Default 768. */
  maxWidth?: number;
  /** JPEG/WebP quality 0..1. Default 0.7. */
  quality?: number;
  /** Prefer image/jpeg or image/webp. */
  mimeType?: "image/jpeg" | "image/webp";
};

export type PreviewWorkerRequest =
  | PreviewWorkerInit
  | PreviewWorkerResize
  | PreviewWorkerLoad
  | PreviewWorkerUnload
  | PreviewWorkerLoadLut
  | PreviewWorkerSeek
  | PreviewWorkerClear
  | PreviewWorkerSampleSourcePixel
  | PreviewWorkerCaptureComposite;

export type PreviewWorkerReady = {
  type: "ready";
};

export type PreviewWorkerLoaded = {
  type: "loaded";
  assetId: string;
};

export type PreviewTextLayout = {
  /** Matches PreviewSeekLayer.textKey (clip id or clip:cue). */
  key: string;
  width: number;
  height: number;
};

export type PreviewWorkerSeeked = {
  type: "seeked";
  requestId: number;
  /** Logical layout sizes actually used to blit text this frame. */
  textLayouts?: PreviewTextLayout[];
};

export type PreviewWorkerFailure = {
  type: "failure";
  assetId?: string;
  requestId?: number;
  error: string;
};

export type PreviewWorkerSampledSourcePixel = {
  type: "sampledSourcePixel";
  requestId: number;
  r: number;
  g: number;
  b: number;
};

export type PreviewWorkerCapturedComposite = {
  type: "capturedComposite";
  requestId: number;
  width: number;
  height: number;
  mimeType: string;
  /** JPEG/WebP bytes — transferred. */
  buffer: ArrayBuffer;
};

export type PreviewWorkerResponse =
  | PreviewWorkerReady
  | PreviewWorkerLoaded
  | PreviewWorkerSeeked
  | PreviewWorkerFailure
  | PreviewWorkerSampledSourcePixel
  | PreviewWorkerCapturedComposite;
