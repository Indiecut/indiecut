import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.png"],
      manifest: {
        name: "IndieCut",
        short_name: "IndieCut",
        description:
          "Open-source video editor — timeline, preview, export, captions",
        theme_color: "#0e1012",
        background_color: "#0e1012",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Do not precache ORT WASM (~22MB); load on demand for captions.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,mjs}"],
        globIgnores: ["**/ort-wasm*.wasm", "**/*ort-wasm*"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(repoRoot, "packages/editor/src"),
      "@indiecut/editor": path.resolve(repoRoot, "packages/editor/src/index.ts"),
      "@indiecut/platform": path.resolve(
        repoRoot,
        "packages/platform/src/index.ts",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  publicDir: path.resolve(repoRoot, "public"),
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  base: "/",
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
