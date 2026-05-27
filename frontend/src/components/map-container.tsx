import MapGL, {
  Marker,
  NavigationControl,
  GeolocateControl,
  Source,
  Layer,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import { useRef, useCallback, useEffect } from "preact/hooks";
import type { StyleSpecification } from "maplibre-gl";
import mapStyle3d from "@/data/maps/style/3d.json";
import mapStyle3dDark from "@/data/maps/style/3d.dark.json";
import mapStyleFlat from "@/data/maps/style/flat.json";
import mapStyleSatellite from "@/data/maps/style/satellite.json";
import {
  vehiclesSignal,
  followingVehicleIdSignal,
  followEnabledSignal,
  followingTripIdsSignal,
  deltaMoveLinesSignal,
  displayedStopsSignal,
  followingRouteSignal,
  bearingSignal,
  maxBoundsSignal,
  flyToTargetSignal,
  mapStyleIdSignal,
  type MapStyleId,
} from "@/state";
import { selectVehicle, selectStop, clearSelection } from "@/state-actions";
import { VehicleMarker } from "./vehicle-marker";
import { MapStyleSwitcher } from "./map-style-switcher";
import { useSignalState } from "@/hooks/use-signal-state";
import { useGeolocationPermission } from "@/hooks/use-geolocation-permission";
import "maplibre-gl/dist/maplibre-gl.css";
import { calculateLatOffset } from "@/utils/map";

const styleMap = new Map<MapStyleId, StyleSpecification>([
  ["3d", mapStyle3d as StyleSpecification],
  ["3d.dark", mapStyle3dDark as StyleSpecification],
  ["flat", mapStyleFlat as StyleSpecification],
  ["satellite", mapStyleSatellite as StyleSpecification],
]);

const mapStyle = styleMap.get(mapStyleIdSignal.value) ?? (mapStyle3d as StyleSpecification);

function createArrowHeadImage(color: string): Promise<HTMLImageElement> {
  const svg = `
    <svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
      <path d="M 10,10 L 40,25 L 10,40 Z" fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const img = new Image(50, 50);
  img.src = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    img.addEventListener("load", () => {
      resolve(img);
    });
  });
}

export function MapContainer() {
  const mapRef = useRef<MapRef>(null);
  const vehicles = useSignalState(vehiclesSignal);
  const followingVehicleId = useSignalState(followingVehicleIdSignal);
  const followingTripIds = useSignalState(followingTripIdsSignal);
  const deltaMoveLines = useSignalState(deltaMoveLinesSignal);
  const displayedStops = useSignalState(displayedStopsSignal);
  const followingRoute = useSignalState(followingRouteSignal);
  const bearing = useSignalState(bearingSignal);
  const flyToTarget = useSignalState(flyToTargetSignal);
  const followEnabled = useSignalState(followEnabledSignal);
  const geolocPermission = useGeolocationPermission();
  const maxBounds = useSignalState(maxBoundsSignal);

  const selectedVehicle = followingVehicleId ? (vehicles.get(followingVehicleId) ?? null) : null;
  const nextStopId = selectedVehicle?.nextStopId ?? null;

  const handleVehicleClick = useCallback((rawVehicleId: string, tripId: string) => {
    selectVehicle(rawVehicleId, tripId, true);
  }, []);

  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const stopFeature = e.features?.find((x) => x.source === "route-stops");

    if (stopFeature) {
      const stopIds = JSON.parse(
        ((stopFeature.properties as Record<string, unknown>)?.ids as string) ?? "[]",
      ) as string[];
      selectStop(stopIds);
      return;
    }

    clearSelection();
  }, []);

  const onLoad = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const arrowImage = await createArrowHeadImage("#00000077");
    if (!map.hasImage("arrow-head")) {
      map.addImage("arrow-head", arrowImage);
    }
  }, []);

  const onRotate = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      bearingSignal.value = map.getBearing();
    }
  }, []);

  const onDragStart = useCallback(() => {
    if (followEnabledSignal.value) {
      followEnabledSignal.value = false;
    }
  }, []);

  useEffect(() => {
    if (!followEnabled || !followingVehicleId) return;
    const vehicle = vehicles.get(followingVehicleId);
    if (!vehicle) return;

    const map = mapRef.current?.getMap();
    if (!map) return;

    const offset = calculateLatOffset(mapRef.current?.getMap());

    map.easeTo({
      center: [vehicle.lng, vehicle.lat - offset],
      duration: 500,
    });
  }, [followEnabled, followingVehicleId, vehicles]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) {
      return;
    }

    map.on("mouseenter", "route-stops-label", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "route-stops-label", () => {
      map.getCanvas().style.cursor = "";
    });
  }, []);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      map.setMaxBounds(maxBounds);
    }
  }, [maxBounds]);

  useEffect(() => {
    if (!flyToTarget) return;
    const offset = calculateLatOffset(mapRef.current?.getMap());
    mapRef.current?.flyTo({
      center: [flyToTarget.longitude, flyToTarget.latitude - offset],
      duration: 1000,
      // zoom: 16,
    });
    flyToTargetSignal.value = null;
  }, [flyToTarget]);

  const deltaMoveFeatures = {
    type: "FeatureCollection" as const,
    features: deltaMoveLines.map((x) => ({
      type: "Feature" as const,
      properties: { color: x.color },
      geometry: {
        type: "LineString" as const,
        coordinates: [x.from, x.to],
      },
    })),
  };

  const routeStopsFeatures = {
    type: "FeatureCollection" as const,
    features: displayedStops.map((stop) => ({
      type: "Feature" as const,
      properties: {
        name: stop.name,
        ids: JSON.stringify(stop.ids),
        isNext: nextStopId !== null && stop.ids.includes(nextStopId),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [stop.lng, stop.lat],
      },
    })),
  };

  const followingRouteFeatures = followingRoute
    ? {
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            properties: { color: "#f0f" },
            geometry: {
              type: "LineString" as const,
              coordinates: followingRoute,
            },
          },
        ],
      }
    : {
        type: "FeatureCollection" as const,
        features: [],
      };

  const isFollowingSomething =
    followingVehicleId !== null || followingTripIds !== null || followingRoute !== null;

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.setLayoutProperty("route-stops-label", "text-allow-overlap", isFollowingSomething);
    map.setLayoutProperty("route-stops-label", "text-ignore-placement", isFollowingSomething);
  }, [isFollowingSomething]);

  return (
    <div class="relative h-full w-full">
      <MapGL
        ref={mapRef}
        mapStyle={mapStyle}
        initialViewState={{
          longitude: 16,
          latitude: 45.8,
          zoom: 12,
        }}
        hash
        antialias
        interactiveLayerIds={["route-stops-label"]}
        onClick={handleClick}
        onLoad={onLoad}
        onRotate={onRotate}
        onDragStart={onDragStart}
        class="h-full w-full"
        style={{ "--bearing": bearing }}
      >
        <NavigationControl visualizeZoom visualizePitch />

        <GeolocateControl
          key={
            geolocPermission === "granted"
              ? "geo-granted"
              : geolocPermission === "denied"
                ? "geo-denied"
                : "geo-other"
          }
          positionOptions={{ enableHighAccuracy: true }}
          trackUserLocation
          showAccuracyCircle
          showUserLocation
        />

        {Array.from(vehicles.values()).map((v) => {
          const isFollowing =
            followingVehicleId === v.getMapId() || (followingTripIds?.has(v.tripId) ?? false);

          const hasFollowing = followingVehicleId !== null || followingTripIds !== null;

          return (
            <Marker key={v.getMapId()} longitude={v.lng} latitude={v.lat}>
              <VehicleMarker
                vehicle={v}
                isFollowing={isFollowing}
                isNotFollowing={hasFollowing && !isFollowing}
                onClick={() => {
                  handleVehicleClick(v.id, v.tripId);
                }}
              />
            </Marker>
          );
        })}

        <Source id="delta-move-lines" type="geojson" data={deltaMoveFeatures}>
          <Layer
            id="delta-move-lines"
            type="line"
            paint={{
              "line-width": 5,
              "line-color": ["get", "color"],
              "line-opacity": 0.5,
            }}
            layout={{
              "line-join": "round",
              "line-cap": "round",
            }}
          />
          <Layer
            id="delta-move-lines-arrow"
            type="symbol"
            layout={{
              "symbol-placement": "line",
              "symbol-avoid-edges": false,
              "symbol-spacing": 1,
              "icon-image": "arrow-head",
              "text-ignore-placement": true,
              "icon-size": 0.25,
              visibility: "visible",
            }}
          />
        </Source>

        <Source id="route-stops" type="geojson" data={routeStopsFeatures} />

        <Source id="current-following-route" type="geojson" data={followingRouteFeatures}>
          <Layer
            id="current-following-route"
            type="line"
            paint={{
              "line-width": 5,
              "line-color": ["get", "color"],
              "line-opacity": 0.5,
            }}
            layout={{
              "line-join": "round",
              "line-cap": "round",
            }}
          />
          <Layer
            id="current-following-route-arrow"
            type="symbol"
            layout={{
              "symbol-placement": "line",
              "symbol-spacing": 1,
              "icon-allow-overlap": true,
              "icon-image": "arrow-head",
              "icon-size": 0.25,
              visibility: "visible",
            }}
          />
        </Source>
      </MapGL>
      <MapStyleSwitcher />
    </div>
  );
}
