import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, type Plugin } from "vite";

const FAVICON_DIR = fileURLToPath(new URL("./src/assets/img/favicon/", import.meta.url));

const MANIFEST_ICONS = [
  { file: "android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { file: "android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { file: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  { file: "favicon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
] as const;

const MANIFEST_BASE = {
  name: "ZET Live",
  short_name: "ZET Live",
  description: "Trenutni položaj i red vožnje svih javno dostupnih ZET vozila prikazan uživo",
  id: "/",
  start_url: "/",
  scope: "/",
  lang: "hr",
  theme_color: "#ffffff",
  background_color: "#ffffff",
  display: "standalone",
  orientation: "any",
  categories: ["navigation", "travel", "utilities"],
} as const;

// Emits the web app manifest as a generated build asset so its icon URLs flow
// through Vite's asset pipeline (hashed, immutable) instead of pointing at raw
// public/ files. The manifest itself stays at a stable root URL (/site.webmanifest)
// so index.html's <link rel="manifest"> never needs rewriting.
function webmanifest(): Plugin {
  return {
    name: "zet-live:webmanifest",
    generateBundle() {
      const icons = MANIFEST_ICONS.map((icon) => {
        const source = fs.readFileSync(path.join(FAVICON_DIR, icon.file));
        const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
        const dot = icon.file.lastIndexOf(".");
        const base = dot >= 0 ? icon.file.slice(0, dot) : icon.file;
        const ext = dot >= 0 ? icon.file.slice(dot) : "";
        const fileName = `_static/file.${base}.${hash}${ext}`;

        this.emitFile({ type: "asset", fileName, source: new Uint8Array(source) });

        return iconEntry(icon, `/${fileName}`);
      });

      this.emitFile({
        type: "asset",
        fileName: "site.webmanifest",
        source: JSON.stringify({ ...MANIFEST_BASE, icons }, null, 2),
      });
    },
    configureServer(server) {
      server.middlewares.use("/site.webmanifest", (_req, res) => {
        const icons = MANIFEST_ICONS.map((icon) =>
          iconEntry(icon, `/src/assets/img/favicon/${icon.file}`),
        );

        res.setHeader("content-type", "application/manifest+json");
        res.end(JSON.stringify({ ...MANIFEST_BASE, icons }, null, 2));
      });
    },
  };
}

function iconEntry(
  icon: (typeof MANIFEST_ICONS)[number],
  src: string,
): { src: string; sizes: string; type: string; purpose?: string } {
  const entry = { src, sizes: icon.sizes, type: icon.type };

  return icon.purpose === "any" ? entry : { ...entry, purpose: icon.purpose };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths(), webmanifest()],
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
