import { MapInstance } from "react-map-gl/maplibre";

export function calculateLatOffset(map: MapInstance | null | undefined) {
  let zoom = map?.getZoom() ?? 13;
  return 15 * Math.exp(-0.6 * zoom);
}
