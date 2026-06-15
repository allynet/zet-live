# Plan: Admin UI, Application Settings, Global Notices & Toast Notifications

## Goal

1. Add an admin interface for managing the ZET Live application at runtime. The admin UI runs on a separate port, protected by a bearer token. It exposes connection info, runtime settings (pause fetching, override URLs), force-sync triggers, and sync metadata (last sync time, status, etc.).
2. Allow admins to set multiple **global notices** (persistent, dismissable bars beneath the search bar) displayed to all users. Notices are stored as a JSON array in a single `admin_settings` row and always sent to users on WebSocket connect as part of initial state.
3. Allow admins to send temporary **toast notifications** to all or specific connected users (by IP).

## Context

The backend currently has no admin capabilities. GTFS fetch URLs and intervals are set via env vars at startup. WebSocket connection tracking exists at `/api/v1/ws/connections` but is public. There is no way to observe sync status or pause/resume fetching at runtime. There is no mechanism for admins to communicate with users (notices or notifications).

## Design Decisions

- **Separate TCP port** — Admin server binds to `ADMIN_PORT` (env var). Completely isolated from the public server. Only started if both `ADMIN_KEY` and `ADMIN_PORT` are set.
- **Bearer token auth** — All `/api/*` routes require `Authorization: Bearer <ADMIN_KEY>`. Static HTML at `/` is served without auth (the page itself makes authenticated API calls from JS).
- **Env var only for admin key** — `ADMIN_KEY` env var. No DB storage for credentials. If unset, admin server is not started.
- **Settings table: one row per setting** — Key-value with JSON-encoded values. All fields optional; empty table means use env var defaults.
- **Metadata table: same layout, DB-only** — No in-memory cache. Read from DB on each admin API call. Written by fetchers after each sync attempt.
- **Typed in-memory settings struct** — `RwLock<AdminSettings>` with all fields `Option`. Loaded from DB at startup. Updated via admin API (write to DB → reload from DB into RwLock).
- **URL resolution: setting > env var** — Fetchers read URLs from `AdminSettings` at runtime. If a setting is `None`, fall back to the env var default from `Config`.
- **Pause: loop continues, skip fetch** — Fetcher loops keep running but skip the actual HTTP request when paused. Uses in-memory `AdminSettings` check.
- **Force sync: fire-and-forget (202)** — Admin API triggers sync via `Notify`, returns 202 immediately. Caller checks metadata later.
- **Static HTML admin page** — Simple single-file HTML + inline JS served at `/` on the admin port. No build step.
- **Move `/api/v1/ws/connections`** — Removed from public API, moved to `GET /api/connections` on admin router.

### Global Notices

- **Multiple notices stored as JSON array** — A single `admin_settings` row (`globalNotices`) holds a JSON array of `{id, text, severity}` objects. Empty array or absent means no notices.
- **Sent on WebSocket connect** — Notices are part of `InitialState` (pre-serialized CBOR), sent alongside vehicles and active stops. Every user always receives current notices on connect.
- **Broadcast on update** — When admin updates notices via `PUT /api/settings/globalNotices`, the new notices are serialized into `INITIAL_STATE.notices` and broadcast via `Transmission::BroadcastToAll` to all connected users.
- **Configurable severity** — Each notice has severity `info`, `warning`, or `error` with corresponding styling (blue, yellow, red).
- **Per-notice dismissal** — Frontend stores dismissed notice IDs in `localStorage`. Notice bar only shows notices whose ID hasn't been dismissed. Dismissal is per-notice, not global.
- **No separate REST endpoint** — Notices are always loaded via WS initial state. No public REST API for notices.

### Toast Notifications

- **Ephemeral, not persisted** — Toasts are sent to currently connected users only. Not stored in DB.
- **Broadcast channel** — Uses `tokio::sync::broadcast` channel (separate from the existing `watch` channel used for feed data). WS handler subscribes to both.
- **IP-based targeting** — Admin can target all users or specific IPs. The WS handler checks `NotificationTarget` and only sends to matching connections.
- **Admin API** — `POST /api/notify` accepts `{message, type, duration?, target, ips?}`. Type is `info`/`success`/`warning`/`error`. Duration is in ms (optional).
- **Frontend uses Sonner** — Existing `sonner` toast library. Toasts appear at `top-center` per existing config.

## File Operations

### Create

