import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  define: {
    __DATE__: `"${new Date().toISOString()}"`,
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: "_static/file.[name].[hash].[ext]",
        chunkFileNames: "_static/chunk.[name].[hash].js",
        entryFileNames: "_static/entry.[name].[hash].js",
        manualChunks(id) {
          if (id.includes("/style/") && id.endsWith(".json")) {
            const name = id.split("/").pop()!.split(".").slice(0, -1).join(".");

            return `map-style-${name}`;
          }

          if (id.includes("/node_modules/maplibre-gl/")) {
            return "map";
          }

          if (id.includes("/node_modules/framer-motion/") || id.includes("/node_modules/motion")) {
            return "motion";
          }

          if (id.includes("/node_modules/")) {
            return "vendor";
          }

          return null;
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
  },
});
