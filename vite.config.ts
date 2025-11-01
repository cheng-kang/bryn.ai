import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "path";
import manifest from "./public/manifest.json";

export default defineConfig({
  plugins: [
    react({
      // Exclude service worker from React transformations
      exclude: [/service-worker\.ts$/, /background\//],
    }),
    crx({ manifest: manifest as any }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "src/sidepanel/index.html"),
      },
      output: {
        // Ensure proper code splitting
        manualChunks: (id) => {
          // Keep service worker separate
          if (id.includes("service-worker") || id.includes("background/")) {
            return "service-worker";
          }
          // Keep content scripts separate
          if (id.includes("content-scripts/")) {
            return "content-scripts";
          }
          // UI code
          if (id.includes("sidepanel/") || id.includes("components/ui/")) {
            return "sidepanel";
          }
          // Core logic shared
          if (id.includes("src/core/") || id.includes("src/services/")) {
            return "core";
          }
        },
      },
    },
  },
});
