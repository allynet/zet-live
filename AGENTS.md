# AGENTS.md

## Project overview

ZET Live — live tracking of ZET (Zagreb) public transit vehicles.
Monorepo: Rust backend serves both a REST/WebSocket API and the baked-in frontend static files.

## Structure

- `backend/` — Rust (edition 2024) Axum server. Single crate `zet-live`.
- `frontend/` — Preact + Vite + Tailwind CSS v4. Managed with bun.
- `docs/` — planning docs only.

## Developer commands

### Root justfile (delegates to sub-justfiles)

```
just backend <args>     # runs `just <args>` in backend/
just frontend <args>    # runs `just <args>` in frontend/
```

### Backend (run from `backend/` or via `just backend`)

```
just dev-watch          # hot-reload dev server (watchexec, NOT cargo watch)
just dev-run            # run once (cargo run)
just test               # cargo test --workspace --all-features
just test-watch         # watchexec + test
just fmt-dev            # formats with nightly rustfmt (required)
```

**Always use `just fmt-dev`** — runs nightly `cargo fmt` and is the one command for formatting, linting, and checking compilation. Do NOT use `just fmt`, `just lint`, or `just lint-fix`.

All commands set `RUSTFLAGS='-C target-feature=+crt-static'` and target `x86_64-unknown-linux-gnu`.

### Frontend (run from `frontend/` or via `just frontend`)

```
bun install             # install deps
bun dev                 # dev server (port 5173)
bun build               # production build → frontend/dist/
bun lint                # eslint check (scopes src/ only)
bun lint:fix            # eslint --fix
bun format              # prettier --write (scopes src/ only)
bun format:check        # prettier --check
```

**Gotcha:** `just frontend lint` runs `bun run lint:fix` (auto-fixes), not a check-only pass. Use `just frontend lint-check` for check-only.

No tests exist in either frontend or backend.

## Environment

Root `.env` is loaded by both `dotenvy` (Rust) and `just` (`dotenv-load`).

**Backend** (`backend/.env`):

- `DATABASE_URL` — defaults to `:memory:` if unset. Dev uses `sqlite:./dev/db/db.sqlite` (gitignored under `backend/dev/`).
- `LOG_LEVEL`, `ZI_DATA_FETCH_ENDPOINT`, `ZI_DATA_FETCH_INTERVAL`, `ZI_SCHEDULE_FETCH_ENDPOINT`, `ZI_SCHEDULE_FETCH_INTERVAL`.

**Frontend** env vars must be prefixed `VITE_`. See `frontend/README.md`. Key vars: `VITE_API_URL`, `VITE_PUBLIC_SITE_URL`, `VITE_PLAUSIBLE_*`.

## Backend architecture notes

- **Entry**: `backend/src/main.rs` → clap CLI. Only subcommand: `server` (default port 9011).
- **API routes**: `/api/v1/*` in `backend/src/server/routes/v1/`. Frontend served as fallback at `/`.
- **WebSocket**: real-time vehicle updates via `/api/v1/ws/`.
- **Database**: libsql (SQLite). Migrations are raw SQL files in `backend/src/database/migrations/`, embedded at compile time via `include_dir!`, sorted by filename, auto-applied at startup.
- **Protobuf**: GTFS Realtime proto in `backend/protobuf/`. `build.rs` compiles it via prost-build → generated `_gtfs_realtime.rs` in `OUT_DIR`.
- **Build info**: `build-info` / `build-info-build` crates inject version, build date, rustc version at compile time.
- **Static linking**: Dev commands set `RUSTFLAGS='-C target-feature=+crt-static'`, target `x86_64-unknown-linux-gnu`.
- **listenfd**: Supported for socket-activated dev via `listenfd` crate.
- **Never remove clippy lints from `Cargo.toml` or add `#[allow(...)]` / `#[expect(...)]` to suppress warnings without explicit user permission.** Lints are carefully chosen.

## Frontend architecture notes

- Preact with react-compat aliases (`react` → `preact/compat`, `react-dom` → `preact/compat`) — needed for `react-map-gl` compatibility.
- Path alias: `@/*` → `src/*` (configured in both `tsconfig.json` and `vite.config.ts`).
- State management: Preact signals in `src/state.ts`, mutations in `src/state-actions.ts`.
- Real-time data via WebSocket, processed in web workers (`src/scripts/worker.ts`).
- Map rendering: `react-map-gl` + `maplibre-gl`. Map styles in `src/data/maps/style/`.
- Key libs: `zod` (validation), `cbor2` (binary parsing), `motion` (animation), `sonner` (toasts), `lodash`.

## Lint / formatting conventions

### Backend

- Clippy: nursery + pedantic enabled. `unwrap_used` is warn. Several common lints allowed (see `Cargo.toml` `[lints.clippy]`).
- rustfmt: grouped imports (`StdExternalCrate`), vertical layout, crate-level granularity. See `backend/rustfmt.toml`. Also `format_macro_matchers = true`, `format_strings = true`.
- `fmt-dev` runs **nightly** rustfmt — use this for all formatting.

### Frontend

- ESLint: flat config (`eslint.config.mjs`), typescript-eslint `strictTypeChecked`, `eslint-plugin-react` + `eslint-plugin-react-hooks` (Preact/JSX), `eslint-plugin-prettier` (warns), `eslint-config-prettier` (disables conflicting rules). Requires `projectService: true`.
- Prettier: `prettier-plugin-tailwindcss` for automatic Tailwind class sorting. Config in `frontend/.prettierrc` (double quotes, trailing commas, 100 char width).
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`.
- All files: 2-space indent, LF line endings. Rust files: 4-space indent (editorconfig).

## Docker / deploy

- Multi-stage Dockerfile: cargo-chef → bun frontend build → Rust build (with UPX compression) → scratch runner.
- CI: push to `main` triggers build on Blacksmith runners, pushes to Docker Hub (`allypost/zet-live`), notifies Watchtower. Uses S3 for build cache.
- Frontend env vars for production are set via `frontend/.env.docker` in CI.
