import { normalizeCrop } from "../compositor/crop";
import {
  coerceAnimatableNumber,
  coerceTransform,
  coerceTransform3D,
} from "../engine/animatable";
import { normalizeTextProps } from "../text/runs";
import { createEmptyProject } from "./createProject";
import type {
  BlendMode,
  CaptionCue,
  CaptionPosition,
  CaptionProps,
  Clip,
  ClipKind,
  ClipMask,
  ColorAdjust,
  ImportMaterialMode,
  LumaCurvePoint,
  MaskBoolean,
  MaskTextProps,
  MaskType,
  MediaAssetRef,
  MediaImportStatus,
  MediaKind,
  ProjectDocument,
  RemoveBgColorParams,
  RemoveBgParams,
  ResolutionMode,
  SpeedCurve,
  SpeedCurvePresetId,
  SpeedFrameMode,
  SpeedHandle,
  SpeedKeyframe,
  StickerStyleParams,
  TextAnimDirection,
  TextAnimationGranularity,
  TextAnimationParams,
  TextAnimPhase,
  TextBubbleProps,
  TextProps,
  TextRun,
  TextRunStyle,
  Track,
  TrackType,
} from "./types";
import {
  DEFAULT_REMOVE_BG_COLOR,
  DEFAULT_REMOVE_BG_KEY_COLOR,
} from "./removeBgDefaults";

const BLEND_MODES = new Set<BlendMode>([
  "normal",
  "brighten",
  "screen",
  "darken",
  "overlay",
  "hardLight",
  "softLight",
  "colorBurn",
  "linearBurn",
  "colorDodge",
  "multiply",
]);

const SPEED_PRESET_IDS = new Set<SpeedCurvePresetId>([
  "none",
  "customized",
  "montage",
  "hero_time",
  "bullet",
  "jump_cut",
  "flash_in",
  "flash_out",
]);

const TRACK_TYPES = new Set<TrackType>([
  "video",
  "overlay",
  "audio",
  "text",
  "caption",
  "sticker",
  "effect",
  "filter",
]);

const CLIP_KINDS = new Set<ClipKind>([
  "video",
  "image",
  "audio",
  "text",
  "caption",
  "sticker",
  "effect",
  "filter",
  "transition",
]);

const MEDIA_KINDS = new Set<MediaKind>(["video", "audio", "image"]);

const RESOLUTION_MODES = new Set<ResolutionMode>([
  "adapted",
  "720p",
  "1080p",
  "2k",
]);

const IMPORT_MODES = new Set<ImportMaterialMode>([
  "copy_to_project",
  "keep_original",
]);

const IMPORT_STATUSES = new Set<MediaImportStatus>([
  "processing",
  "ready",
  "error",
]);

const MASK_TYPES = new Set<MaskType>([
  "split",
  "filmstrip",
  "circle",
  "rectangle",
  "stars",
  "heart",
  "text",
]);

const MASK_BOOLEANS = new Set<MaskBoolean>(["add", "subtract", "intersect"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function parseSpeedHandle(raw: unknown): SpeedHandle | undefined {
  if (!isPlainObject(raw)) return undefined;
  const dt = asNumber(raw.dt, NaN);
  const dv = asNumber(raw.dv, NaN);
  if (!Number.isFinite(dt) || !Number.isFinite(dv)) return undefined;
  return { dt, dv };
}

function parseSpeedKeyframe(raw: unknown): SpeedKeyframe | null {
  if (!isPlainObject(raw)) return null;
  const t = asNumber(raw.t, NaN);
  const v = asNumber(raw.v, NaN);
  if (!Number.isFinite(t) || !Number.isFinite(v)) return null;
  return {
    t: clamp01(t),
    v: Math.min(10, Math.max(0.1, v)),
    inHandle: parseSpeedHandle(raw.inHandle),
    outHandle: parseSpeedHandle(raw.outHandle),
  };
}

function parseSpeedCurve(raw: unknown): SpeedCurve | undefined {
  if (!isPlainObject(raw)) return undefined;
  const mode = raw.mode === "curve" ? "curve" : "constant";
  const frameMode: SpeedFrameMode | undefined =
    raw.frameMode === "blend" || raw.frameMode === "nearest"
      ? raw.frameMode
      : undefined;
  const keyframesRaw = Array.isArray(raw.keyframes) ? raw.keyframes : [];
  const keyframes = keyframesRaw
    .map(parseSpeedKeyframe)
    .filter((k): k is SpeedKeyframe => k !== null)
    .sort((a, b) => a.t - b.t);
  const presetRaw = raw.presetId;
  const presetId =
    typeof presetRaw === "string" &&
    SPEED_PRESET_IDS.has(presetRaw as SpeedCurvePresetId)
      ? (presetRaw as SpeedCurvePresetId)
      : undefined;
  return {
    mode,
    constant:
      typeof raw.constant === "number" && Number.isFinite(raw.constant)
        ? Math.min(10, Math.max(0.1, raw.constant))
        : undefined,
    keyframes: keyframes.length > 0 ? keyframes : undefined,
    frameMode,
    presetId,
  };
}

function parseLumaCurvePoint(raw: unknown): LumaCurvePoint | null {
  if (!isPlainObject(raw)) return null;
  const t = asNumber(raw.t, NaN);
  const y = asNumber(raw.y, NaN);
  if (!Number.isFinite(t) || !Number.isFinite(y)) return null;
  return { t: clamp01(t), y: clamp01(y) };
}

function coerceAdjustLeaf(
  raw: unknown,
  clamp: (n: number) => number,
  fallback: number,
): ReturnType<typeof coerceAnimatableNumber> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return coerceAnimatableNumber(clamp(raw), fallback);
  }
  if (typeof raw === "object") {
    const wrapped = coerceAnimatableNumber(raw, fallback);
    return {
      ...wrapped,
      staticValue: clamp(wrapped.staticValue),
      keyframes: wrapped.keyframes.map((k) => ({
        ...k,
        value: clamp(k.value),
      })),
    };
  }
  return undefined;
}

