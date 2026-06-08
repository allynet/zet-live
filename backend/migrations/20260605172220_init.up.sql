-- Add up migration script here
CREATE TABLE gtfs_schedule_meta (
  etag TEXT,
  last_modified REAL,
  fetched_at REAL default (unixepoch('subsec'))
) strict;
CREATE INDEX idx_gtfs_schedule_meta__etag on gtfs_schedule_meta(etag);
CREATE INDEX idx_gtfs_schedule_meta__last_modified on gtfs_schedule_meta(last_modified);


CREATE TABLE gtfs_agency (
  agency_id TEXT PRIMARY KEY,
  agency_name TEXT NOT NULL,
  agency_url TEXT NOT NULL,
  agency_timezone TEXT NOT NULL,
  agency_lang TEXT, -- unofficial features
  agency_phone TEXT,
  fare_url TEXT
) strict;


CREATE TABLE gtfs_location_types (
  location_type INTEGER PRIMARY KEY,
  description TEXT
) strict;


CREATE TABLE gtfs_stops (
  stop_id TEXT PRIMARY KEY,
  stop_code TEXT,
  stop_name TEXT,
  tts_stop_name TEXT,
  latitude REAL,
  longitude REAL,
  zone_id TEXT,
  stop_url TEXT,
  location_type INTEGER,
  parent_station TEXT,
  stop_timezone TEXT,
  wheelchair_boarding INTEGER,
  level_id TEXT,
  platform_code TEXT
  -- FOREIGN KEY (location_type) REFERENCES gtfs_location_types(location_type) -- FOREIGN KEY (parent_station) REFERENCES gtfs_stops(stop_id)
) strict;


CREATE TABLE gtfs_route_types (
  route_type INTEGER PRIMARY KEY,
  description TEXT
) strict;


CREATE TABLE gtfs_routes (
  route_id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT, -- REFERENCES gtfs_agency(agency_id),
  route_short_name TEXT DEFAULT '',
  route_long_name TEXT DEFAULT '',
  route_desc TEXT,
  route_type INTEGER, -- REFERENCES gtfs_route_types(route_type),
  route_url TEXT,
  route_color TEXT,
  route_text_color TEXT
) strict;


CREATE TABLE gtfs_directions (
  direction_id INTEGER PRIMARY KEY,
  description TEXT
) strict;


CREATE TABLE gtfs_pickup_dropoff_types (type_id INTEGER PRIMARY KEY, description TEXT) strict;


CREATE TABLE gtfs_calendar (
  service_id TEXT PRIMARY KEY,
  monday INTEGER NOT NULL,
  tuesday INTEGER NOT NULL,
  wednesday INTEGER NOT NULL,
  thursday INTEGER NOT NULL,
  friday INTEGER NOT NULL,
  saturday INTEGER NOT NULL,
  sunday INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
) strict;

CREATE TABLE gtfs_calendar_dates (
  service_id TEXT, --REFERENCES gtfs_calendar(service_id),
  date TEXT NOT NULL,
  exception_type INTEGER NOT NULL
  -- above reference not in makeindices.sql
) strict;

CREATE TABLE service_combo_ids (combination_id INTEGER primary key) strict;

CREATE TABLE service_combinations (
  combination_id INTEGER, --references service_combo_ids(combination_id),
  service_id TEXT --references gtfs_calendar(service_id)
) strict;

CREATE TABLE gtfs_payment_methods (
  payment_method INTEGER PRIMARY KEY,
  description TEXT
) strict;

CREATE TABLE gtfs_fare_attributes (
  fare_id TEXT PRIMARY KEY,
  price REAL NOT NULL,
  currency_type TEXT NOT NULL,
  payment_method INTEGER, --REFERENCES gtfs_payment_methods,
  transfers INTEGER,
  transfer_duration INTEGER,
  agency_id TEXT --REFERENCES gtfs_agency(agency_id),
) strict;

CREATE TABLE gtfs_fare_rules (
  fare_id TEXT, --REFERENCES gtfs_fare_attributes(fare_id),
  route_id TEXT, --REFERENCES gtfs_routes(route_id),
  origin_id INTEGER,
  destination_id INTEGER,
  contains_id INTEGER, -- unofficial features
  service_id TEXT -- REFERENCES gtfs_calendar(service_id) ?
) strict;

CREATE TABLE gtfs_shapes (
  shape_id TEXT NOT NULL,
  shape_pt_lat REAL NOT NULL,
  shape_pt_lon REAL NOT NULL,
  shape_pt_sequence INTEGER NOT NULL,
  shape_dist_traveled REAL
) strict;
CREATE INDEX idx_gtfs_shapes__shape_id__shape_pt_sequence ON gtfs_shapes(shape_id, shape_pt_sequence);

