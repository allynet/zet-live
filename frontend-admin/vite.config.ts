import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

const ADMIN_PROXY_TARGET =
  process.env.VITE_ADMIN_PROXY_TARGET ?? "http://localhost:9013";

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
      },
    },
  },
  server: {
    host: true,
    port: 5174,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: ADMIN_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
});