| File | Purpose |
|------|---------|
| `backend/migrations/<timestamp>_add_admin_settings_metadata.up.sql` | New `admin_settings` and `admin_metadata` tables |
| `backend/migrations/<timestamp>_add_admin_settings_metadata.down.sql` | Drop both tables |
| `backend/src/admin/mod.rs` | Admin module entry point |
| `backend/src/admin/settings.rs` | `AdminSettings` struct, `RwLock`, load/save DB functions |
| `backend/src/admin/metadata.rs` | `MetadataEntry` struct, DB read/write functions |
| `backend/src/admin/router.rs` | Admin Axum router, auth middleware, API handlers |
| `backend/src/admin/static_html.rs` | Static admin HTML page (inline `include_str!` or const) |
| `backend/src/admin/html/index.html` | Admin HTML page |

### Create (Global Notices & Toast Notifications)

| File | Purpose |
|------|---------|
| `backend/src/server/routes/v1/admin_notifications.rs` | `AdminNotification` enum, `NotificationTarget`, broadcast channel, helpers |
| `frontend/src/components/notice-bar.tsx` | Dismissable notice bar component rendered beneath search bar |

### Modify (Global Notices & Toast Notifications)

| File | Changes |
|------|---------|
| `backend/src/admin/settings.rs` | Add `GlobalNotice` struct + `global_notices: Vec<GlobalNotice>` field to `AdminSettings` |
| `backend/src/admin/mod.rs` | In `update_setting()`, when `globalNotices` changes: serialize + store in `INITIAL_STATE.notices`, broadcast via `Transmission::BroadcastToAll` |
| `backend/src/admin/router.rs` | Add `POST /api/notify` endpoint for sending toast notifications |
| `backend/src/admin/html/index.html` | Add notices management section (add/remove/edit notices) + notification sending section |
| `backend/src/server/routes/v1/mod.rs` | Add `GlobalNotices` and `Toast` variants to `Broadcast` enum. Add `notices: Vec<u8>` to `InitialState`. |
| `backend/src/server/routes/v1/ws/mod.rs` | Refactor to 3-branch `tokio::select!` (ping + feed transmission + admin notifications). Send notices in `send_initial_state()`. Check `NotificationTarget` for toasts. |
| `frontend/src/app/entity/v1/message.ts` | Add `notices` and `toast` payload shapes to Zod schema |
| `frontend/src/store.ts` | Add `globalNotices` to `StoreState` |
| `frontend/src/hooks/use-websocket.ts` | Handle notice/toast payloads from worker: update store for notices, call Sonner for toasts |
| `frontend/src/app.tsx` | Mount `<NoticeBar />` beneath search bar in top bar area |

### Modify

| File | Changes |
|------|---------|
| `backend/Cargo.toml` | No new deps needed (all deps already present) |
| `backend/src/cli/mod.rs` | Add `admin_key: Option<String>` and `admin_port: Option<u16>` to `ServerConfig` |
| `backend/src/main.rs` | Add `mod admin;` |
| `backend/src/server/mod.rs` | Conditionally start admin server alongside public server |
| `backend/src/server/routes/v1/mod.rs` | Remove `ws/connections` route |
| `backend/src/server/routes/v1/ws/mod.rs` | Remove `get_ws_connections` handler (keep `WS_CONNECTIONS` static for admin to read) |
| `backend/src/proto/gtfs_realtime/fetcher.rs` | Check admin settings for pause + URL override; write metadata after sync; add force-sync notify |
| `backend/src/proto/gtfs_schedule/fetcher.rs` | Same changes as realtime fetcher |

### Delete

None.

## Database Schema

### `admin_settings`

```sql
CREATE TABLE admin_settings (
    name       TEXT PRIMARY KEY,
    value      TEXT NOT NULL,  -- JSON-encoded value
    updated_at TEXT NOT NULL   -- ISO 8601 timestamp
);
```

Known setting names (all optional, no seeding):
- `gtfs_realtime_url` — JSON string. Overrides `ZI_DATA_FETCH_ENDPOINT`.
- `gtfs_static_url` — JSON string. Overrides `ZI_SCHEDULE_FETCH_ENDPOINT`.
- `gtfs_realtime_paused` — JSON boolean. Pauses realtime fetching.
- `gtfs_static_paused` — JSON boolean. Pauses static schedule fetching.

### `admin_metadata`

```sql
CREATE TABLE admin_metadata (
    name       TEXT PRIMARY KEY,
    value      TEXT NOT NULL,  -- JSON-encoded blob
    updated_at TEXT NOT NULL   -- ISO 8601 timestamp
);
```

Known metadata names (written by system):
- `gtfs_realtime_fetch` — JSON: `{status: "in-progress"|"success"|"error", last_sync_at: string, error_message: string|null, records_processed: number|null, duration_ms: number|null}`
- `gtfs_static_fetch` — Same structure

Additional metadata names may be added in the future without schema changes.