function parseColorAdjust(raw: unknown): ColorAdjust | undefined {
  if (!isPlainObject(raw)) return undefined;
  const lumaRaw = Array.isArray(raw.lumaCurve) ? raw.lumaCurve : [];
  const lumaCurve = lumaRaw
    .map(parseLumaCurvePoint)
    .filter((p): p is LumaCurvePoint => p !== null)
    .sort((a, b) => a.t - b.t);
  const clampAdj = (n: number) => Math.min(1, Math.max(-1, n));
  const adjust: ColorAdjust = {};
  const brightness = coerceAdjustLeaf(raw.brightness, clampAdj, 0);
  if (brightness) adjust.brightness = brightness;
  const contrast = coerceAdjustLeaf(raw.contrast, clampAdj, 0);
  if (contrast) adjust.contrast = contrast;
  const saturation = coerceAdjustLeaf(raw.saturation, clampAdj, 0);
  if (saturation) adjust.saturation = saturation;
  const hue = coerceAdjustLeaf(
    raw.hue,
    (n) => n % 360,
    0,
  );
  if (hue) adjust.hue = hue;
  if (lumaCurve.length > 0) adjust.lumaCurve = lumaCurve;
  return Object.keys(adjust).length > 0 ? adjust : undefined;
}

const TEXT_GRANULARITIES = new Set<TextAnimationGranularity>([
  "whole",
  "line",
  "word",
  "character",
]);

const TEXT_DIRECTIONS = new Set<TextAnimDirection>([
  "left",
  "right",
  "up",
  "down",
]);

function parseTextAnimPhase(raw: unknown): TextAnimPhase | undefined {
  if (!isPlainObject(raw)) return undefined;
  const presetId =
    typeof raw.presetId === "string" && raw.presetId.length > 0
      ? raw.presetId
      : undefined;
  if (!presetId) return undefined;
  const phase: TextAnimPhase = { presetId };
  if (typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)) {
    phase.durationMs = Math.max(0, raw.durationMs);
  }
  if (
    typeof raw.direction === "string" &&
    TEXT_DIRECTIONS.has(raw.direction as TextAnimDirection)
  ) {
    phase.direction = raw.direction as TextAnimDirection;
  }
  return phase;
}

/** Nested `{ in, out, loop, granularity }` text animation shape. */
function parseTextAnimation(raw: unknown): TextAnimationParams | undefined {
  if (!isPlainObject(raw)) return undefined;

  const granularityRaw = raw.granularity;
  const granularity =
    typeof granularityRaw === "string" &&
    TEXT_GRANULARITIES.has(granularityRaw as TextAnimationGranularity)
      ? (granularityRaw as TextAnimationGranularity)
      : undefined;

  const nestedIn = parseTextAnimPhase(raw.in);
  const nestedOut = parseTextAnimPhase(raw.out);
  const loopRaw = raw.loop;
  const nestedLoop =
    isPlainObject(loopRaw) &&
    typeof loopRaw.presetId === "string" &&
    loopRaw.presetId.length > 0
      ? { presetId: loopRaw.presetId }
      : undefined;

  if (!nestedIn && !nestedOut && !nestedLoop && !granularity) {
    return undefined;
  }

  const anim: TextAnimationParams = {};
  if (nestedIn) anim.in = nestedIn;
  if (nestedOut) anim.out = nestedOut;
  if (nestedLoop) anim.loop = nestedLoop;
  if (granularity) anim.granularity = granularity;
  return anim;
}

