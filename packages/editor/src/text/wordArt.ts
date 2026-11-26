/** WordArt / quick style recipes applied to the current text selection. */

import type { CSSProperties } from "react";
import type { TextRunStyle } from "../project/types";
import { formatLinearGradientCss } from "../compositor/rasterizeText";

export type WordArtId =
  | "sunset"
  | "neon"
  | "gold"
  | "hollow"
  | "highlight"
  | "editorial"
  | "ice"
  | "ember"
  | "comic"
  | "ink"
  | "candy"
  | "mono";

export type WordArtEntry = {
  id: WordArtId;
  label: string;
  style: TextRunStyle;
};

export const WORD_ART_PRESETS: WordArtEntry[] = [
  {
    id: "sunset",
    label: "Sunset Pop",
    style: {
      fontWeight: 900,
      color: "#ffffff",
      gradient: formatLinearGradientCss(90, "#f59e0b", "#ec4899"),
      strokeWidth: 0,
      highlight: null,
    },
  },
  {
    id: "neon",
    label: "Cyber Glow",
    style: {
      fontWeight: 900,
      color: "#67e8f9",
      gradient: null,
      strokeColor: "#06b6d4",
      strokeWidth: 1,
      highlight: null,
    },
  },
  {
    id: "gold",
    label: "Gold Foil",
    style: {
      fontWeight: 900,
      color: "#fde047",
      gradient: formatLinearGradientCss(180, "#fef08a", "#b45309"),
      strokeColor: "#78350f",
      strokeWidth: 1,
      highlight: null,
    },
  },
  {
    id: "hollow",
    label: "Hollow Ink",
    style: {
      fontWeight: 900,
      color: "transparent",
      gradient: null,
      strokeColor: "#f472b6",
      strokeWidth: 2.5,
      highlight: null,
    },
  },
  {
    id: "highlight",
    label: "Marker Pop",
    style: {
      fontWeight: 700,
      color: "#0f172a",
      gradient: null,
      strokeWidth: 0,
      highlight: "#bef264",
    },
  },
  {
    id: "editorial",
    label: "Editorial",
    style: {
      fontFamily: "Playfair Display, Georgia, serif",
      fontWeight: 700,
      fontStyle: "italic",
      color: "#f8fafc",
      gradient: null,
      strokeWidth: 0,
      highlight: null,
    },
  },
  {
    id: "ice",
    label: "Ice Glass",
    style: {
      fontWeight: 800,
      color: "#e0f2fe",
      gradient: formatLinearGradientCss(180, "#e0f2fe", "#0284c7"),
      strokeColor: "#0c4a6e",
      strokeWidth: 1,
      highlight: null,
    },
  },
  {
    id: "ember",
    label: "Ember",
    style: {
      fontWeight: 900,
      color: "#fecaca",
      gradient: formatLinearGradientCss(90, "#f97316", "#dc2626"),
      strokeColor: "#7f1d1d",
      strokeWidth: 1.5,
      highlight: null,
    },
  },
  {
    id: "comic",
    label: "Comic Pop",
    style: {
      fontFamily: "Bangers, system-ui, sans-serif",
      fontWeight: 400,
      color: "#fef08a",
      gradient: null,
      strokeColor: "#18181b",
      strokeWidth: 3,
      highlight: null,
    },
  },
  {
    id: "ink",
    label: "Heavy Ink",
    style: {
      fontWeight: 900,
      color: "#f8fafc",
      gradient: null,
      strokeColor: "#0f172a",
      strokeWidth: 4,
      highlight: null,
    },
  },
  {
    id: "candy",
    label: "Candy Soft",
    style: {
      fontFamily: "Fredoka, system-ui, sans-serif",
      fontWeight: 700,
      color: "#831843",
      gradient: null,
      strokeWidth: 0,
      highlight: "#fbcfe8",
    },
  },
  {
    id: "mono",
    label: "Terminal",
    style: {
      fontFamily: "Rubik Mono One, Menlo, monospace",
      fontWeight: 400,
      color: "#4ade80",
      gradient: null,
      strokeWidth: 0,
      highlight: null,
    },
  },
];

export function wordArtById(id: string): WordArtEntry | undefined {
  return WORD_ART_PRESETS.find((p) => p.id === id);
}

/** CSS preview for WordArt tiles (shows “Aa”, not the label). */
export function wordArtSampleStyle(entry: WordArtEntry): CSSProperties {
  const s = entry.style;
  const strokeW = s.strokeWidth ?? 0;
  const color = s.color ?? "#ffffff";
  const stroke = s.strokeColor ?? "#000000";
  const fillColor = s.gradient
    ? "transparent"
    : color === "transparent"
      ? stroke
      : color;
  return {
    color: fillColor,
    fontFamily: s.fontFamily ?? "system-ui, sans-serif",
    fontWeight: (s.fontWeight as CSSProperties["fontWeight"]) ?? 800,
    fontStyle: s.fontStyle ?? "normal",
    backgroundImage: s.gradient ?? undefined,
    WebkitBackgroundClip: s.gradient ? "text" : undefined,
    backgroundClip: s.gradient ? "text" : undefined,
    WebkitTextFillColor:
      s.gradient || color === "transparent" ? "transparent" : undefined,
    WebkitTextStroke:
      strokeW > 0
        ? `${Math.min(2.2, strokeW * 0.45)}px ${stroke}`
        : undefined,
    backgroundColor: s.highlight ?? undefined,
    boxShadow:
      entry.id === "neon" ? `0 0 10px ${s.color ?? "#67e8f9"}` : undefined,
  };
}
