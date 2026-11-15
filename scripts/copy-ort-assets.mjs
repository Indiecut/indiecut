import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy ORT runtime files next to the app so Electron CSP can load them
 * from same-origin instead of cdn.jsdelivr.net.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "public", "ort");
const sources = [
  join(root, "node_modules", "@huggingface", "transformers", "dist"),
  join(root, "node_modules", "onnxruntime-web", "dist"),
];

mkdirSync(destDir, { recursive: true });

const copied = new Set();
for (const srcDir of sources) {
  let names;
  try {
    names = readdirSync(srcDir);
  } catch {
    continue;
  }
  for (const name of names) {
    if (!name.startsWith("ort-wasm-simd-threaded")) continue;
    if (!name.endsWith(".mjs") && !name.endsWith(".wasm")) continue;
    if (copied.has(name)) continue;
    cpSync(join(srcDir, name), join(destDir, name));
    copied.add(name);
  }
}

if (copied.size === 0) {
  console.error(
    "copy-ort-assets: no ort-wasm-simd-threaded assets found under transformers/onnxruntime-web",
  );
  process.exit(1);
}

console.log(`copy-ort-assets: copied ${copied.size} file(s) → public/ort/`);
