CREATE TABLE IF NOT EXISTS live_trip_stop_times (
    trip_id        TEXT NOT NULL,
    stop_id        TEXT NOT NULL,
    stop_sequence  INTEGER NOT NULL,
    arrival_time   INTEGER,
    arrival_delay  INTEGER,
    PRIMARY KEY (trip_id, stop_sequence)
) strict;
