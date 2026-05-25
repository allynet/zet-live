DROP TABLE IF EXISTS live_vehicles;

CREATE TABLE IF NOT EXISTS live_vehicles (
  vehicle_id     TEXT PRIMARY KEY,
  route_id       TEXT,
  trip_id        TEXT,
  latitude       REAL,
  longitude      REAL,
  prev_latitude  REAL,
  prev_longitude REAL
) strict;

CREATE INDEX IF NOT EXISTS idx_live_vehicles__trip_id  ON live_vehicles(trip_id);
CREATE INDEX IF NOT EXISTS idx_live_vehicles__route_id ON live_vehicles(route_id);