function parseMediaAsset(raw: unknown): MediaAssetRef | null {
  if (!isPlainObject(raw)) return null;
  const kind = raw.kind;
  if (typeof kind !== "string" || !MEDIA_KINDS.has(kind as MediaKind)) {
    return null;
  }
  const id = asString(raw.id, "");
  const path = asString(raw.path, "");
  if (!id || !path) return null;
  const statusRaw = raw.importStatus;
  const importStatus =
    typeof statusRaw === "string" &&
    IMPORT_STATUSES.has(statusRaw as MediaImportStatus)
      ? (statusRaw as MediaImportStatus)
      : undefined;

  return {
    id,
    kind: kind as MediaKind,
    name: asString(raw.name, id),
    path,
    durationMs: asNumber(raw.durationMs, 0),
    width: typeof raw.width === "number" ? raw.width : undefined,
    height: typeof raw.height === "number" ? raw.height : undefined,
    codec: typeof raw.codec === "string" ? raw.codec : undefined,
    hasAudio: typeof raw.hasAudio === "boolean" ? raw.hasAudio : undefined,
    proxyPath: typeof raw.proxyPath === "string" ? raw.proxyPath : undefined,
    thumbPath: typeof raw.thumbPath === "string" ? raw.thumbPath : undefined,
    peaksPath: typeof raw.peaksPath === "string" ? raw.peaksPath : undefined,
    importStatus,
    importError:
      typeof raw.importError === "string" ? raw.importError : undefined,
    favorite: raw.favorite === true ? true : undefined,
  };
}

