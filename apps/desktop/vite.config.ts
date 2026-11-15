import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
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
    port: 5173,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
  },
  base: "./",
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
