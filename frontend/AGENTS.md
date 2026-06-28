# frontend/AGENTS.md

React 19 + Vite + Tailwind CSS v4 app. Managed with **bun**. Run commands from
`frontend/` (or via `just frontend <args>`).

## Developer commands

```
bun install             # install deps
bun dev                 # dev server (port 5173)
bun build               # production build → dist/
just check              # PARALLEL: type-check + lint-check + fmt-check
just fix                # fmt (prettier --write) + lint (eslint --fix)
just type-check         # bun run --bun tsc --noEmit
just lint-check         # eslint check-only (src/)
just fmt-check          # prettier check-only (src/)
```

Bare `bun` equivalents: `bun lint` (check, `src/` only), `bun lint:fix`,
`bun format` (write), `bun format:check`, `bun preview`.

**Gotcha:** `just frontend lint` runs `bun run lint:fix` (**auto-fixes**, does
not just check). For a check-only pass use `just frontend lint-check`.

Prefer `just check` (or `just fix`) as the one verification command — it covers
typecheck + lint + format together. No tests exist (yet).

## Environment

All env vars must be prefixed `VITE_` to reach the client (see `README.md`):

| Variable                    | Description                    | Default |
| :-------------------------- | :----------------------------- | :------ |
| `VITE_API_URL`              | Backend API URL                | `/api`  |
| `VITE_PUBLIC_SITE_URL`      | Public site URL (SEO)          |         |
| `VITE_PLAUSIBLE_SITE_URL`   | Plausible analytics site URL   |         |
| `VITE_PLAUSIBLE_SCRIPT_URL` | Plausible analytics script URL |         |
| `VITE_PLAUSIBLE_API_URL`    | Plausible analytics API URL    |         |

## Architecture

- **React 19** via `@vitejs/plugin-react`. JSX transform is `react-jsx` —
  **do not `import React`**.
- Path alias: **`@/*` → `src/*`** (`tsconfig.json`, applied by
  `vite-tsconfig-paths`).
- **State management: Zustand** — `src/store.ts` (`subscribeWithSelector`),
  plus `src/feedback-store.ts` and `src/settings.ts`. No signals, no Redux.
- **Realtime pipeline**: WebSocket runs inside a **SharedWorker**
  (`src/scripts/worker.ts`); the worker decodes **CBOR** (`cbor2`) frames and
  posts processed messages back. `src/hooks/use-websocket.ts` is the bridge.
  Entities/validation are defined with **zod** in `src/app/entity/v1/`.
- **Map**: `react-map-gl` + `maplibre-gl`. Map styles live under `src/data/maps/`.
- Key libs: `zod`, `cbor2`, `motion` (animation), `sonner` (toasts),
  `fuse.js` (search), `clsx` + `tailwind-merge`, `zustand`. (No `lodash`.)

## Lint / formatting conventions

- ESLint flat config (`eslint.config.mjs`): typescript-eslint **`strictTypeChecked`**
  (requires `projectService: true`), `eslint-plugin-react` +
  `eslint-plugin-react-hooks`, `eslint-plugin-prettier` (warns). Ignores
  `dist/**`, `node_modules/**`.
- Prettier: `prettier-plugin-tailwindcss` auto-sorts Tailwind classes. Config in
  `.prettierrc` — **double quotes**, trailing commas (`all`), 100 char width,
  2-space, semis.
- TypeScript **strict**, with `noUnusedLocals`, `noUnusedParameters`,
  `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`.
- 2-space indent, LF line endings (`.editorconfig`).