## In-Memory Settings

```rust
#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct AdminSettings {
    pub gtfs_realtime_url: Option<String>,
    pub gtfs_static_url: Option<String>,
    pub gtfs_realtime_paused: Option<bool>,
    pub gtfs_static_paused: Option<bool>,
}

pub static ADMIN_SETTINGS: LazyLock<RwLock<AdminSettings>> = ...;
```

Load from DB at startup. On every setting update via API: write to DB, then reload all settings from DB into `RwLock`.

## Admin API Endpoints

All routes under the admin router. Root serves static HTML.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Static admin HTML page |
| GET | `/api/connections` | Yes | WebSocket connection map (from `WS_CONNECTIONS`) |
| GET | `/api/settings` | Yes | List all settings from in-memory `AdminSettings` |
| PUT | `/api/settings/:name` | Yes | Update a single setting (write DB → reload in-memory) |
| POST | `/api/sync/realtime` | Yes | Force realtime fetch (returns 202) |
| POST | `/api/sync/static` | Yes | Force static fetch (returns 202) |
| GET | `/api/metadata` | Yes | List all metadata (read from DB) |

### Auth Middleware

Axum middleware layer that extracts `Authorization: Bearer <token>` from request headers. Compares against configured `ADMIN_KEY`. Returns 401 if missing/invalid. Applied to all `/api/*` routes, not to `/` (static HTML).

### PUT /api/settings/:name

Request body: JSON `{ "value": <json_value> }`

Valid setting names and their expected value types:
- `gtfs_realtime_url` → string or null
- `gtfs_static_url` → string or null
- `gtfs_realtime_paused` → boolean
- `gtfs_static_paused` → boolean

Returns the updated settings object.

## Fetcher Integration

### URL Resolution

Realtime fetcher (`gtfs_realtime/fetcher.rs`):
```rust
let url = {
    let settings = ADMIN_SETTINGS.read().await;
    settings.gtfs_realtime_url.clone()
}.unwrap_or_else(|| {
    Config::global().global.data_fetcher.data_fetch_endpoint.clone()
});
```

Schedule fetcher (`gtfs_schedule/fetcher.rs`): same pattern with `gtfs_static_url` and `schedule_fetch_endpoint`.

### Pause Check

At the top of each fetch cycle:
```rust
let paused = ADMIN_SETTINGS.read().await.gtfs_realtime_paused.unwrap_or(false);
if paused {
    trace!("Realtime fetching paused, skipping");
    tokio::time::sleep(interval).await;
    continue;
}
```

### Metadata Writes

After each sync attempt (success or failure), write metadata:
```rust
let metadata = MetadataEntry {
    status: "success".into(), // or "error"
    last_sync_at: jiff::Zoned::now().to_string(),
    error_message: None, // or Some(err.to_string())
    records_processed: Some(count),
    duration_ms: Some(elapsed.as_millis() as u64),
};
admin::metadata::write_metadata("gtfs_realtime_fetch", &metadata).await;
```

### Force Sync

Add a static `Notify` to each fetcher module. The fetcher loop waits on either the sleep timer or the notify:

```rust
static FORCE_SYNC: LazyLock<Arc<Notify>> = LazyLock::new(|| Arc::new(Notify::new()));

// In the loop:
tokio::select! {
    _ = tokio::time::sleep(interval) => {},
    _ = FORCE_SYNC.notified() => {
        trace!("Force sync triggered");
    },
}
```

The admin API calls `FORCE_SYNC.notify_one()` to trigger immediate sync.

## Global Notices

### Data Model

Notices are stored as a single `admin_settings` row with name `globalNotices`. The value is a JSON array:

```json
[
  { "id": "uuid-1", "text": "Welcome to ZET Live!", "severity": "info" },
  { "id": "uuid-2", "text": "Service disruptions on tram line 11", "severity": "warning" }
]
```

When no notices are set, the value is `null` or the row is absent.

### In-Memory Settings Update

```rust
#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct AdminSettings {
    // ... existing fields ...
    pub global_notices: Vec<GlobalNotice>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GlobalNotice {
    pub id: String,
    pub text: String,
    pub severity: NoticeSeverity,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum NoticeSeverity {
    Info,
    Warning,
    Error,
}
```

### Broadcast Enum Extension

```rust
pub enum Broadcast {
    Vehicles(Vec<Vec<MixedValue>>),
    ActiveStops(Vec<String>),
    GlobalNotices(Vec<GlobalNotice>),  // NEW
    Toast { message: String, toast_type: String, duration: Option<u32> },  // NEW
}
```

### InitialState Extension

