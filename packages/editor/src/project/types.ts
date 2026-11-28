/** Project document + timeline types (disk-ready shape; IDs/paths only — no Blobs). */

export type ResolutionMode = "adapted" | "720p" | "1080p" | "2k";
export type AspectRatio = "16:9" | "9:16" | "1:1" | string;
export type ColorSpace = "sdr_rec709" | string;
export type ImportMaterialMode = "copy_to_project" | "keep_original";

export type TrackType =
  | "video"
  | "overlay"
  | "audio"
  | "text"
  | "caption"
  | "sticker"
  | "effect"
  | "filter";

export type ClipKind =
  | "video"
  | "image"
  | "audio"
  | "text"
  | "caption"
  | "sticker"
  | "effect"
  | "filter"
  | "transition";

export type MediaKind = "video" | "audio" | "image";

export type BlendMode =
  | "normal"
  | "brighten"
  | "screen"
  | "darken"
  | "overlay"
  | "hardLight"
  | "softLight"
  | "colorBurn"
  | "linearBurn"
  | "colorDodge"
  | "multiply";

/** Graphs easing preset ids — see documents/keyframes/keyframe_presets.md */
export type EasingPresetId =
  | "none" // linear
  | "ease_in"
  | "quad_in"
  | "cubic_in"
  | "ease_out"
  | "quad_out"
  | "cubic_out"
  | "ease"
  | "quad_ease"
  | "custom";

export type TangentMode = "linear" | "auto" | "aligned" | "broken" | "hold";

/** Normalized segment-space handle (CSS cubic control point). */
export type KeyframeHandle = { dx: number; dy: number };

export type PropertyKeyframe<T> = {
  id: string;
  /** ms from clip local start (0 … durationMs). Survives clip move. */
  timeOffsetMs: number;
  value: T;
  /** Preset badge in UI; becomes "custom" when handles are dragged. */
  easingPresetId: EasingPresetId;
  tangentMode: TangentMode;
  /** Outgoing handle of this keyframe (drives segment → next). */
  outHandle: KeyframeHandle;
  /** Incoming handle (used by previous segment / graph UI). */
  inHandle: KeyframeHandle;
};

export type AnimatableProperty<T> = {
  /** Value when keyframes.length === 0 */
  staticValue: T;
  keyframes: PropertyKeyframe<T>[]; // sorted by timeOffsetMs ASC
};

/** Stored clip transform — numeric leaves are animatable. */
export type Transform = {
  x: AnimatableProperty<number>;
  y: AnimatableProperty<number>;
  scaleX: AnimatableProperty<number>;
  scaleY: AnimatableProperty<number>;
  rotation: AnimatableProperty<number>;
  uniformScale?: boolean;
};

/**
 * Opt-in 3D plane transform — perspective tilt / depth on top of 2D Transform.
 * When `enabled` is false (or missing), the clip uses the normal 2D blit path.
 */
export type Transform3D = {
  enabled: boolean;
  rotateX: AnimatableProperty<number>;
  rotateY: AnimatableProperty<number>;
  rotateZ: AnimatableProperty<number>;
  /** Depth offset (positive = toward camera in our bake). */
  z: AnimatableProperty<number>;
  /** Perspective camera distance (larger = flatter). */
  perspective: AnimatableProperty<number>;
};

export const DEFAULT_TRANSFORM3D_PERSPECTIVE = 800;

/**
 * Per-clip media crop in normalized source space (0–1).
 * Missing / full-frame means no crop. Not keyframed (v1).
 */
export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Cubic Bézier handle relative to a speed keyframe (dt, dv). */
export type SpeedHandle = { dt: number; dv: number };

/** Speed graph keyframe — t is normalized 0–1 along clip timeline. */
export type SpeedKeyframe = {
  t: number;
  v: number;
  inHandle?: SpeedHandle;
  outHandle?: SpeedHandle;
};

export type SpeedFrameMode = "nearest" | "blend";

/** Speed curve preset ids — see desktop_version/speed_curve_design.png */
export type SpeedCurvePresetId =
  | "none"
  | "customized"
  | "montage"
  | "hero_time"
  | "bullet"
  | "jump_cut"
  | "flash_in"
  | "flash_out";

