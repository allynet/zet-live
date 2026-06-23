CREATE TABLE feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL,
    message     TEXT NOT NULL,
    name        TEXT,
    contact     TEXT,
    meta_url    TEXT,
    meta_ua     TEXT,
    meta_lang   TEXT,
    meta_build  TEXT,
    ip          TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    handled     INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE INDEX idx_feedback__created_at ON feedback (created_at DESC);
CREATE INDEX idx_feedback__handled ON feedback (handled);