```rust
pub struct InitialState {
    vehicles: Vec<u8>,
    active_stops: Vec<u8>,
    notices: Vec<u8>,  // NEW: pre-serialized Versioned<Broadcast::GlobalNotices>
}
```

On startup (after `admin::init()`), populate `INITIAL_STATE.notices` from the current `ADMIN_SETTINGS.global_notices`.

### Notice Lifecycle

1. **Admin sets notices** via `PUT /api/settings/globalNotices` with value `[...]` or `null`.
2. `update_setting()` writes to DB, reloads settings.
3. If the changed setting is `globalNotices`:
   - Serialize notices as `Versioned::new(1, Broadcast::GlobalNotices(notices))` via `minicbor_serde::to_vec`.
   - Store CBOR bytes in `INITIAL_STATE.notices` (for future connections).
   - Send `Transmission::BroadcastToAll(bytes)` (for current connections).
4. **On WS connect**: `send_initial_state()` sends `INITIAL_STATE.notices` as a binary WS message alongside vehicles and active stops.

## Toast Notifications

### Admin Notification Channel

A `tokio::sync::broadcast` channel carries ephemeral admin-initiated messages:

```rust
pub enum AdminNotification {
    Toast {
        message: String,
        toast_type: ToastType,
        duration: Option<u32>,
        target: NotificationTarget,
    },
}

pub enum ToastType {
    Info,
    Success,
    Warning,
    Error,
}

pub enum NotificationTarget {
    All,
    Ips(Vec<IpAddr>),
}

pub static ADMIN_NOTIFICATION_TX: LazyLock<broadcast::Sender<Arc<AdminNotification>>> = ...;
```

Capacity: 256. Late receivers miss messages (acceptable for ephemeral toasts).

### WebSocket Handler Refactor

Current: 2 spawned tasks (ping + transmission) + `tokio::select!` on join handles.

New: single `tokio::select!` loop with 3 branches:

```
loop {
    tokio::select! {
        _ = ping_interval.tick() => { send Ping }
        result = watch_rx.changed() => { send feed data }
        result = broadcast_rx.recv() => {
            match target {
                All => serialize + send
                Ips(ips) => if addr in ips { serialize + send }
            }
        }
    }
}
```

On any send error or channel close, break the loop and clean up.

### POST /api/notify

Request body:
```json
{
  "message": "Scheduled maintenance at 22:00",
  "type": "warning",
  "duration": 5000,
  "target": "all"
}
```
or:
```json
{
  "message": "Debug check",
  "type": "info",
  "target": "ips",
  "ips": ["192.168.1.100", "10.0.0.5"]
}
```

Returns 202 on success.

## Frontend Changes

### Message Schema Extension

Add new `.or()` branches to `v1MessageSchema`:

```ts
z.object({
  notices: z.array(z.object({
    id: z.string(),
    text: z.string(),
    severity: z.enum(["info", "warning", "error"]),
  })),
})
.or(z.object({
  toast: z.object({
    message: z.string(),
    type: z.enum(["info", "success", "warning", "error"]),
    duration: z.number().optional(),
  }),
}))
```

### Store State

Add to `StoreState`:
```ts
globalNotices: { id: string; text: string; severity: "info" | "warning" | "error" }[] | null;
```

### Message Handling

In `use-websocket.ts` worker response handler:
- `notices` payload → `useStore.setState({ globalNotices: message.d.notices })`
- `toast` payload → `toast[type](message.d.toast.message, { duration: message.d.toast.duration })`

Note: The worker already validates and forwards all messages. The main thread checks payload shape to dispatch.

### NoticeBar Component

New `frontend/src/components/notice-bar.tsx`:
- Reads `globalNotices` from store
- Reads `dismissedNoticeIds` from `localStorage` (JSON array of IDs)
- Filters out dismissed notices
- Renders a stack of notice bars beneath the search bar
- Each bar styled by severity: `info` = blue (`bg-blue-500`), `warning` = yellow (`bg-amber-500`), `error` = red (`bg-red-500`)
- Each has a dismiss "X" button that adds the notice ID to `dismissedNoticeIds` in localStorage
- Animate entrance/exit via `motion/react`

### App Layout

In `app.tsx`, add `<NoticeBar />` in the top bar area, below the existing grid row:

```tsx
<div className="pointer-events-none absolute top-2 right-12 left-2 z-1000">
  <div className="grid grid-cols-[minmax(0,auto)_1fr] gap-2 *:pointer-events-auto">
    {/* existing: settings button, status bar, search bar */}
  </div>
  <NoticeBar />
</div>
```

## Startup Sequence

