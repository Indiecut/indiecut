/**
 * Template tile preview — same rasterizeText / rich path as the timeline,
 * so thumbs match what applying the style produces.
 */

import { useEffect, useRef, useState } from "react";
import { rasterizeText } from "../compositor/rasterizeText";
import { ensureTextFontsLoaded } from "../fonts/registry";
import type { TextProps, TextRunStyle } from "../project/types";
import {
  textPropsFromTemplate,
  type TextTemplateEntry,
} from "../textTemplates/registry";

const THUMB_CSS_W = 96;
const THUMB_CSS_H = 64;

function scaleNum(n: number | undefined, scale: number): number | undefined {
  if (n == null || !Number.isFinite(n)) return n;
  return n * scale;
}

function scaleRunStyle(
  style: TextRunStyle | undefined,
  scale: number,
): TextRunStyle | undefined {
  if (!style) return style;
  return {
    ...style,
    fontSize: scaleNum(style.fontSize, scale),
    strokeWidth: scaleNum(style.strokeWidth, scale),
    letterSpacing: scaleNum(style.letterSpacing, scale),
  };
}

/** Shrink typography + chrome so the sample fits the tile. */
function scaleTextPropsForThumb(props: TextProps, scale: number): TextProps {
  const bubble = props.bubble;
  return {
    ...props,
    fontSize: scaleNum(props.fontSize, scale) ?? 18,
    strokeWidth: scaleNum(props.strokeWidth, scale),
    letterSpacing: scaleNum(props.letterSpacing, scale),
    shadowBlur: scaleNum(props.shadowBlur, scale),
    shadowOffsetX: scaleNum(props.shadowOffsetX, scale),
    shadowOffsetY: scaleNum(props.shadowOffsetY, scale),
    bubble:
      bubble && bubble.type !== "none"
        ? {
            ...bubble,
            strokeWidth: (bubble.strokeWidth ?? 0) * scale,
            paddingX: (bubble.paddingX ?? 0) * scale,
            paddingY: (bubble.paddingY ?? 0) * scale,
          }
        : bubble,
    runs: props.runs?.map((r) => ({
      text: r.text,
      style: scaleRunStyle(r.style, scale),
    })),
  };
}

function thumbProps(entry: TextTemplateEntry): TextProps {
  const base = textPropsFromTemplate(entry);
  const srcFont = Math.max(12, base.fontSize ?? 48);
  let scale = 20 / srcFont;
  const len = base.content.replace(/\s+/g, " ").trim().length;
  if (len > 12) scale *= 12 / len;
  if (base.content.includes("\n")) scale *= 0.88;
  scale = Math.min(0.55, Math.max(0.2, scale));
  return scaleTextPropsForThumb(base, scale);
}

function paintEntry(
  entry: TextTemplateEntry,
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): void {
  const props = thumbProps(entry);
  const dpr = Math.min(
    2,
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  );
  const raster = rasterizeText(props, dpr);
  if (!raster) {
    canvas.width = 0;
    canvas.height = 0;
    return;
  }

  const outW = Math.max(1, Math.round(cssW * dpr));
  const outH = Math.max(1, Math.round(cssH * dpr));
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, outW, outH);

  const pad = 6 * dpr;
  const maxW = outW - pad * 2;
  const maxH = outH - pad * 2;
  const fit = Math.min(1, maxW / raster.width, maxH / raster.height);
  const dw = raster.width * fit;
  const dh = raster.height * fit;
  const dx = (outW - dw) / 2;
  const dy = (outH - dh) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(raster.canvas, dx, dy, dw, dh);
}

type Props = {
  entry: TextTemplateEntry;
};

export function TextTemplateThumb({ entry }: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const cssW = Math.max(1, host.clientWidth || THUMB_CSS_W);
    const cssH = Math.max(1, host.clientHeight || THUMB_CSS_H);

    void ensureTextFontsLoaded()
      .catch(() => undefined)
      .then(() => {
        if (cancelled || !canvasRef.current) return;
        paintEntry(entry, canvasRef.current, cssW, cssH);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, entry]);

  return (
    <span
      ref={hostRef}
      className="text-aa__sample text-aa__sample--raster"
      aria-hidden
    >
      <canvas ref={canvasRef} />
    </span>
  );
}
