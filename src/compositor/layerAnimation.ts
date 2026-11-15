/**
 * Bake whole-layer In/Out/Loop animation into transform + opacity.
 * Used by sticker (and any single-image) preview/export paths.
 */

import type { ResolvedTransform } from "../engine/animatable";
import {
  hasActiveTextAnimation,
  sampleWholeLayerMotion,
} from "../engine/textAnimation";
import { resolveTransform } from "./transform";
import type { TextAnimationParams } from "../project/types";

export function applyWholeLayerAnimation(args: {
  transform?: ResolvedTransform | null;
  opacity?: number | null;
  animation?: TextAnimationParams | null;
  localMs?: number | null;
  clipDurationMs?: number | null;
  layoutSize?: { width: number; height: number } | null;
  layoutWidth: number;
  layoutHeight: number;
}): {
  transform: ResolvedTransform;
  opacity: number;
} {
  const base = resolveTransform(args.transform);
  const baseOpacity =
    typeof args.opacity === "number" && Number.isFinite(args.opacity)
      ? args.opacity
      : 1;

  if (
    !hasActiveTextAnimation(args.animation) ||
    typeof args.localMs !== "number"
  ) {
    return { transform: base, opacity: baseOpacity };
  }

  const contentW = args.layoutSize?.width ?? 256;
  const contentH = args.layoutSize?.height ?? 256;
  const clipDur =
    typeof args.clipDurationMs === "number" && args.clipDurationMs > 0
      ? args.clipDurationMs
      : 3000;

  const motion = sampleWholeLayerMotion({
    localMs: args.localMs,
    clipDurMs: clipDur,
    animation: args.animation,
    contentW,
    contentH,
    layoutW: args.layoutWidth,
    layoutH: args.layoutHeight,
  });

  return {
    transform: {
      x: base.x + motion.x,
      y: base.y + motion.y,
      scaleX: base.scaleX * motion.scaleX,
      scaleY: base.scaleY * motion.scaleY,
      rotation: base.rotation + motion.rotation,
      uniformScale: base.uniformScale,
    },
    opacity: baseOpacity * motion.opacity,
  };
}
