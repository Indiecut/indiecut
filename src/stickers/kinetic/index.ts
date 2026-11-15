export type {
  KineticPaletteKey,
  KineticBacking,
  KineticCategoryId,
  KineticStickerDef,
  KineticRenderOptions,
} from './types';

export {
  PALETTES,
  KINETIC_PALETTE_KEYS,
  KINETIC_PALETTE_LABELS,
  type KineticPalette,
} from './palettes';

export {
  KINETIC_CATEGORIES,
  KINETIC_STICKERS,
  getKineticSticker,
  filterKineticStickers,
  type KineticCategoryMeta,
} from './catalog';

export {
  generateKineticStickerSvg,
  escapeXml,
  getRoleColor,
  renderDecorativeAccents,
  type KineticStickerRenderInput,
} from './generateSvg';