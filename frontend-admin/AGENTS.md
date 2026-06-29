# frontend-admin/AGENTS.md

React 19 + Vite + Tailwind CSS v4 SPA — the **admin** UI. Managed with **bun**.
Run commands from `frontend-admin/` (or via `just frontend-admin <args>`).

This is a separate Vite app from the public `frontend/`. It is served same-origin
by the backend's admin listener (see `backend/src/admin/`). The backend's
`include_dir!("…/frontend-admin/dist")` + `tower_serve_static::ServeDir` embeds
the built `dist/` into the binary — exactly like the public frontend.

## Developer commands

```
bun install             # install deps
bun dev                 # dev server (port 5174), proxies /api → backend admin listener
just check              # PARALLEL: type-check + lint-check + fmt-check
just fix                # fmt (prettier --write) + lint (eslint --fix)
just type-check         # bun run --bun tsc --noEmit
just lint-check         # eslint check-only (src/)
just fmt-check          # prettier check-only (src/)
```

Bare `bun` equivalents: `bun lint` (check, `src/` only), `bun lint:fix`,
`bun format` (write), `bun format:check`, `bun preview`.

**Gotcha:** `just frontend-admin lint` runs `bun run lint:fix` (**auto-fixes**,
does not just check). For a check-only pass use `just frontend-admin lint-check`.

Prefer `just check` (or `just fix`) as the one verification command — it covers
typecheck + lint + format together. No tests exist (yet).

## Environment

All env vars must be prefixed `VITE_` to reach the client:

| Variable                     | Description                                              | Default                       |
| :--------------------------- | :------------------------------------------------------- | :---------------------------- |
| `VITE_ADMIN_API_URL`         | Base URL for the admin API                               | `/api` (same-origin)          |
| `VITE_ADMIN_PROXY_TARGET`    | Dev only: backend admin listener to proxy `/api` to      | `http://localhost:9013`       |

In production the SPA is served same-origin by the backend admin listener, so the
default `/api` works with no configuration. The admin **key** is entered in the
login form (not an env var) and stored in `localStorage` (`admin_key`).

## Architecture

- **React 19** via `@vitejs/plugin-react`. JSX transform is `react-jsx` —
  **do not `import React`**.
- Path alias: **`@/*` → `src/*`** (`tsconfig.json`, applied by
  `vite-tsconfig-paths`).
- **Routing: TanStack Router** (code-based, defined in `src/router.tsx`). The
  public frontend has no router; this is the only app in the repo that uses one.
- **Server state: TanStack Query** (`src/lib/queries.ts`). Queries, mutations,
  and invalidation all live there. Connections + metadata poll every 5s via
  `refetchInterval`.
- **Auth**: credentials (`admin_api_url` + `admin_key`) live in `localStorage`
  (`src/lib/auth.ts`). The pathless `layout` route's `beforeLoad` guard redirects
  to `/login` when no key is present; any 401 from the fetcher clears the key and
  redirects (`src/lib/api.ts` + `wireUnauthorizedRedirect()`).
- **Validation: zod** — `src/entity/schemas.ts` mirrors the Rust `AdminSettings`
  struct and all admin API response shapes (camelCase). Keep in sync with
  `backend/src/admin/` and `backend/src/auth/` when the backend changes.
- **Toasts: `sonner`**. No Zustand — there is no global client state worth a
  store (server state is in Query, route state in the router, creds in storage).

## Lint / formatting conventions

- ESLint flat config (`eslint.config.mjs`): typescript-eslint **`strictTypeChecked`**
  (requires `projectService: true`), `eslint-plugin-react` +
  `eslint-plugin-react-hooks`, `eslint-plugin-prettier` (warns). Ignores
  `dist/**`, `node_modules/**`, `src/routeTree.gen.ts`.
- Prettier: `prettier-plugin-tailwindcss` auto-sorts Tailwind classes. Config in
  `.prettierrc` — **double quotes**, trailing commas (`all`), 100 char width,
  2-space, semis.
- TypeScript **strict**, with `noUnusedLocals`, `noUnusedParameters`,
  `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`.
- 2-space indent, LF line endings (`.editorconfig` at repo root).
