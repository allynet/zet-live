-- SQLite doesn't support ALTER TABLE ADD COLUMN for STORED generated columns.
-- We must recreate the table with the new columns included.
-- (Migration runner wraps this in a transaction already.)

-- Step 1: Create new table with generated columns included
CREATE TABLE gtfs_stop_times_new (
  trip_id TEXT,
  arrival_time TEXT CHECK (arrival_time LIKE '__:__:__'),
  departure_time TEXT CHECK (departure_time LIKE '__:__:__'),
  stop_id TEXT,
  stop_sequence INTEGER NOT NULL,
  stop_headsign TEXT,
  pickup_type INTEGER REFERENCES gtfs_pickup_dropoff_types(type_id),
  drop_off_type INTEGER,
  shape_dist_traveled REAL,
  arrival_time_seconds INTEGER
    GENERATED ALWAYS AS (
        CASE WHEN arrival_time IS NOT NULL THEN
            CAST(substr(arrival_time, 1, 2) AS INTEGER) * 3600
            + CAST(substr(arrival_time, 4, 2) AS INTEGER) * 60
            + CAST(substr(arrival_time, 7, 2) AS INTEGER)
        END
    ) STORED,
  departure_time_seconds INTEGER
    GENERATED ALWAYS AS (
        CASE WHEN departure_time IS NOT NULL THEN
            CAST(substr(departure_time, 1, 2) AS INTEGER) * 3600
            + CAST(substr(departure_time, 4, 2) AS INTEGER) * 60
            + CAST(substr(departure_time, 7, 2) AS INTEGER)
        END
    ) STORED
) strict;

-- Step 2: Copy data
INSERT INTO gtfs_stop_times_new (
    trip_id, arrival_time, departure_time, stop_id, stop_sequence,
    stop_headsign, pickup_type, drop_off_type, shape_dist_traveled
) SELECT
    trip_id, arrival_time, departure_time, stop_id, stop_sequence,
    stop_headsign, pickup_type, drop_off_type, shape_dist_traveled
FROM gtfs_stop_times;

-- Step 3: Drop old indexes (attached to old table), then recreate on new table
DROP INDEX IF EXISTS idx_gtfs_stop_times__trip_id__stop_sequence;
DROP INDEX IF EXISTS idx_gtfs_stop_times__stop_id__trip_id;
DROP INDEX IF EXISTS idx_gtfs_stop_times__trip_id__stop_id;

CREATE INDEX idx_gtfs_stop_times__trip_id__stop_sequence
    ON gtfs_stop_times_new(trip_id, stop_sequence);
CREATE INDEX idx_gtfs_stop_times__stop_id__trip_id
    ON gtfs_stop_times_new(stop_id, trip_id);
CREATE INDEX idx_gtfs_stop_times__trip_id__stop_id
    ON gtfs_stop_times_new(trip_id, stop_id);

-- Step 4: Swap tables
DROP TABLE gtfs_stop_times;
ALTER TABLE gtfs_stop_times_new RENAME TO gtfs_stop_times;

-- Feed-level metadata, recomputed once per feed cycle (not per request)
CREATE TABLE IF NOT EXISTS live_feed_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 0),
    base_midnight INTEGER NOT NULL
) strict;

-- Insert default row if not present (will be updated by feed listener)
INSERT OR IGNORE INTO live_feed_metadata (id, base_midnight) VALUES (0, 0);

-- Index for delay-propagation correlated subquery:
--   SELECT ... FROM live_trip_stop_times
--   WHERE trip_id = ? AND stop_sequence <= ? AND arrival_delay IS NOT NULL
--   ORDER BY stop_sequence DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_live_trip_stop_times__trip_id__stop_sequence__arrival_delay
    ON live_trip_stop_times(trip_id, stop_sequence, arrival_delay);
