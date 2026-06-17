import type { Map as MaplibreMap } from "maplibre-gl";

const STATION_RADIUS = 16;
const STATION_TEXT = 14;

const COLORS = {
  available: "#16a34a",
  availableRing: "#15803d",
  empty: "#9ca3af",
  emptyRing: "#6b7280",
} as const;

function drawStationIcon(count: number, fill: string, ring: string, pixelRatio: number): ImageData {
  const dpr = pixelRatio;
  const pad = 3 * dpr;
  const r = STATION_RADIUS * dpr;
  const size = (r + pad) * 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const cx = size / 2;
  const cy = size / 2;

  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 3 * dpr;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = ring;
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 ${STATION_TEXT * dpr}px IosevkAllyP, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 2 * dpr;
  ctx.fillText(String(count), cx, cy);

  return ctx.getImageData(0, 0, size, size);
}

export function stationIconName(count: number, isRenting: boolean): string {
  const color = count > 0 && isRenting ? "green" : "gray";
  return `gbfs-station-${color}-${count}`;
}

export type StationIconDescriptor = {
  count: number;
  isRenting: boolean;
};

export function ensureStationIcons(map: MaplibreMap, icons: StationIconDescriptor[]) {
  const pixelRatio = window.devicePixelRatio || 1;

  for (const icon of icons) {
    const name = stationIconName(icon.count, icon.isRenting);
    if (!map.hasImage(name)) {
      const [fill, ring] =
        icon.count > 0 && icon.isRenting
          ? [COLORS.available, COLORS.availableRing]
          : [COLORS.empty, COLORS.emptyRing];
      const imageData = drawStationIcon(icon.count, fill, ring, pixelRatio);
      map.addImage(name, imageData, { pixelRatio });
    }
  }
}
