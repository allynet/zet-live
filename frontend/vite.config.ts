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
        assetFileNames: "_static/file.[hash].[ext]",
        chunkFileNames: "_static/chunk.[hash].js",
        entryFileNames: "_static/entry.[hash].js",
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