function parseClip(raw: unknown): Clip | null {
  if (!isPlainObject(raw)) return null;
  const kind = raw.kind;
  if (typeof kind !== "string" || !CLIP_KINDS.has(kind as ClipKind)) {
    return null;
  }
  const id = asString(raw.id, "");
  if (!id) return null;
  return {
    id,
    kind: kind as ClipKind,
    mediaId: typeof raw.mediaId === "string" ? raw.mediaId : undefined,
    stickerId: typeof raw.stickerId === "string" ? raw.stickerId : undefined,
    stickerStyle: parseStickerStyle(raw.stickerStyle),
    startMs: asNumber(raw.startMs, 0),
    durationMs: asNumber(raw.durationMs, 0),
    inMs: asNumber(raw.inMs, 0),
    outMs: asNumber(raw.outMs, asNumber(raw.durationMs, 0)),
    transform: coerceTransform(raw.transform),
    transform3d: coerceTransform3D(raw.transform3d),
    crop: normalizeCrop(raw.crop),
    speed: parseSpeedCurve(raw.speed),
    blendMode:
      typeof raw.blendMode === "string" &&
      BLEND_MODES.has(raw.blendMode as BlendMode)
        ? (raw.blendMode as BlendMode)
        : undefined,
    opacity:
      raw.opacity !== undefined && raw.opacity !== null
        ? coerceAnimatableNumber(
            typeof raw.opacity === "number"
              ? clamp01(raw.opacity)
              : raw.opacity,
            1,
          )
        : undefined,
    adjust: parseColorAdjust(raw.adjust),
    stabilize: isPlainObject(raw.stabilize)
      ? (raw.stabilize as Clip["stabilize"])
      : undefined,
    animation: parseTextAnimation(raw.animation),
    text: parseTextProps(raw.text),
    caption: parseCaptionProps(raw.caption),
    filter: parseFilterParams(raw.filter),
    transition: parseTransitionParams(raw.transition),
    effect: parseEffectParams(raw.effect),
    audio: parseAudioMixParams(raw.audio),
    masksEnabled:
      typeof raw.masksEnabled === "boolean" ? raw.masksEnabled : undefined,
    masks: parseMasks(raw.masks),
    removeBg: parseRemoveBg(raw.removeBg),
    linkedClipId:
      typeof raw.linkedClipId === "string" ? raw.linkedClipId : undefined,
    muteAudio: typeof raw.muteAudio === "boolean" ? raw.muteAudio : undefined,
    reversed: typeof raw.reversed === "boolean" ? raw.reversed : undefined,
    groupId: typeof raw.groupId === "string" ? raw.groupId : undefined,
  };
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function parseKeyColor(raw: unknown): [number, number, number] {
  if (!Array.isArray(raw) || raw.length < 3) {
    return [...DEFAULT_REMOVE_BG_KEY_COLOR];
  }
  return [
    clampByte(asNumber(raw[0], DEFAULT_REMOVE_BG_KEY_COLOR[0])),
    clampByte(asNumber(raw[1], DEFAULT_REMOVE_BG_KEY_COLOR[1])),
    clampByte(asNumber(raw[2], DEFAULT_REMOVE_BG_KEY_COLOR[2])),
  ];
}

function parseRemoveBgColor(raw: unknown): RemoveBgColorParams {
  if (!isPlainObject(raw)) {
    return {
      keyColor: [...DEFAULT_REMOVE_BG_KEY_COLOR],
      tolerance: DEFAULT_REMOVE_BG_COLOR.tolerance,
      softness: DEFAULT_REMOVE_BG_COLOR.softness,
      spill: DEFAULT_REMOVE_BG_COLOR.spill,
      choke: DEFAULT_REMOVE_BG_COLOR.choke,
    };
  }
  return {
    keyColor: parseKeyColor(raw.keyColor),
    tolerance: clamp01(
      asNumber(raw.tolerance, DEFAULT_REMOVE_BG_COLOR.tolerance),
    ),
    softness: clamp01(
      asNumber(raw.softness, DEFAULT_REMOVE_BG_COLOR.softness),
    ),
    spill: clamp01(asNumber(raw.spill, DEFAULT_REMOVE_BG_COLOR.spill)),
    choke: clamp01(asNumber(raw.choke, DEFAULT_REMOVE_BG_COLOR.choke)),
  };
}

function parseRemoveBg(raw: unknown): RemoveBgParams | undefined {
  if (!isPlainObject(raw)) return undefined;
  return {
    enabled: asBoolean(raw.enabled, false),
    color: parseRemoveBgColor(raw.color),
  };
}

const TEXT_BUBBLE_TYPES = new Set<TextBubbleProps["type"]>([
  "none",
  "speech-round",
  "speech-comic",
  "thought-cloud",
  "comic-burst",
  "pill",
  "neon-frame",
  "torn-paper",
  "typing-box",
  "promo-badge",
  "ribbon",
  "arrow-tag",
  "hexagon",
  "ticket",
  "rounded-rect",
  "star-badge",
]);

function parseTextBubble(raw: unknown): TextBubbleProps | undefined {
  if (!isPlainObject(raw)) return undefined;
  const type =
    typeof raw.type === "string" &&
    TEXT_BUBBLE_TYPES.has(raw.type as TextBubbleProps["type"])
      ? (raw.type as TextBubbleProps["type"])
      : "none";
  return {
    type,
    fill: typeof raw.fill === "string" ? raw.fill : "#ffffff",
    stroke: typeof raw.stroke === "string" ? raw.stroke : "#000000",
    strokeWidth:
      typeof raw.strokeWidth === "number" && Number.isFinite(raw.strokeWidth)
        ? Math.max(0, raw.strokeWidth)
        : 0,
    paddingX:
      typeof raw.paddingX === "number" && Number.isFinite(raw.paddingX)
        ? Math.max(0, raw.paddingX)
        : 12,
    paddingY:
      typeof raw.paddingY === "number" && Number.isFinite(raw.paddingY)
        ? Math.max(0, raw.paddingY)
        : 8,
    accentColor:
      typeof raw.accentColor === "string" ? raw.accentColor : undefined,
    opacity:
      typeof raw.opacity === "number" && Number.isFinite(raw.opacity)
        ? Math.min(1, Math.max(0, raw.opacity))
        : undefined,
  };
}

function parseCaptionCue(raw: unknown, index: number): CaptionCue | null {
  if (!isPlainObject(raw)) return null;
  const text = typeof raw.text === "string" ? raw.text : "";
  const startMs = asNumber(raw.startMs, 0);
  const endMs = Math.max(startMs + 1, asNumber(raw.endMs, startMs + 1));
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : `cue_${index}_${Math.round(startMs)}`;
  let style: CaptionCue["style"];
  if (isPlainObject(raw.style)) {
    const parsed = parseTextProps({ ...raw.style, content: "" });
    if (parsed) {
      const { content: _content, ...rest } = parsed;
      style = rest;
    }
  }
  const hidden = typeof raw.hidden === "boolean" ? raw.hidden : undefined;
  const position: CaptionCue["position"] =
    raw.position === "top" ||
    raw.position === "center" ||
    raw.position === "bottom"
      ? raw.position
      : undefined;
  const offsetX =
    typeof raw.offsetX === "number" && Number.isFinite(raw.offsetX)
      ? raw.offsetX
      : undefined;
  const offsetY =
    typeof raw.offsetY === "number" && Number.isFinite(raw.offsetY)
      ? raw.offsetY
      : undefined;
  const wrapWidth =
    typeof raw.wrapWidth === "number" && Number.isFinite(raw.wrapWidth)
      ? Math.min(1, Math.max(0.2, raw.wrapWidth))
      : undefined;
  const animation = parseTextAnimation(raw.animation);
  return {
    id,
    startMs,
    endMs,
    text,
    ...(style && Object.keys(style).length > 0 ? { style } : {}),
    ...(hidden !== undefined ? { hidden } : {}),
    ...(position ? { position } : {}),
    ...(offsetX !== undefined ? { offsetX } : {}),
    ...(offsetY !== undefined ? { offsetY } : {}),
    ...(wrapWidth !== undefined ? { wrapWidth } : {}),
    ...(animation ? { animation } : {}),
  };
}

export function parseCaptionProps(raw: unknown): CaptionProps | undefined {
  if (!isPlainObject(raw)) return undefined;
  const cuesRaw = Array.isArray(raw.cues) ? raw.cues : [];
  const cues = cuesRaw
    .map((c, i) => parseCaptionCue(c, i))
    .filter((c): c is CaptionCue => c !== null);
  const styleRaw = isPlainObject(raw.style) ? raw.style : {};
  const styleParsed = parseTextProps({ ...styleRaw, content: "" });
  const { content: _content, ...style } = styleParsed ?? { content: "" };
  const position: CaptionPosition =
    raw.position === "top" ||
    raw.position === "center" ||
    raw.position === "bottom"
      ? raw.position
      : "bottom";
  const hidden = typeof raw.hidden === "boolean" ? raw.hidden : undefined;
  const offsetX =
    typeof raw.offsetX === "number" && Number.isFinite(raw.offsetX)
      ? raw.offsetX
      : undefined;
  const offsetY =
    typeof raw.offsetY === "number" && Number.isFinite(raw.offsetY)
      ? raw.offsetY
      : 0;
  const wrapWidth =
    typeof raw.wrapWidth === "number" && Number.isFinite(raw.wrapWidth)
      ? Math.min(1, Math.max(0.2, raw.wrapWidth))
      : undefined;
  const speedRaw =
    typeof raw.speed === "number" && Number.isFinite(raw.speed)
      ? raw.speed
      : undefined;
  const speed =
    speedRaw === undefined
      ? undefined
      : Math.min(2, Math.max(0.5, speedRaw));
  const display = parseCaptionDisplay(raw.display);
  return {
    cues,
    style,
    position,
    offsetY,
    ...(hidden !== undefined ? { hidden } : {}),
    ...(offsetX !== undefined ? { offsetX } : {}),
    ...(wrapWidth !== undefined ? { wrapWidth } : {}),
    ...(speed !== undefined && speed !== 1 ? { speed } : {}),
    ...(display ? { display } : {}),
  };
}

function parseCaptionDisplay(raw: unknown): CaptionProps["display"] | undefined {
  if (!isPlainObject(raw)) return undefined;
  const displayStyle =
    raw.displayStyle === "full" ||
    raw.displayStyle === "line" ||
    raw.displayStyle === "word" ||
    raw.displayStyle === "reveal"
      ? raw.displayStyle
      : "full";
  const clamp01 = (n: unknown, fallback: number) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.min(1, Math.max(0, n))
      : fallback;
  const hex = (n: unknown, fallback: string) =>
    typeof n === "string" && n.length > 0 ? n : fallback;
  return {
    displayStyle,
    wordHighlight: raw.wordHighlight === true,
    backgroundColor: hex(raw.backgroundColor, "#000000"),
    backgroundAlpha: clamp01(raw.backgroundAlpha, 0),
    highlightColor: hex(raw.highlightColor, "#facc15"),
    highlightBackgroundColor: hex(raw.highlightBackgroundColor, "#facc15"),
    highlightBackgroundAlpha: clamp01(raw.highlightBackgroundAlpha, 0),
    highlightZoom: raw.highlightZoom !== false,
    highlightEnergyZoom: raw.highlightEnergyZoom !== false,
  };
}

/** Field-level text props. */
export function parseTextProps(raw: unknown): TextProps | undefined {
  if (!isPlainObject(raw)) return undefined;
  const content = typeof raw.content === "string" ? raw.content : "Text";

  const shadowColor: string | undefined =
    typeof raw.shadowColor === "string" ? raw.shadowColor : undefined;
  const shadowBlur: number | undefined =
    typeof raw.shadowBlur === "number" && Number.isFinite(raw.shadowBlur)
      ? Math.max(0, raw.shadowBlur)
      : undefined;
  const shadowOffsetX: number | undefined =
    typeof raw.shadowOffsetX === "number" && Number.isFinite(raw.shadowOffsetX)
      ? raw.shadowOffsetX
      : undefined;
  const shadowOffsetY: number | undefined =
    typeof raw.shadowOffsetY === "number" && Number.isFinite(raw.shadowOffsetY)
      ? raw.shadowOffsetY
      : undefined;

  const fontStyle: TextProps["fontStyle"] =
    raw.fontStyle === "italic"
      ? "italic"
      : raw.fontStyle === "normal"
        ? "normal"
        : undefined;

  const textDecoration: TextProps["textDecoration"] =
    raw.textDecoration === "underline" ||
    raw.textDecoration === "line-through" ||
    raw.textDecoration === "none"
      ? raw.textDecoration
      : undefined;

  const textTransform: TextProps["textTransform"] =
    raw.textTransform === "none" ||
    raw.textTransform === "uppercase" ||
    raw.textTransform === "lowercase" ||
    raw.textTransform === "capitalize"
      ? raw.textTransform
      : undefined;

  const parsed: TextProps = {
    content,
    fontFamily:
      typeof raw.fontFamily === "string" ? raw.fontFamily : undefined,
    fontSize:
      typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize)
        ? Math.max(1, raw.fontSize)
        : undefined,
    fontWeight:
      typeof raw.fontWeight === "number" || typeof raw.fontWeight === "string"
        ? raw.fontWeight
        : undefined,
    fontStyle,
    textDecoration,
    textTransform,
    color: typeof raw.color === "string" ? raw.color : undefined,
    gradient:
      raw.gradient === null
        ? null
        : typeof raw.gradient === "string"
          ? raw.gradient
          : undefined,
    align:
      raw.align === "left" || raw.align === "center" || raw.align === "right"
        ? raw.align
        : undefined,
    letterSpacing:
      typeof raw.letterSpacing === "number" && Number.isFinite(raw.letterSpacing)
        ? raw.letterSpacing
        : undefined,
    lineHeight:
      typeof raw.lineHeight === "number" && Number.isFinite(raw.lineHeight)
        ? Math.max(0.5, raw.lineHeight)
        : undefined,
    strokeColor:
      typeof raw.strokeColor === "string" ? raw.strokeColor : undefined,
    strokeWidth:
      typeof raw.strokeWidth === "number" && Number.isFinite(raw.strokeWidth)
        ? Math.max(0, raw.strokeWidth)
        : undefined,
    shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    retro3DColor:
      raw.retro3DColor === null
        ? null
        : typeof raw.retro3DColor === "string"
          ? raw.retro3DColor
          : undefined,
    bubble: parseTextBubble(raw.bubble),
    stylePresetId:
      raw.stylePresetId === null
        ? null
        : typeof raw.stylePresetId === "string"
          ? raw.stylePresetId
          : undefined,
    templateId:
      raw.templateId === null
        ? null
        : typeof raw.templateId === "string"
          ? raw.templateId
          : undefined,
    runs: parseTextRuns(raw.runs),
  };
  return normalizeTextProps(parsed);
}