1. `Database::init()` — runs migrations (creates new tables)
2. Load settings from DB into `RwLock<AdminSettings>` (empty = defaults)
3. Spawn fetchers (they check settings on each cycle)
4. Wait for initial data
5. Start public server
6. If `ADMIN_KEY` + `ADMIN_PORT` set, start admin server on separate port

## Static Admin HTML

Single HTML file with inline CSS and JS. Features:
- Connection list (IP + count)
- Settings form (URL overrides, pause toggles)
- Sync buttons (force realtime / static)
- Metadata display (last sync time, status, duration)
- **Notices management** — Add/edit/remove notices with text, severity (info/warning/error). Each notice gets a unique ID. Display current notices with delete buttons.
- **Send notification** — Form with message input, type dropdown (info/success/warning/error), optional duration, target selection (all / specific IPs from connection list). Send button.
- All API calls include `Authorization: Bearer <key>` header
- Auto-refresh metadata every 5-10 seconds

## Implementation Order

### Phase 1: Admin UI & Settings (already implemented)

1. Add `ADMIN_KEY` / `ADMIN_PORT` to `ServerConfig` in `cli/mod.rs`
2. Create DB migration for `admin_settings` + `admin_metadata`
3. Create `backend/src/admin/settings.rs` — `AdminSettings` struct + RwLock + DB load/save
4. Create `backend/src/admin/metadata.rs` — `MetadataEntry` struct + DB read/write
5. Create admin HTML page (`backend/src/admin/html/index.html`)
6. Create `backend/src/admin/router.rs` — auth middleware, API handlers, static HTML serving
7. Create `backend/src/admin/mod.rs` — module entry, public init function
8. Integrate admin into `server/mod.rs` — start admin server conditionally
9. Add `mod admin` to `main.rs`
10. Integrate settings into `gtfs_realtime/fetcher.rs` — URL override, pause, metadata, force-sync
11. Integrate settings into `gtfs_schedule/fetcher.rs` — same changes
12. Move `WS_CONNECTIONS` reading to admin router; remove `/api/v1/ws/connections` from public API
13. Remove `get_ws_connections` handler from `ws/mod.rs`
14. Run `just fmt-dev`

### Phase 2: Global Notices & Toast Notifications

15. Extend `AdminSettings` with `GlobalNotice` struct + `global_notices: Vec<GlobalNotice>` field
16. Add `GlobalNotices` and `Toast` variants to `Broadcast` enum
17. Add `notices: Vec<u8>` to `InitialState`, populate on startup from admin settings
18. Create `admin_notifications.rs` — `AdminNotification` enum, broadcast channel, helpers
19. Hook `update_setting()` to broadcast notices when `globalNotices` changes
20. Refactor WS handler to 3-branch `tokio::select!` (ping + feed + admin notifications)
21. Send notices in `send_initial_state()` on WS connect
22. Add `POST /api/notify` endpoint for toast notifications
23. Update admin HTML with notices management + notification sending UI
24. Extend frontend `v1MessageSchema` with `notices` and `toast` payload shapes
25. Add `globalNotices` to frontend store state
26. Handle notice/toast messages in `use-websocket.ts`
27. Create `NoticeBar` component
28. Mount `NoticeBar` in `app.tsx` beneath search bar
29. Run `just fmt-dev`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| RwLock contention on settings (every fetch cycle reads it) | Settings reads are cheap (clone of small struct). RwLock allows concurrent reads. |
| DB write on every sync metadata update adds latency | Metadata writes are fire-and-forget (spawned tasks). No impact on fetch cycle timing. |
| Admin server crash doesn't affect public server | Separate `axum::serve` on separate port. Can panic independently. |
| Invalid URL in settings breaks fetcher | URL strings are not validated at save time. If invalid, the fetch fails with error (same as bad env var). Metadata shows the error. Admin can reset by setting to null. |
| Force sync while already syncing | `Notify::notify_one()` wakes the loop. If already mid-sync, the next cycle runs immediately after. No overlap (single-threaded loop). |
| Empty admin HTML served without auth | The HTML is a static page with no data. API calls require auth. No security risk. |
| Large notices array | Notices are small text blobs; even 100 notices is negligible. Admin is responsible for managing the list. |
| Broadcast channel overflow for toasts | Capacity 256. If admin sends >256 toasts before any are consumed, oldest are dropped. Acceptable for ephemeral toasts. |
| Notice dismissal on multiple tabs | `localStorage` is shared across tabs. Dismissing in one tab doesn't auto-update other tabs (requires page reload or storage event listener). |
| Race condition: notice update during WS connect | `INITIAL_STATE.notices` is updated atomically before broadcast. New connections get the latest. Current connections get the broadcast. No gap. |
