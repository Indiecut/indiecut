import type {
  ResolvedTransform,
  ResolvedTransform3D,
} from "../engine/animatable";
import type {
  BlendMode,
  Clip,
  CropRect,
  EffectClipParams,
  FilterClipParams,
  RemoveBgParams,
  ResolvedClipMask,
  ResolvedColorAdjust,
  TextProps,
  TransitionParams,
} from "../project/types";
import type { CubeLut } from "../engine/lutCube";

export type CompositorFit = "contain" | "cover";

/** Per-layer placement: frame = contain/cover into composition; native = 1:1 px size. */
export type LayerPlacement = "frame" | "native";

/** Drawable frame source — HTMLCanvasElement or OffscreenCanvas from CanvasSink. */
export type DecodedFrameSource = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
};

export type CompositorLayerSource = {
  frame?: DecodedFrameSource | null;
  image?: ImageBitmap | CanvasImageSource | null;
  /** Clip transform — identity when omitted (resolved flat numbers). */
  transform?: ResolvedTransform | null;
  /** Opt-in 3D plane — when set, blit bakes perspective instead of affine. */
  transform3d?: ResolvedTransform3D | null;
  /** Blend vs layers below — normal when omitted. */
  blendMode?: BlendMode | null;
  /** Layer opacity for blend pass — 0..1, default 1 when omitted. */
  opacity?: number | null;
  /** Color adjust — applied after decode, before transform/blend. */
  adjust?: ResolvedColorAdjust | null;
  /** When true and masks present, apply matte after transform. */
  masksEnabled?: boolean | null;
  masks?: ResolvedClipMask[] | null;
  /** Remove BG — chroma key in source space after Adjust/LUT. */
  removeBg?: RemoveBgParams | null;
  /** Source crop (normalized) — applied after remove BG, before fit/transform. */
  crop?: CropRect | null;
  /** Clip-scoped LUT — after color adjust, before transform (flat strength). */
  filter?: {
    lutId: string;
    strength: number;
    lutPath?: string;
    category?: string;
  } | null;
  /** Parsed LUT (worker resolves from filter.lutId). */
  lut?: CubeLut | null;
  /** Default frame (video/image). Text/stickers use native. */
  placement?: LayerPlacement | null;
  /**
   * Logical content size in layout pixels (pre-transform).
   * When set with native placement, destination size uses this × transform
   * scale (bitmap may be supersampled and is scaled into that rect).
   */
  layoutSize?: { width: number; height: number } | null;
};

export type CompositorDrawContext = {
  /** Target 2D context (main canvas or OffscreenCanvas). */
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  width: number;
  height: number;
  fit: CompositorFit;
  /**
   * Coordinate space for transform x/y (project composition pixels).
   * Defaults to width/height when omitted (export at project resolution).
   */
  layoutWidth?: number;
  layoutHeight?: number;
  /**
   * Layers bottom → top.
   * Empty array clears to black (when clear !== false).
   */
  layers?: CompositorLayerSource[];
  /** When false, composite layers without clearing (for mid-stack post-passes). */
  clear?: boolean;
};

/** Partner clip for an active transition (outgoing A). */
export type ResolvedTransitionPartner = {
  clip: Clip;
  mediaId: string;
  kind: "video" | "image";
  sourceMs: number;
  localMs: number;
  /** Evaluated flat transform/opacity at partner localMs. */
  resolvedTransform: ResolvedTransform;
  resolvedOpacity: number;
  resolvedAdjust?: ResolvedColorAdjust;
  resolvedMasks?: ResolvedClipMask[];
};

export type ResolvedPreviewClip = {
  clip: Clip;
  mediaId?: string;
  stickerId?: string;
  /** Relative path under /stickers/ for bundled pack. */
  stickerFile?: string;
  kind: "video" | "image" | "text" | "caption" | "sticker" | "filter" | "effect";
  /** Source media time in ms (inMs + remapped local); 0 for text/sticker/fx. */
  sourceMs: number;
  localMs: number;
  /** Active caption cue text (or other resolved overlay text). */
  resolvedText?: TextProps;
  /** Evaluated flat transform/opacity at localMs (visual layers). */
  resolvedTransform?: ResolvedTransform;
  /** Evaluated 3D plane when enabled; omit/null when 2D. */
  resolvedTransform3d?: ResolvedTransform3D | null;
  resolvedOpacity?: number;
  resolvedAdjust?: ResolvedColorAdjust;
  resolvedMasks?: ResolvedClipMask[];
  resolvedFilterStrength?: number;
  resolvedEffectIntensity?: number;
  /** When set, this layer is a transition composite of partner (A) → clip (B). */
  transitionPartner?: ResolvedTransitionPartner;
  transitionProgress?: number;
  transition?: TransitionParams;
  /** Adjustment-layer filter / effect params. */
  filter?: FilterClipParams;
  effect?: EffectClipParams;
};
