/**
 * Same-origin base URL for ORT `.mjs`/`.wasm` under `public/ort/`.
 * Resolved in the renderer because the speech worker may run under a blob: URL.
 */
export function resolveOrtAssetBaseUrl(): string {
  const base = import.meta.env.BASE_URL || "./";
  return new URL(`${base}ort/`, window.location.href).href;
}
