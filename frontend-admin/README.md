# ZET Live — Admin

The admin UI for ZET Live. A separate Vite SPA served same-origin by the
backend's admin listener. See `AGENTS.md` for the full developer guide.

## Quick start

```sh
just install      # bun install
just dev          # vite dev server on :5174, proxies /api → backend
```

The backend admin listener must be running (set `ADMIN_KEY` + `ADMIN_BIND_TO` in
`backend/.env`). In dev it runs on `http://localhost:9013` by default; the Vite
dev server proxies `/api` there (override with `VITE_ADMIN_PROXY_TARGET`).

In production the backend serves this app's built `dist/` on the admin port, so
`/api` is same-origin.
