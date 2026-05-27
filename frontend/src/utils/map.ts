import { MapInstance } from "react-map-gl/maplibre";

export function calculateLatOffset(map: MapInstance | null | undefined) {
  const zoom = map?.getZoom() ?? 13;
  return 15 * Math.exp(-0.6 * zoom);
}