function parseTextRunStyle(raw: unknown): TextRunStyle | undefined {
  if (!isPlainObject(raw)) return undefined;
  const style: TextRunStyle = {};
  if (typeof raw.fontFamily === "string") style.fontFamily = raw.fontFamily;
  if (typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize)) {
    style.fontSize = Math.max(1, raw.fontSize);
  }
  if (typeof raw.fontWeight === "number" || typeof raw.fontWeight === "string") {
    style.fontWeight = raw.fontWeight;
  }
  if (raw.fontStyle === "italic" || raw.fontStyle === "normal") {
    style.fontStyle = raw.fontStyle;
  }
  if (
    raw.textDecoration === "none" ||
    raw.textDecoration === "underline" ||
    raw.textDecoration === "line-through"
  ) {
    style.textDecoration = raw.textDecoration;
  }
  if (
    raw.textTransform === "none" ||
    raw.textTransform === "uppercase" ||
    raw.textTransform === "lowercase" ||
    raw.textTransform === "capitalize"
  ) {
    style.textTransform = raw.textTransform;
  }
  if (
    raw.script === "normal" ||
    raw.script === "super" ||
    raw.script === "sub"
  ) {
    style.script = raw.script;
  }
  if (typeof raw.color === "string") style.color = raw.color;
  if (raw.gradient === null) style.gradient = null;
  else if (typeof raw.gradient === "string") style.gradient = raw.gradient;
  if (raw.highlight === null) style.highlight = null;
  else if (typeof raw.highlight === "string") style.highlight = raw.highlight;
  if (typeof raw.strokeColor === "string") style.strokeColor = raw.strokeColor;
  if (typeof raw.strokeWidth === "number" && Number.isFinite(raw.strokeWidth)) {
    style.strokeWidth = Math.max(0, raw.strokeWidth);
  }
  if (
    typeof raw.letterSpacing === "number" &&
    Number.isFinite(raw.letterSpacing)
  ) {
    style.letterSpacing = raw.letterSpacing;
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function parseTextRuns(raw: unknown): TextRun[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const runs: TextRun[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const text = typeof item.text === "string" ? item.text : "";
    runs.push({ text, style: parseTextRunStyle(item.style) });
  }
  return runs;
}

function parseMaskText(raw: unknown): MaskTextProps | undefined {
  if (!isPlainObject(raw)) return undefined;
  const content = typeof raw.content === "string" ? raw.content : "Text";
  const fontFamily =
    typeof raw.fontFamily === "string" ? raw.fontFamily : "system-ui, sans-serif";
  const fontSize =
    typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize)
      ? Math.max(1, raw.fontSize)
      : 120;
  return {
    content,
    fontFamily,
    fontWeight:
      typeof raw.fontWeight === "number" || typeof raw.fontWeight === "string"
        ? raw.fontWeight
        : undefined,
    italic: typeof raw.italic === "boolean" ? raw.italic : undefined,
    fontSize,
    letterSpacing:
      typeof raw.letterSpacing === "number" && Number.isFinite(raw.letterSpacing)
        ? raw.letterSpacing
        : undefined,
    lineHeight:
      typeof raw.lineHeight === "number" && Number.isFinite(raw.lineHeight)
        ? raw.lineHeight
        : undefined,
    align:
      raw.align === "left" || raw.align === "center" || raw.align === "right"
        ? raw.align
        : undefined,
  };
}