CREATE TABLE gtfs_trips (
  trip_id TEXT PRIMARY KEY,
  route_id TEXT, -- REFERENCES gtfs_routes(route_id),
  service_id TEXT, -- REFERENCES gtfs_calendar(service_id),
  trip_headsign TEXT,
  trip_short_name TEXT,
  direction_id INTEGER, -- REFERENCES gtfs_directions(direction_id),
  block_id TEXT,
  shape_id TEXT,
  wheelchair_boarding INTEGER,
  bikes_allowed INTEGER
) strict;
CREATE INDEX idx_gtfs_trips__route_service ON gtfs_trips(route_id, service_id);
CREATE INDEX idx_gtfs_trips__trip_id ON gtfs_trips(trip_id);


CREATE TABLE gtfs_frequencies (
  trip_id TEXT,
  -- REFERENCES gtfs_trips(trip_id),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  headway_secs INTEGER NOT NULL,
  start_time_seconds INTEGER,
  end_time_seconds INTEGER
) strict;


CREATE TABLE gtfs_transfer_types (
  transfer_type INTEGER PRIMARY KEY,
  description TEXT
) strict;


CREATE TABLE gtfs_transfers (
  from_stop_id TEXT, --REFERENCES gtfs_stops(stop_id)
  to_stop_id TEXT, --REFERENCES gtfs_stops(stop_id)
  transfer_type INTEGER, --REFERENCES gtfs_transfer_types(transfer_type)
  min_transfer_time INTEGER,
  from_route_id TEXT, --REFERENCES gtfs_routes(route_id)
  to_route_id TEXT, --REFERENCES gtfs_routes(route_id)
  service_id TEXT --REFERENCES gtfs_calendar(service_id) ?
) strict;


CREATE TABLE gtfs_feed_info (
  feed_publisher_name TEXT,
  feed_publisher_url TEXT,
  feed_timezone TEXT,
  feed_lang TEXT,
  feed_version TEXT
) strict;


CREATE TABLE live_trips (trip_id TEXT NOT NULL) strict;
CREATE INDEX idx_live_trips__trip_id ON live_trips(trip_id);


CREATE TABLE live_trip_stop_times (
    trip_id        TEXT NOT NULL,
    stop_id        TEXT NOT NULL,
    stop_sequence  INTEGER NOT NULL,
    arrival_time   INTEGER,
    arrival_delay  INTEGER,
    PRIMARY KEY (trip_id, stop_sequence)
) strict;
CREATE INDEX idx_live_trip_stop_times__trip_id__stop_sequence__arrival_delay
    ON live_trip_stop_times(trip_id, stop_sequence, arrival_delay);


CREATE TABLE live_feed_metadata (
    id INTEGER PRIMARY KEY,
    base_midnight INTEGER NOT NULL
) strict;
INSERT INTO live_feed_metadata (id, base_midnight) VALUES (0, 0);


CREATE TABLE live_vehicles (
  vehicle_id     TEXT PRIMARY KEY,
  route_id       TEXT NOT NULL,
  trip_id        TEXT NOT NULL,
  latitude       REAL NOT NULL,
  longitude      REAL NOT NULL,
  prev_latitude  REAL,
  prev_longitude REAL,
  next_stop_id TEXT,
  next_stop_sequence INTEGER CHECK (next_stop_sequence IS NULL OR next_stop_sequence >= 0),
  next_stop_arrival_delay INTEGER,
  next_stop_arrival_time INTEGER,
  bearing REAL,
  route_long_name TEXT,
  trip_headsign TEXT
) strict;
CREATE INDEX idx_live_vehicles__trip_id  ON live_vehicles(trip_id);
CREATE INDEX idx_live_vehicles__route_id ON live_vehicles(route_id);


CREATE TABLE "gtfs_stop_times" (
  trip_id TEXT NOT NULL,
  arrival_time TEXT CHECK (arrival_time LIKE '__:__:__'),
  departure_time TEXT CHECK (departure_time LIKE '__:__:__'),
  stop_id TEXT NOT NULL,
  stop_sequence INTEGER NOT NULL,
  stop_headsign TEXT,
  pickup_type INTEGER, -- REFERENCES gtfs_pickup_dropoff_types(type_id),
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
CREATE INDEX idx_gtfs_stop_times__trip_id__stop_sequence
    ON "gtfs_stop_times"(trip_id, stop_sequence);
CREATE INDEX idx_gtfs_stop_times__stop_id__trip_id
    ON "gtfs_stop_times"(stop_id, trip_id);
CREATE INDEX idx_gtfs_stop_times__trip_id__stop_id
    ON "gtfs_stop_times"(trip_id, stop_id);

