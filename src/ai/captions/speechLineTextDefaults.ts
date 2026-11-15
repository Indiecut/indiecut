import type { CaptionProps, TextProps } from "../../project/types";

/** Default look for auto / imported caption text. */
export function speechLineTextDefaults(content: string): TextProps {
  return {
    content,
    fontFamily: "system-ui, sans-serif",
    fontSize: 36,
    fontWeight: "bold",
    color: "#ffffff",
    align: "center",
    strokeWidth: 0,
    lineHeight: 1.2,
  };
}

/** Shared style defaults for a caption-document clip (no content). */
export function captionStyleDefaults(): Omit<TextProps, "content"> {
  const { content: _c, ...style } = speechLineTextDefaults("");
  return {
    ...style,
    fontFamily: "Inter, sans-serif",
    fontWeight: 700,
    strokeWidth: 3,
    strokeColor: "#000000",
    stylePresetId: "classic",
  };
}

export function captionPropsDefaults(
  cues: CaptionProps["cues"],
): CaptionProps {
  return {
    cues,
    style: captionStyleDefaults(),
    position: "bottom",
    offsetY: 0,
  };
}

/** Layout Y (center-origin) for caption position on a frame of `height`. */
export function captionTransformY(
  position: CaptionProps["position"],
  offsetY: number,
  height: number,
): number {
  const margin = 80 + offsetY;
  if (position === "top") return -(height / 2) + margin;
  if (position === "center") return offsetY;
  return height / 2 - margin;
}