function parseClipMask(raw: unknown): ClipMask | null {
  if (!isPlainObject(raw)) return null;
  const id = asString(raw.id, "");
  if (!id) return null;
  const type =
    typeof raw.type === "string" && MASK_TYPES.has(raw.type as MaskType)
      ? (raw.type as MaskType)
      : null;
  if (!type) return null;

  const pos = isPlainObject(raw.position) ? raw.position : null;
  const size = isPlainObject(raw.size) ? raw.size : null;

  const clamp01_100 = (n: number) => Math.min(100, Math.max(0, n));
  const clampExpand = (n: number) => Math.min(100, Math.max(-100, n));

  const sizeObj =
    size &&
    (typeof size.w === "number" ||
      (size.w && typeof size.w === "object") ||
      typeof size.h === "number" ||
      (size.h && typeof size.h === "object"))
      ? {
          w: coerceAnimatableNumber(
            typeof size.w === "number" ? Math.max(1, size.w) : size.w,
            400,
          ),
          h: coerceAnimatableNumber(
            typeof size.h === "number" ? Math.max(1, size.h) : size.h,
            400,
          ),
        }
      : undefined;

  const mask: ClipMask = {
    id,
    name: typeof raw.name === "string" ? raw.name : undefined,
    type,
    invert: Boolean(raw.invert),
    feather: (() => {
      const f = coerceAdjustLeaf(raw.feather, clamp01_100, 0);
      return f ?? coerceAnimatableNumber(0, 0);
    })(),
    expand:
      raw.expand === undefined || raw.expand === null
        ? undefined
        : coerceAdjustLeaf(raw.expand, clampExpand, 0),
    position: {
      x: coerceAnimatableNumber(
        pos && (typeof pos.x === "number" || typeof pos.x === "object")
          ? pos.x
          : 0,
        0,
      ),
      y: coerceAnimatableNumber(
        pos && (typeof pos.y === "number" || typeof pos.y === "object")
          ? pos.y
          : 0,
        0,
      ),
    },
    rotationDeg: coerceAnimatableNumber(
      raw.rotationDeg !== undefined ? raw.rotationDeg : 0,
      0,
    ),
    booleanBlend:
      typeof raw.booleanBlend === "string" &&
      MASK_BOOLEANS.has(raw.booleanBlend as MaskBoolean)
        ? (raw.booleanBlend as MaskBoolean)
        : undefined,
    size: sizeObj,
    cornerRadius:
      raw.cornerRadius === undefined || raw.cornerRadius === null
        ? undefined
        : coerceAdjustLeaf(raw.cornerRadius, clamp01_100, 0),
    stripGap:
      raw.stripGap === undefined || raw.stripGap === null
        ? undefined
        : coerceAdjustLeaf(raw.stripGap, (n) => Math.max(0, n), 0),
    text: parseMaskText(raw.text),
  };
  return mask;
}