/** Constant speed or Bézier curve remapping — see EDITOR_MATH.md */
export type SpeedCurve = {
  mode: "constant" | "curve";
  constant?: number;
  keyframes?: SpeedKeyframe[];
  /** Fractional source-frame synthesis; default nearest. */
  frameMode?: SpeedFrameMode;
  /** Active curve preset; set to customized when the user edits knots. */
  presetId?: SpeedCurvePresetId;
};

/** Luma tone curve control point in 0–1 space (identity = linear). */
export type LumaCurvePoint = { t: number; y: number };

/** Stored color adjust — numeric leaves are animatable. */
export type ColorAdjust = {
  /** -1..1, 0 = identity */
  brightness?: AnimatableProperty<number>;
  /** -1..1, 0 = identity */
  contrast?: AnimatableProperty<number>;
  /** -1..1, 0 = identity */
  saturation?: AnimatableProperty<number>;
  /** Degrees, 0 = identity */
  hue?: AnimatableProperty<number>;
  lumaCurve?: LumaCurvePoint[];
};

/** Flat color adjust after keyframe evaluate (compositor / shaders). */
export type ResolvedColorAdjust = {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  lumaCurve?: LumaCurvePoint[];
};

export type StabilizeParams = {
  enabled: boolean;
};

export type RemoveBgColorParams = {
  /** RGB 0–255. Default chroma green. */
  keyColor: [number, number, number];
  /** 0..1 — how wide a range around keyColor is keyed */
  tolerance: number;
  /** 0..1 — edge feather / soft threshold */
  softness: number;
  /** 0..1 — green/blue-aware spill suppression on keyed edges */
  spill: number;
  /** 0..1 — hard edge shrink / choke after keying */
  choke: number;
};

/** Chroma / color-key Remove BG (live). */
export type RemoveBgParams = {
  enabled: boolean;
  color: RemoveBgColorParams;
};

export type TextAnimationGranularity = "whole" | "line" | "word" | "character";

export type TextAnimDirection = "left" | "right" | "up" | "down";

/** In / Out phase — preset + duration (+ direction for slide). */
export type TextAnimPhase = {
  /** Registry id or `"none"`. */
  presetId: string;
  /** Phase length in ms (In/Out). Default 500. */
  durationMs?: number;
  /** Slide / slide_away direction. */
  direction?: TextAnimDirection;
};

/**
 * Three-phase text animation — see PRESETS.md §3.
 * Loop is continuous (no fixed duration).
 */
export type TextAnimationParams = {
  in?: TextAnimPhase;
  out?: TextAnimPhase;
  loop?: { presetId: string };
  granularity?: TextAnimationGranularity;
};

/** Closed-polygon vertex in local center-origin ±0.5 space. */
export type VectorShapePoint = { x: number; y: number };

/** Animatable vertex for custom mask morphing. */
export type AnimatableVectorPoint = {
  x: AnimatableProperty<number>;
  y: AnimatableProperty<number>;
};

export type VectorShapePresetId =
  | "circle"
  | "rectangle"
  | "roundedRect"
  | "triangle"
  | "diamond"
  | "hexagon"
  | "star"
  | "heart"
  | "arrow"
  | "custom";

export type TextBubbleProps = {
  type:
    | "none"
    | "speech-round"
    | "speech-comic"
    | "thought-cloud"
    | "comic-burst"
    | "pill"
    | "neon-frame"
    | "torn-paper"
    | "typing-box"
    | "promo-badge"
    | "ribbon"
    | "arrow-tag"
    | "hexagon"
    | "ticket"
    | "rounded-rect"
    | "star-badge"
    | "custom";
  fill: string;
  stroke: string;
  strokeWidth: number;
  paddingX: number;
  paddingY: number;
  accentColor?: string;
  /** Shape chrome opacity 0–1 (fill + stroke). Default 1. */
  opacity?: number;
  /**
   * Closed polygon in local ±0.5 space (center-origin). Used when type is
   * `"custom"`; mapped into the padded text bubble rect at paint time.
   * Fallback when `pathD` is absent.
   */
  points?: VectorShapePoint[];
  /**
   * AI-authored SVG path `d` in the same ±0.5 center-origin space as `points`.
   * Preferred for custom bubbles (static chrome — not keyframed). No user upload.
   */
  pathD?: string;
};

