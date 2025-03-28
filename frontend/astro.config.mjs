// @ts-check
import worker from "@astropub/worker";
import { defineConfig, envField } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [worker()],
  build: {
    inlineStylesheets: "always",
    assets: "_static",
  },
  security: {
    checkOrigin: false,
  },
  server: {
    host: true,
  },
  env: {
    schema: {
      WEBSOCKET_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "/api/v1/ws",
      }),
      PUBLIC_SITE_URL: envField.string({
        context: "client",
        access: "public",
        default: "https://zet.igr.ec",
      }),
    },
  },
  vite: {
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
  },
});
