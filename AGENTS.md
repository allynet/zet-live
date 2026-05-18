# AGENTS.md

## Project overview

ZET Live — live tracking of ZET (Zagreb) public transit vehicles.
Monorepo: Rust backend serves both a REST/WebSocket API and the baked-in frontend static files.

## Structure

- `backend/` — Rust (edition 2024) Axum server. Single crate `zet-live`.
- `frontend/` — Preact + Vite + Tailwind CSS v4. Managed with bun.
- `docs/` — planning docs only.

## Developer commands

### Backend (run from `backend/` or root)

```
just dev-watch-server          # hot-reload dev server (cargo watch)
just dev-run-server            # run once (cargo run)
just lint                      # cargo clippy (nursery + pedantic)
just lint-fix                  # cargo clippy --fix
just fmt                       # lint-fix THEN cargo fmt (order matters!)
just fmt-dev                   # cargo fmt using nightly toolchain
```

The root `justfile` delegates `dev-watch-server` and `dev-run-server` to the backend.

### Frontend (run from `frontend/`)

```
bun install                    # install deps
bun dev                        # dev server (port 5173)
bun build                      # production build → frontend/dist/
bun lint                       # eslint check
bun lint:fix                   # eslint --fix
bun format                     # prettier --write
bun format:check               # prettier --check
```

No tests exist in either frontend or backend.

## Environment

Root `.env` is loaded by both `dotenvy` (Rust) and `just` (`dotenv-load`).
Key variables: `LOG_LEVEL`, `DATABASE_URL`, `ZI_DATA_FETCH_ENDPOINT`, `ZI_DATA_FETCH_INTERVAL`, `ZI_SCHEDULE_FETCH_ENDPOINT`, `ZI_SCHEDULE_FETCH_INTERVAL`.

Frontend env vars must be prefixed `VITE_`. See `frontend/README.md`.

## Backend architecture notes

- **Entry**: `backend/src/main.rs` → clap CLI. Only subcommand: `server` (default port 9011).
- **API routes**: `/api/v1/*` in `backend/src/server/routes/v1/`. Frontend served as fallback at `/`.
- **Database**: libsql (SQLite). Migrations are raw SQL files in `backend/src/database/migrations/`, embedded at compile time via `include_dir!`, sorted by filename, auto-applied at startup.
- **Protobuf**: GTFS Realtime proto in `backend/protobuf/`. `build.rs` compiles it via prost-build → generated `_gtfs_realtime.rs` in `OUT_DIR`.
- **Static linking**: Dev commands set `RUSTFLAGS='-C target-feature=+crt-static'`, target `x86_64-unknown-linux-gnu`.
- **listenfd**: Supported for socket-activated dev via `listenfd` crate.

## Lint / formatting conventions

- Clippy: nursery + pedantic enabled. `unwrap_used` is warn. Several common lints allowed (see `Cargo.toml` `[lints.clippy]`).
- rustfmt: grouped imports (`StdExternalCrate`), vertical layout, crate-level granularity. See `backend/rustfmt.toml`.
- ESLint: flat config (`eslint.config.mjs`) with `@eslint/js` recommended, `typescript-eslint` recommended, `eslint-plugin-react` + `eslint-plugin-react-hooks` (Preact/JSX rules), `eslint-plugin-prettier` (warns on prettier issues), `eslint-config-prettier` (disables conflicting rules).
- Prettier: `prettier-plugin-tailwindcss` for automatic Tailwind class sorting. Config in `frontend/.prettierrc`.
- All files: 2-space indent, LF line endings. Rust files: 4-space indent (editorconfig).

## Frontend architecture notes

- Preact with react-compat aliases (`react` → `preact/compat`). Use Preact patterns (signals, not React hooks).
- Path alias: `@/*` → `src/*` (configured in both `tsconfig.json` and `vite.config.ts`).
- State management: Preact signals in `src/state.ts`.

## Docker / deploy

- Multi-stage Dockerfile: cargo-chef → bun frontend build → Rust build (with UPX compression) → scratch runner.
- CI: push to `main` triggers build, pushes to Docker Hub (`allypost/zet-live`), notifies Watchtower.
- Frontend env vars for production are set via `frontend/.env.docker` in CI.