/** Per-run / per-range typography override (merged onto box-level TextProps defaults). */
export type TextRunStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  script?: "normal" | "super" | "sub";
  color?: string;
  /** CSS linear-gradient string; null clears fill gradient for this run */
  gradient?: string | null;
  /** Marker / highlight background behind glyphs; null = off */
  highlight?: string | null;
  strokeColor?: string;
  strokeWidth?: number;
  letterSpacing?: number;
};

/** Contiguous styled span inside a text clip. */
export type TextRun = {
  text: string;
  style?: TextRunStyle;
};

export type TextProps = {
  /**
   * Plain concatenation of runs (always kept in sync).
   * Source of truth for timeline labels, AI context, and legacy callers.
   */
  content: string;
  /**
   * Rich styled spans. When absent/empty, treated as a single run from
   * `content` + box-level typography fields.
   */
  runs?: TextRun[];
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  color?: string;
  /** Optional fill override; when set, rasterizer draws gradient fill instead of flat color */
  gradient?: string | null;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  /** Comic / retro extrusion tint; null = off */
  retro3DColor?: string | null;
  bubble?: TextBubbleProps;
  /** Optional id of last applied Aa / template (UI only; style fields are source of truth) */
  stylePresetId?: string | null;
  templateId?: string | null;
};

export type CaptionPosition = "top" | "bottom" | "center";

/** Timed cue owned by a single caption timeline clip (times are clip-local). */
export type CaptionCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  /**
   * Optional look override for this cue only (Options / Styles).
   * Resolved as `{ ...caption.style, ...cue.style }`.
   */
  style?: Partial<Omit<TextProps, "content">>;
  /** When true, this cue is not drawn. Falls back to CaptionProps.hidden. */
  hidden?: boolean;
  /** Optional position override; falls back to CaptionProps.position. */
  position?: CaptionPosition;
  /** Optional horizontal offset override; falls back to CaptionProps.offsetX. */
  offsetX?: number;
  /** Optional vertical offset override; falls back to CaptionProps.offsetY. */
  offsetY?: number;
  /**
   * Optional wrap width override as a fraction of frame width (0.2–1).
   * Falls back to CaptionProps.wrapWidth.
   */
  wrapWidth?: number;
  /**
   * Per-cue text animation (Styles tab). Uses the same TextAnimationParams
   * pipeline as text clips — never broadcast by Apply to all.
   */
  animation?: TextAnimationParams;
};

/** Caption Options — display style + word highlight (caption-app parity). */
export type CaptionDisplayStyle = "full" | "line" | "word" | "reveal";

export type CaptionDisplayOptions = {
  displayStyle: CaptionDisplayStyle;
  /** Highlight the active spoken word. */
  wordHighlight: boolean;
  backgroundColor: string;
  /** 0–1 caption box opacity. */
  backgroundAlpha: number;
  highlightColor: string;
  highlightBackgroundColor: string;
  /** 0–1 active-word chip opacity. */
  highlightBackgroundAlpha: number;
  highlightZoom: boolean;
  /** Pulse highlight background over the active word duration. */
  highlightEnergyZoom: boolean;
};

/** Shared caption document — one clip owns all cues. */
export type CaptionProps = {
  cues: CaptionCue[];
  /** Shared look applied to the active cue (content comes from the cue). */
  style: Omit<TextProps, "content">;
  position: CaptionPosition;
  /** When true, cues without their own override are not drawn. */
  hidden?: boolean;
  /** Horizontal offset from frame center (layout px). */
  offsetX?: number;
  /** Extra px from the edge toward center (or from center when position is center). */
  offsetY: number;
  /**
   * Max caption box width as a fraction of frame width (0.2–1).
   * Text wraps to the next line to fit. Default ~0.86.
   */
  wrapWidth?: number;
  /**
   * Timing speed for cue playback on the timeline (1 = original).
   * >1 plays captions faster (shorter on timeline); <1 slower.
   * Cue `startMs`/`endMs` stay stored at 1×; display/resolve divide by speed.
   */
  speed?: number;
  /** Display style / highlight / caption background (Options tab). */
  display?: CaptionDisplayOptions;
};

