import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KINETIC_CATEGORIES,
  KINETIC_STICKERS,
  generateKineticStickerSvg,
} from "../src/stickers/kinetic/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "assets/stickers/kinetic");
fs.mkdirSync(outRoot, { recursive: true });
for (const cat of KINETIC_CATEGORIES) {
  fs.mkdirSync(path.join(outRoot, cat.id), { recursive: true });
}

let n = 0;
for (const stk of KINETIC_STICKERS) {
  const svg = generateKineticStickerSvg(stk, {
    size: 512,
    paletteKey: "vibrant",
    backingMode: "diecut",
    strokeScale: 1,
  });
  fs.writeFileSync(path.join(outRoot, stk.category, `${stk.slug}.svg`), svg);
  n += 1;
}

const index = {
  version: 3,
  source: "IndieCut Kinetic",
  license: "Original — see LICENSE.md",
  count: n,
  stickers: KINETIC_STICKERS.map((s) => ({
    id: s.id,
    name: s.title,
    file: `kinetic/${s.category}/${s.slug}.svg`,
    group: s.category,
  })),
};
fs.writeFileSync(
  path.join(root, "assets/stickers/manifest.json"),
  `${JSON.stringify(index, null, 2)}\n`,
);
console.log(`Wrote ${n} SVGs → assets/stickers/kinetic/`);
