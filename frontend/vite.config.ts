import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact(), tailwindcss(), tsconfigPaths()],
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
          if (id.includes("/node_modules/@vis.gl/") || id.includes("/node_modules/maplibre-gl/")) {
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
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
});
