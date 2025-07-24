CREATE TABLE IF NOT EXISTS live_vehicles (
  vehicle_id TEXT,
  route_id TEXT,
  trip_id TEXT,
  latitude REAL,
  longitude REAL
) strict;
CREATE INDEX IF NOT EXISTS idx_live_vehicles__vehicle_id ON live_vehicles(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_live_vehicles__trip_id ON live_vehicles(trip_id);
CREATE INDEX IF NOT EXISTS idx_live_vehicles__route_id ON live_vehicles(route_id);
CREATE TABLE IF NOT EXISTS live_trips (trip_id TEXT) strict;
CREATE INDEX IF NOT EXISTS idx_live_trips__trip_id ON live_trips(trip_id);