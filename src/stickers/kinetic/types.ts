export type KineticPaletteKey =
  | "vibrant"
  | "cyber"
  | "cinema"
  | "pastel"
  | "mono";

export type KineticBacking = "diecut" | "flat" | "glow";

export type KineticCategoryId =
  | "social"
  | "arrows"
  | "sfx"
  | "hud"
  | "callouts"
  | "reactions"
  | "nle"
  | "gaming"
  | "vlog"
  | "kinetic";

export type KineticStickerDef = {
  id: string;
  category: KineticCategoryId;
  title: string;
  subtitle: string;
  template: string;
  colorRole: string;
  slug: string;
  /** 1-based index within category (matches HTML suite). */
  catIndex: number;
};

/** Runtime look — no text labels (stickers are graphics only). */
export type KineticRenderOptions = {
  paletteKey?: KineticPaletteKey;
  backingMode?: KineticBacking;
  strokeScale?: number;
};