function parseMasks(raw: unknown): ClipMask[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ClipMask[] = [];
  for (const item of raw) {
    const m = parseClipMask(item);
    if (m) out.push(m);
  }
  return out.length > 0 ? out : undefined;
}

function parseAudioMixParams(raw: unknown): Clip["audio"] {
  if (!isPlainObject(raw)) return undefined;
  const volumeDb =
    raw.volumeDb === undefined || raw.volumeDb === null
      ? undefined
      : coerceAnimatableNumber(raw.volumeDb, 0);
  const fadeInMs =
    typeof raw.fadeInMs === "number" && Number.isFinite(raw.fadeInMs)
      ? Math.max(0, raw.fadeInMs)
      : undefined;
  const fadeOutMs =
    typeof raw.fadeOutMs === "number" && Number.isFinite(raw.fadeOutMs)
      ? Math.max(0, raw.fadeOutMs)
      : undefined;
  const pitchSemitones =
    typeof raw.pitchSemitones === "number" && Number.isFinite(raw.pitchSemitones)
      ? raw.pitchSemitones
      : undefined;
  if (
    volumeDb === undefined &&
    fadeInMs === undefined &&
    fadeOutMs === undefined &&
    pitchSemitones === undefined
  ) {
    return undefined;
  }
  return { volumeDb, fadeInMs, fadeOutMs, pitchSemitones };
}

const STICKER_PALETTE_KEYS = new Set([
  "vibrant",
  "cyber",
  "cinema",
  "pastel",
  "mono",
]);
const STICKER_BACKINGS = new Set(["diecut", "flat", "glow"]);