export type FilterCategory =
  | "life"
  | "movies"
  | "retro"
  | "nature"
  | "food"
  | "bw"
  | "technical"
  | "custom";

export type FilterClipParams = {
  /** Bundled or imported LUT id (e.g. cinematic_teal_orange). */
  lutId: string;
  /** Relative .cube path for user-imported LUTs. */
  lutPath?: string;
  /** 0–1 lerp between original and LUT output. */
  strength: AnimatableProperty<number>;
  category?: FilterCategory;
};

export type TransitionDirection = "left" | "right" | "up" | "down";

export type TransitionCategory =
  | "camera"
  | "fade"
  | "light"
  | "glitch"
  | "blur"
  | "warp"
  | "mask";

export type TransitionParams = {
  presetId: string;
  durationMs: number;
  category?: TransitionCategory;
  direction?: TransitionDirection;
  intensity?: number;
};

export type EffectClipParams = {
  effectId: string;
  /** 0–1 effect amount; default 1. */
  intensity?: AnimatableProperty<number>;
};

/** Audio-lane mix — volume / fades / pitch. */
export type AudioMixParams = {
  /** Gain in dB; default 0 */
  volumeDb?: AnimatableProperty<number>;
  fadeInMs?: number;
  fadeOutMs?: number;
  /** Semitones; default 0 — Web Audio detune */
  pitchSemitones?: number;
};

/** Clip mask geometry — see documents/mask_feature.md */
export type MaskType =
  | "split"
  | "filmstrip"
  | "circle"
  | "rectangle"
  | "stars"
  | "heart"
  | "text"
  | "custom";

export type MaskBoolean = "add" | "subtract" | "intersect";

export type MaskTextProps = {
  content: string;
  fontFamily: string;
  fontWeight?: number | string;
  italic?: boolean;
  fontSize: number;
  letterSpacing?: number;
  lineHeight?: number;
  align?: "left" | "center" | "right";
};

/** Stored clip mask — numeric leaves are animatable. */
export type ClipMask = {
  id: string;
  name?: string;
  type: MaskType;
  invert: boolean;
  /** 0..100 UI feather */
  feather: AnimatableProperty<number>;
  /** -100..100; omit for split/filmstrip */
  expand?: AnimatableProperty<number>;
  /** Clip-local center-origin offsets (layout px). */
  position: {
    x: AnimatableProperty<number>;
    y: AnimatableProperty<number>;
  };
  rotationDeg: AnimatableProperty<number>;
  /** Present when this mask is not the first in the list. */
  booleanBlend?: MaskBoolean;
  size?: {
    w: AnimatableProperty<number>;
    h: AnimatableProperty<number>;
  };
  cornerRadius?: AnimatableProperty<number>;
  stripGap?: AnimatableProperty<number>;
  text?: MaskTextProps;
  /**
   * Custom closed polygon in local ±0.5 space (center-origin).
   * Scaled by `size` at evaluate/render. Point count is fixed while keyframed.
   */
  points?: AnimatableVectorPoint[];
};

/** Flat mask after keyframe evaluate (compositor / overlay). */
export type ResolvedClipMask = {
  id: string;
  name?: string;
  type: MaskType;
  invert: boolean;
  feather: number;
  expand?: number;
  position: { x: number; y: number };
  rotationDeg: number;
  booleanBlend?: MaskBoolean;
  size?: { w: number; h: number };
  cornerRadius?: number;
  stripGap?: number;
  text?: MaskTextProps;
  points?: VectorShapePoint[];
};

export type MediaImportStatus = "processing" | "ready" | "error";

