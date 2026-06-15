CREATE TABLE admin_settings (
    name       TEXT PRIMARY KEY,
    value      BLOB NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE admin_metadata (
    name       TEXT PRIMARY KEY,
    value      BLOB NOT NULL,
    updated_at TEXT NOT NULL
);

