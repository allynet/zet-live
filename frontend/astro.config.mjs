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
    allowedHosts: true,
  },
  env: {
    schema: {
      API_URL: envField.string({
        context: "client",
        access: "public",
        default: "/api",
      }),
      PUBLIC_SITE_URL: envField.string({
        context: "client",
        access: "public",
        default: "https://zet.igr.ec",
      }),
      PLAUSIBLE_SCRIPT_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PLAUSIBLE_API_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
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
