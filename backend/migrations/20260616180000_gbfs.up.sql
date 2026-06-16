-- GBFS (General Bikeshare Feed Specification) feed data for nextbike_hd (Bajs Zagreb).
-- @see https://gbfs.org/documentation/gbfs/v2.3

CREATE TABLE gbfs_system_information (
  system_id          TEXT PRIMARY KEY,
  name               TEXT,
  operator           TEXT,
  url                TEXT,
  phone_number       TEXT,
  email              TEXT,
  feed_contact_email TEXT,
  timezone           TEXT,
  language           TEXT,
  license_id         TEXT,
  rental_apps        TEXT -- JSON
) strict;


CREATE TABLE gbfs_vehicle_types (
  vehicle_type_id  TEXT PRIMARY KEY,
  name             TEXT,
  form_factor      TEXT,
  propulsion_type  TEXT,
  rider_capacity   INTEGER,
  vehicle_image    TEXT,
  description      TEXT
) strict;


CREATE TABLE gbfs_stations (
  station_id          TEXT PRIMARY KEY,
  name                TEXT,
  short_name          TEXT,
  lat                 REAL NOT NULL,
  lon                 REAL NOT NULL,
  region_id           TEXT,
  capacity            INTEGER,
  is_virtual_station  INTEGER,
  rental_uris         TEXT -- JSON
) strict;
CREATE INDEX idx_gbfs_stations__region_id ON gbfs_stations(region_id);


CREATE TABLE gbfs_station_status (
  station_id              TEXT PRIMARY KEY,
  num_bikes_available     INTEGER,
  num_docks_available     INTEGER,
  is_installed            INTEGER,
  is_renting              INTEGER,
  is_returning            INTEGER,
  last_reported           INTEGER,
  vehicle_types_available TEXT -- JSON
) strict;


CREATE TABLE gbfs_free_bikes (
  bike_id          TEXT PRIMARY KEY,
  lat              REAL,
  lon              REAL,
  is_reserved      INTEGER,
  is_disabled      INTEGER,
  vehicle_type_id  TEXT,
  station_id       TEXT,
  pricing_plan_id  TEXT,
  rental_uris      TEXT -- JSON
) strict;
CREATE INDEX idx_gbfs_free_bikes__station_id      ON gbfs_free_bikes(station_id);
CREATE INDEX idx_gbfs_free_bikes__vehicle_type_id ON gbfs_free_bikes(vehicle_type_id);


CREATE TABLE gbfs_regions (
  region_id TEXT PRIMARY KEY,
  name      TEXT
) strict;


CREATE TABLE gbfs_pricing_plans (
  plan_id          TEXT PRIMARY KEY,
  name             TEXT,
  currency         TEXT,
  price            REAL,
  is_taxable       INTEGER,
  description      TEXT,
  per_min_pricing  TEXT -- JSON
) strict;


CREATE TABLE gbfs_rental_hours (
  id          INTEGER PRIMARY KEY,
  user_types  TEXT, -- JSON
  days        TEXT, -- JSON
  start_time  TEXT,
  end_time    TEXT
) strict;