function parseStickerStyle(raw: unknown): StickerStyleParams | undefined {
  if (!isPlainObject(raw)) return undefined;
  const style: StickerStyleParams = {};
  if (
    typeof raw.paletteKey === "string" &&
    STICKER_PALETTE_KEYS.has(raw.paletteKey)
  ) {
    style.paletteKey = raw.paletteKey as StickerStyleParams["paletteKey"];
  }
  if (
    typeof raw.backingMode === "string" &&
    STICKER_BACKINGS.has(raw.backingMode)
  ) {
    style.backingMode = raw.backingMode as StickerStyleParams["backingMode"];
  }
  if (typeof raw.strokeScale === "number" && Number.isFinite(raw.strokeScale)) {
    style.strokeScale = Math.min(2, Math.max(0.5, raw.strokeScale));
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function parseFilterParams(raw: unknown): Clip["filter"] {
  if (!isPlainObject(raw)) return undefined;
  const lutId = typeof raw.lutId === "string" ? raw.lutId : "";
  if (!lutId) return undefined;
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const strength =
    coerceAdjustLeaf(raw.strength, clamp01, 1) ??
    coerceAnimatableNumber(1, 1);
  return {
    lutId,
    lutPath: typeof raw.lutPath === "string" ? raw.lutPath : undefined,
    strength,
    category:
      typeof raw.category === "string"
        ? (raw.category as NonNullable<Clip["filter"]>["category"])
        : undefined,
  };
}

function parseTransitionParams(raw: unknown): Clip["transition"] {
  if (!isPlainObject(raw)) return undefined;
  const presetId = typeof raw.presetId === "string" ? raw.presetId : "";
  if (!presetId) return undefined;
  return {
    presetId,
    durationMs:
      typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs)
        ? Math.max(1, raw.durationMs)
        : 500,
    category:
      typeof raw.category === "string"
        ? (raw.category as NonNullable<Clip["transition"]>["category"])
        : undefined,
    direction:
      typeof raw.direction === "string"
        ? (raw.direction as NonNullable<Clip["transition"]>["direction"])
        : undefined,
    intensity:
      typeof raw.intensity === "number" && Number.isFinite(raw.intensity)
        ? Math.min(1, Math.max(0, raw.intensity))
        : undefined,
  };
}

function parseEffectParams(raw: unknown): Clip["effect"] {
  if (!isPlainObject(raw)) return undefined;
  const effectId = typeof raw.effectId === "string" ? raw.effectId : "";
  if (!effectId) return undefined;
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const intensity =
    raw.intensity === undefined || raw.intensity === null
      ? undefined
      : coerceAdjustLeaf(raw.intensity, clamp01, 1);
  return {
    effectId,
    intensity,
  };
}

function parseTrack(raw: unknown): Track | null {
  if (!isPlainObject(raw)) return null;
  const type = raw.type;
  if (typeof type !== "string" || !TRACK_TYPES.has(type as TrackType)) {
    return null;
  }
  const id = asString(raw.id, "");
  if (!id) return null;
  const clipsRaw = Array.isArray(raw.clips) ? raw.clips : [];
  const clips = clipsRaw
    .map(parseClip)
    .filter((c): c is Clip => c !== null);
  return {
    id,
    type: type as TrackType,
    locked: asBoolean(raw.locked, false),
    hidden: asBoolean(raw.hidden, false),
    muted: typeof raw.muted === "boolean" ? raw.muted : undefined,
    solo: typeof raw.solo === "boolean" ? raw.solo : undefined,
    clips,
  };
}

export function serializeProject(doc: ProjectDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parseProjectJson(raw: string): ProjectDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid project.json: not valid JSON");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Invalid project.json: expected object");
  }

  if (parsed.version !== 4) {
    throw new Error(`Unsupported project version: ${String(parsed.version)}`);
  }

  const defaults = createEmptyProject();
  const resolutionModeRaw = asString(
    parsed.resolutionMode,
    defaults.resolutionMode,
  );
  const resolutionMode = RESOLUTION_MODES.has(
    resolutionModeRaw as ResolutionMode,
  )
    ? (resolutionModeRaw as ResolutionMode)
    : defaults.resolutionMode;

  const importModeRaw = asString(
    parsed.importMaterialMode,
    defaults.importMaterialMode,
  );
  const importMaterialMode = IMPORT_MODES.has(
    importModeRaw as ImportMaterialMode,
  )
    ? (importModeRaw as ImportMaterialMode)
    : defaults.importMaterialMode;

  const tracksRaw = Array.isArray(parsed.tracks) ? parsed.tracks : [];
  const tracks = tracksRaw
    .map(parseTrack)
    .filter((t): t is Track => t !== null);
  const mediaRaw = Array.isArray(parsed.mediaIndex) ? parsed.mediaIndex : [];
  const mediaIndex = mediaRaw
    .map(parseMediaAsset)
    .filter((m): m is MediaAssetRef => m !== null);

  return {
    version: 4,
    id: asString(parsed.id, defaults.id),
    title: asString(parsed.title, defaults.title),
    projectPath: asString(parsed.projectPath, ""),
    fps: asNumber(parsed.fps, defaults.fps),
    width: asNumber(parsed.width, defaults.width),
    height: asNumber(parsed.height, defaults.height),
    resolutionMode,
    aspectRatio: asString(parsed.aspectRatio, defaults.aspectRatio),
    colorSpace: asString(parsed.colorSpace, defaults.colorSpace),
    importMaterialMode,
    playheadMs: asNumber(parsed.playheadMs, 0),
    tracks: tracks.length > 0 ? tracks : defaults.tracks,
    mediaIndex,
    updatedAt: asString(parsed.updatedAt, new Date().toISOString()),
  };
}
