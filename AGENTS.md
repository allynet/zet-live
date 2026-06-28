# AGENTS.md

> This is the **root** overview. The backend and frontend each have their own,
> more detailed `AGENTS.md` — **read the relevant one before editing that
> component**:
>
> - [`backend/AGENTS.md`](backend/AGENTS.md) — Rust/Axum server, sqlx, migrations, protobuf
> - [`frontend/AGENTS.md`](frontend/AGENTS.md) — React 19 + Vite + Tailwind, Zustand, maplibre

## Project overview

ZET Live — live tracking of ZET (Zagreb) public transit vehicles, plus GBFS
bike-share (nextbike) stations. Monorepo: a Rust/Axum backend serves both a
REST/WebSocket API and the baked-in frontend static files.

## Structure

- `backend/` — Rust (edition 2024) Axum server. Single crate `zet-live`.
- `frontend/` — React 19 + Vite + Tailwind CSS v4. Managed with bun.
- `docs/` — planning docs only.
- `Dockerfile`, `.github/workflows/` — build & deploy (cross-cutting; see below).

## Root commands (delegates to sub-justfiles)

```
just backend <args>     # runs `just <args>` in backend/
just frontend <args>    # runs `just <args>` in frontend/
just build              # frontend build && backend build
just run <args>         # build, then backend run
```

The root justfile sets `dotenv-load := false`. The sub-justfiles enable it
(backend reads `backend/.env`, frontend reads `frontend/.env`). The root `.env`
is **not** auto-loaded by the root justfile.

No tests exist in either the frontend or the backend (yet).

## Global conventions

- All files: 2-space indent, LF line endings, trim trailing whitespace
  (see `.editorconfig`). **Rust files are the exception: 4-space indent.**
- Don't commit secrets.

## Docker / deploy (cross-cutting)

- Multi-stage Dockerfile: cargo-chef → bun frontend build → Rust build (with UPX
  compression) → `scratch` runner. **Docker build targets
  `x86_64-unknown-linux-gnu`**, whereas dev justfiles target
  `x86_64-unknown-linux-musl` — don't assume one target everywhere.
- CI (`.github/workflows/`): push to `main` triggers build on Blacksmith
  runners, pushes to Docker Hub (`allypost/zet-live`), notifies Watchtower. Uses
  S3 for build cache.
- Frontend env vars for production are set via `frontend/.env.docker` in CI.
