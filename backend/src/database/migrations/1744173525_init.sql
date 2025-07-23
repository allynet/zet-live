PRAGMA defer_foreign_keys = ON;
CREATE TABLE IF NOT EXISTS gtfs_schedule_meta (
  etag TEXT,
  last_modified REAL,
  fetched_at REAL default (unixepoch('subsec'))
) strict;
CREATE INDEX IF NOT EXISTS idx_gtfs_schedule_meta__etag on gtfs_schedule_meta(etag);
CREATE INDEX IF NOT EXISTS idx_gtfs_schedule_meta__last_modified on gtfs_schedule_meta(last_modified);
CREATE TABLE IF NOT EXISTS gtfs_agency (
  agency_id TEXT PRIMARY KEY,
  agency_name TEXT NOT NULL,
  agency_url TEXT NOT NULL,
  agency_timezone TEXT NOT NULL,
  agency_lang TEXT -- unofficial features
,
  agency_phone TEXT,
  fare_url TEXT
) strict;
--unoffical table, related to gtfs_stops(location_type)
CREATE TABLE IF NOT EXISTS gtfs_location_types (
  location_type INTEGER PRIMARY KEY,
  description TEXT
) strict;
insert into gtfs_location_types(location_type, description)
values (0, 'stop') on conflict do nothing;
insert into gtfs_location_types(location_type, description)
values (1, 'station') on conflict do nothing;
insert into gtfs_location_types(location_type, description)
values (2, 'station entrance') on conflict do nothing;
CREATE TABLE IF NOT EXISTS gtfs_stops (
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
  platform_code TEXT,
  FOREIGN KEY (location_type) REFERENCES gtfs_location_types(location_type) -- FOREIGN KEY (parent_station) REFERENCES gtfs_stops(stop_id)
) strict;
-- select AddGeometryColumn( 'gtfs_stops', 'location', #{WGS84_LATLONG_EPSG}, 'POINT', 2 );
-- CREATE INDEX IF NOT EXISTS gtfs_stops_location_ix ON gtfs_stops USING GIST ( location GIST_GEOMETRY_OPS );
CREATE TABLE IF NOT EXISTS gtfs_route_types (
  route_type INTEGER PRIMARY KEY,
  description TEXT
) strict;
insert into gtfs_route_types (route_type, description)
values (0, 'Street Level Rail') on conflict do nothing;
insert into gtfs_route_types (route_type, description)
values (1, 'Underground Rail') on conflict do nothing;
insert into gtfs_route_types (route_type, description)
values (2, 'Intercity Rail') on conflict do nothing;
insert into gtfs_route_types (route_type, description)
values (3, 'Bus') on conflict do nothing;
insert into gtfs_route_types (route_type, description)
values (4, 'Ferry') on conflict do nothing;
insert into gtfs_route_types (route_type, description)
values (5, 'Cable Car') on conflict do nothing;
insert into gtfs_route_types (route_type, description)
values (6, 'Suspended Car') on conflict do nothing;
insert into gtfs_route_types (route_type, description)
values (7, 'Steep Incline Mode') on conflict do nothing;
CREATE TABLE IF NOT EXISTS gtfs_routes (
  route_id TEXT PRIMARY KEY NOT NULL,
  --PRIMARY KEY,
  agency_id TEXT,
  --REFERENCES gtfs_agency(agency_id),
  route_short_name TEXT DEFAULT '',
  route_long_name TEXT DEFAULT '',
  route_desc TEXT,
  route_type INTEGER REFERENCES gtfs_route_types(route_type),
  route_url TEXT,
  route_color TEXT,
  route_text_color TEXT
) strict;
CREATE TABLE IF NOT EXISTS gtfs_directions (
  direction_id INTEGER PRIMARY KEY,
  description TEXT
) strict;
CREATE TABLE IF NOT EXISTS gtfs_pickup_dropoff_types (type_id INTEGER PRIMARY KEY, description TEXT) strict;
insert into gtfs_pickup_dropoff_types (type_id, description)
values (0, 'Regularly Scheduled') on conflict do nothing;
insert into gtfs_pickup_dropoff_types (type_id, description)
values (1, 'Not available') on conflict do nothing;
insert into gtfs_pickup_dropoff_types (type_id, description)
values (2, 'Phone arrangement only') on conflict do nothing;
insert into gtfs_pickup_dropoff_types (type_id, description)
values (3, 'Driver arrangement only') on conflict do nothing;
-- CREATE INDEX IF NOT EXISTS gst_trip_id_stop_sequence ON gtfs_stop_times (trip_id, stop_sequence);
CREATE TABLE IF NOT EXISTS gtfs_calendar (
  service_id TEXT PRIMARY KEY,
  --PRIMARY KEY,
  monday INTEGER NOT NULL,
  --NOT NULL,
  tuesday INTEGER NOT NULL,
  --NOT NULL,
  wednesday INTEGER NOT NULL,
  --NOT NULL,
  thursday INTEGER NOT NULL,
  --NOT NULL,
  friday INTEGER NOT NULL,
  --NOT NULL,
  saturday INTEGER NOT NULL,
  --NOT NULL,
  sunday INTEGER NOT NULL,
  --NOT NULL,
  start_date TEXT NOT NULL,
  --NOT NULL,
  end_date TEXT NOT NULL --NOT NULL
) strict;
CREATE TABLE IF NOT EXISTS gtfs_calendar_dates (
  service_id TEXT,
  --REFERENCES gtfs_calendar(service_id),
  date TEXT NOT NULL,
  --NOT NULL,
  exception_type INTEGER NOT NULL --NOT NULL
  -- above reference not in makeindices.sql
) strict;
-- The following two tables are not in the spec, but they make dealing with dates and services easier
CREATE TABLE IF NOT EXISTS service_combo_ids (combination_id INTEGER primary key) strict;
CREATE TABLE IF NOT EXISTS service_combinations (
  combination_id INTEGER,
  --references service_combo_ids(combination_id),
  service_id TEXT --references gtfs_calendar(service_id)
) strict;
CREATE TABLE IF NOT EXISTS gtfs_payment_methods (
  payment_method INTEGER PRIMARY KEY,
  description TEXT
) strict;
insert into gtfs_payment_methods (payment_method, description)
values (0, 'On Board') on conflict do nothing;
insert into gtfs_payment_methods (payment_method, description)
values (1, 'Prepay') on conflict do nothing;
CREATE TABLE IF NOT EXISTS gtfs_fare_attributes (
  fare_id TEXT PRIMARY KEY,
  --PRIMARY KEY,
  price REAL NOT NULL,
  --NOT NULL,
  currency_type TEXT NOT NULL,
  --NOT NULL,
  payment_method INTEGER,
  --REFERENCES gtfs_payment_methods,
  transfers INTEGER,
  transfer_duration INTEGER,
  agency_id TEXT --REFERENCES gtfs_agency(agency_id),
) strict;
CREATE TABLE IF NOT EXISTS gtfs_fare_rules (
  fare_id TEXT,
  --REFERENCES gtfs_fare_attributes(fare_id),
  route_id TEXT,
  --REFERENCES gtfs_routes(route_id),
  origin_id INTEGER,
  destination_id INTEGER,
  contains_id INTEGER -- unofficial features
,
  service_id TEXT -- REFERENCES gtfs_calendar(service_id) ?
) strict;
CREATE TABLE IF NOT EXISTS gtfs_shapes (
  shape_id TEXT NOT NULL,
  --NOT NULL,
  shape_pt_lat REAL NOT NULL,
  --NOT NULL,
  shape_pt_lon REAL NOT NULL,
  --NOT NULL,
  shape_pt_sequence INTEGER NOT NULL,
  --NOT NULL,
  shape_dist_traveled REAL
) strict;
CREATE TABLE IF NOT EXISTS gtfs_trips (
  trip_id TEXT PRIMARY KEY,
  route_id INTEGER,
  --REFERENCES gtfs_routes(route_id),
  service_id TEXT,
  --REFERENCES gtfs_calendar(service_id),
  trip_headsign TEXT,
  trip_short_name TEXT,
  direction_id INTEGER,
  --REFERENCES gtfs_directions(direction_id),
  block_id TEXT,
  shape_id TEXT,
  wheelchair_boarding INTEGER,
  bikes_allowed INTEGER
) strict;
CREATE INDEX IF NOT EXISTS idx_gtfs_trips__route_service ON gtfs_trips(route_id, service_id);
CREATE INDEX IF NOT EXISTS idx_gtfs_trips__trip_id ON gtfs_trips(trip_id);
CREATE TABLE IF NOT EXISTS gtfs_stop_times (
  trip_id TEXT,
  --REFERENCES gtfs_trips(trip_id),
  arrival_time TEXT CHECK (arrival_time LIKE '__:__:__'),
  departure_time TEXT CHECK (departure_time LIKE '__:__:__'),
  stop_id TEXT,
  --REFERENCES gtfs_stops(stop_id),
  stop_sequence INTEGER NOT NULL,
  stop_headsign TEXT,
  pickup_type INTEGER REFERENCES gtfs_pickup_dropoff_types(type_id),
  drop_off_type INTEGER,
  --REFERENCES gtfs_pickup_dropoff_types(type_id),
  shape_dist_traveled REAL
) strict;
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times__trip_id__stop_sequence on gtfs_stop_times(trip_id, stop_sequence);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times__stop_id__trip_id on gtfs_stop_times(stop_id, trip_id);
CREATE INDEX IF NOT EXISTS idx_gtfs_stop_times__trip_id__stop_id on gtfs_stop_times(trip_id, stop_id);
-- select AddGeometryColumn( 'gtfs_shapes', 'shape', #{WGS84_LATLONG_EPSG}, 'LINESTRING', 2 );
CREATE TABLE IF NOT EXISTS gtfs_frequencies (
  trip_id TEXT,
  --REFERENCES gtfs_trips(trip_id),
  start_time TEXT NOT NULL,
  --NOT NULL,
  end_time TEXT NOT NULL,
  --NOT NULL,
  headway_secs INTEGER NOT NULL,
  --NOT NULL
  start_time_seconds INTEGER,
  end_time_seconds INTEGER
) strict;
-- unofficial tables
CREATE TABLE IF NOT EXISTS gtfs_transfer_types (
  transfer_type INTEGER PRIMARY KEY,
  description TEXT
) strict;
insert into gtfs_transfer_types (transfer_type, description)
values (0, 'Preferred transfer point') on conflict do nothing;
insert into gtfs_transfer_types (transfer_type, description)
values (1, 'Designated transfer point') on conflict do nothing;
insert into gtfs_transfer_types (transfer_type, description)
values (
    2,
    'Transfer possible with min_transfer_time window'
  ) on conflict do nothing;
insert into gtfs_transfer_types (transfer_type, description)
values (3, 'Transfers forbidden') on conflict do nothing;
CREATE TABLE IF NOT EXISTS gtfs_transfers (
  from_stop_id TEXT,
  --REFERENCES gtfs_stops(stop_id)
  to_stop_id TEXT,
  --REFERENCES gtfs_stops(stop_id)
  transfer_type INTEGER,
  --REFERENCES gtfs_transfer_types(transfer_type)
  min_transfer_time INTEGER,
  from_route_id TEXT,
  --REFERENCES gtfs_routes(route_id)
  to_route_id TEXT,
  --REFERENCES gtfs_routes(route_id)
  service_id TEXT --REFERENCES gtfs_calendar(service_id) ?
) strict;
CREATE TABLE IF NOT EXISTS gtfs_feed_info (
  feed_publisher_name TEXT,
  feed_publisher_url TEXT,
  feed_timezone TEXT,
  feed_lang TEXT,
  feed_version TEXT
) strict;