export type MediaAssetRef = {
  id: string;
  kind: MediaKind;
  name: string;
  /** Relative or absolute path — never a Blob */
  path: string;
  durationMs: number;
  width?: number;
  height?: number;
  codec?: string;
  hasAudio?: boolean;
  /** Relative: proxies/<id>_720.mp4 */
  proxyPath?: string;
  /** Relative: thumbs/<id>.jpg */
  thumbPath?: string;
  /** Relative: peaks/<id>.json */
  peaksPath?: string;
  importStatus?: MediaImportStatus;
  importError?: string;
  /** User-starred asset; shown under the Favorites media filter. */
  favorite?: boolean;
};

/**
 * Kinetic sticker look — palette / backing / stroke (no text).
 * When `stickerId === "shape"`, also carries parametric / custom polygon.
 */
export type StickerStyleParams = {
  paletteKey?: "vibrant" | "cyber" | "cinema" | "pastel" | "mono";
  backingMode?: "diecut" | "flat" | "glow";
  strokeScale?: number;
  /** Shape sticker preset (`stickerId === "shape"`). */
  shapePreset?: VectorShapePresetId;
  /** Closed polygon in ±0.5 space when shapePreset is custom (or resolved). */
  points?: VectorShapePoint[];
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};

/** Reserved sticker id for parametric / custom vector shapes. */
export const SHAPE_STICKER_ID = "shape";

export type Clip = {
  id: string;
  kind: ClipKind;
  mediaId?: string;
  /** Bundled kinetic sticker id (e.g. k001) — not in mediaIndex. */
  stickerId?: string;
  /** Per-clip sticker look (palette / die-cut / stroke). */
  stickerStyle?: StickerStyleParams;
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  /** Bidirectional link to paired A/V clip; cleared on detach. */
  linkedClipId?: string;
  /**
   * When true, skip this clip's embedded media audio in preview/export
   * (e.g. after extract audio). Independent of linkedClipId.
   */
  muteAudio?: boolean;
  /**
   * When true, play the in/out source range backwards (after speed remap).
   * Pair with muteAudio for reverse-without-audio.
   */
  reversed?: boolean;
  /** Soft group — grouped clips move together (⌘G). */
  groupId?: string;
  transform?: Transform;
  /** Opt-in 3D plane (inspector 3D tab). */
  transform3d?: Transform3D;
  /** Source crop for video/image — normalized 0–1; omit when full-frame. */
  crop?: CropRect;
  speed?: SpeedCurve;
  blendMode?: BlendMode;
  /** Layer opacity for blend pass — 0..1, default static 1 when omitted. */
  opacity?: AnimatableProperty<number>;
  adjust?: ColorAdjust;
  stabilize?: StabilizeParams;
  animation?: TextAnimationParams;
  text?: TextProps;
  /** Caption-document clip — owns all timed cues. */
  caption?: CaptionProps;
  filter?: FilterClipParams;
  transition?: TransitionParams;
  /** Effect-track clip params (blur / grain / vignette / shake). */
  effect?: EffectClipParams;
  /** Volume / fade / pitch for audio-lane clips. */
  audio?: AudioMixParams;
  /** Section checkbox; false/undefined = masks off (data kept). */
  masksEnabled?: boolean;
  /** Geometric / text mattes (video + image only). */
  masks?: ClipMask[];
  /** Remove background — video / image only; missing = off. */
  removeBg?: RemoveBgParams;
};

export type Track = {
  id: string;
  type: TrackType;
  locked: boolean;
  hidden: boolean;
  muted?: boolean;
  /** When any track is soloed, only soloed tracks contribute to preview. */
  solo?: boolean;
  clips: Clip[];
};

export type ProjectDocument = {
  version: 4;
  id: string;
  title: string;
  projectPath: string;
  fps: number;
  width: number;
  height: number;
  resolutionMode: ResolutionMode;
  aspectRatio: AspectRatio;
  colorSpace: ColorSpace;
  importMaterialMode: ImportMaterialMode;
  playheadMs: number;
  tracks: Track[];
  mediaIndex: MediaAssetRef[];
  updatedAt: string;
};

export type AssetTab =
  | "Media"
  | "Audio"
  | "Text"
  | "Captions"
  | "Stickers"
  | "Effects"
  | "Transitions"
  | "Filters";
