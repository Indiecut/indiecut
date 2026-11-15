import { RAW_CATEGORY_ITEMS } from './rawCategoryItems';
import type { KineticCategoryId, KineticStickerDef } from './types';

export type KineticCategoryMeta = {
  id: KineticCategoryId;
  name: string;
  count: number;
};

export const KINETIC_CATEGORIES = [
  { id: 'social', name: 'Social & Creator CTAs', count: 50 },
  { id: 'arrows', name: 'Directional & Motion Arrows', count: 50 },
  { id: 'sfx', name: 'Comic & SFX Action Bursts', count: 50 },
  { id: 'hud', name: 'Camera, REC & Cinema HUD', count: 50 },
  { id: 'callouts', name: 'Callouts & Lower Thirds', count: 50 },
  { id: 'reactions', name: 'Reactions & Vibe', count: 50 },
  { id: 'nle', name: 'Keyframes, NLE & Cursor UI', count: 50 },
  { id: 'gaming', name: 'Gaming, Stream & Esports', count: 50 },
  { id: 'vlog', name: 'Vlog, Lifestyle & Stamps', count: 50 },
  { id: 'kinetic', name: 'Kinetic Shapes, Frames & Accents', count: 50 },
] as const satisfies readonly KineticCategoryMeta[];

function buildStickerList(): KineticStickerDef[] {
  const stickers: KineticStickerDef[] = [];
  let globalIndex = 1;

  for (const cat of KINETIC_CATEGORIES) {
    const items = RAW_CATEGORY_ITEMS[cat.id] ?? [];
    let catIndex = 1;
    for (const entry of items) {
      const [title, subtitle, template, colorRole] = entry;
      const paddedId = String(globalIndex).padStart(3, "0");
      stickers.push({
        id: `k${paddedId}`,
        category: cat.id,
        title,
        subtitle,
        template,
        colorRole,
        catIndex,
        slug: `${paddedId}-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}`,
      });
      globalIndex += 1;
      catIndex += 1;
    }
  }

  return stickers;
}

export const KINETIC_STICKERS: KineticStickerDef[] = buildStickerList();

const stickerById = new Map(KINETIC_STICKERS.map((s) => [s.id, s]));

export function getKineticSticker(id: string): KineticStickerDef | undefined {
  return stickerById.get(id);
}

export function filterKineticStickers(opts: {
  category?: string;
  query?: string;
}): KineticStickerDef[] {
  const q = opts.query?.trim().toLowerCase() ?? '';
  return KINETIC_STICKERS.filter((stk) => {
    if (opts.category && opts.category !== 'all' && stk.category !== opts.category) {
      return false;
    }
    if (!q) return true;
    return (
      stk.title.toLowerCase().includes(q) ||
      stk.subtitle.toLowerCase().includes(q) ||
      stk.template.toLowerCase().includes(q) ||
      stk.slug.includes(q) ||
      stk.id.includes(q) ||
      stk.id.replace(/^k/, '').includes(q)
    );
  });
}