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
import {
  vehiclesSignal,
  followingVehicleIdSignal,
  followingStopIdsSignal,
  followingTripIdSignal,
  followingTripIdsSignal,
  deltaMoveLinesSignal,
  displayedStopsSignal,
  stopsGroupedSignal,
  simpleStopsSignal,
  selectedStopSignal,
  followingRouteSignal,
  bearingSignal,
  maxBoundsSignal,
} from "@/state";
import { VehicleMarker } from "./vehicle-marker";
import { fetchFollowingRoute, fetchStopTrips } from "@/hooks/use-stops";
import { useSignalState } from "@/hooks/use-signal-state";
import "maplibre-gl/dist/maplibre-gl.css";

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

  const handleVehicleClick = useCallback((vehicleId: string, tripId: string) => {
    followingVehicleIdSignal.value = vehicleId;
    followingTripIdSignal.value = tripId;
    followingTripIdsSignal.value = null;
    if (tripId) {
      void fetchFollowingRoute(tripId);
    }
  }, []);

  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const stopFeature = e.features?.find((x) => x.source === "route-stops");

    if (stopFeature) {
      const stopIds = JSON.parse(
        ((stopFeature.properties as Record<string, unknown>)?.ids as string) ?? "[]",
      ) as string[];

      followingStopIdsSignal.value = stopIds;
      followingVehicleIdSignal.value = null;
      followingRouteSignal.value = null;

      const simpleStops = simpleStopsSignal.value;
      const stopName = stopIds.map((id) => simpleStops[id]?.name).find(Boolean) ?? "Unknown stop";

      selectedStopSignal.value = { name: stopName, ids: stopIds, routes: [] };

      const stops = stopIds
        .map((id) => simpleStops[id])
        .filter(Boolean)
        .map((stop) => ({
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
          ids: [stop.id],
        }));
      displayedStopsSignal.value = stops;

      void fetchStopTrips(stopIds).then((tripIds) => {
        if (!tripIds) return;
        followingTripIdsSignal.value = new Set(tripIds);

        const vehicles = vehiclesSignal.value;
        const routes = new Set<string>();
        for (const v of vehicles.values()) {
          if (tripIds.includes(v.tripId)) {
            routes.add(v.routeId);
          }
        }
        const sorted = Array.from(routes).sort((a, b) => {
          const na = parseInt(a, 10);
          const nb = parseInt(b, 10);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.localeCompare(b);
        });
        selectedStopSignal.value = { name: stopName, ids: stopIds, routes: sorted };
      });
      return;
    }

    followingVehicleIdSignal.value = null;
    followingStopIdsSignal.value = [];
    followingTripIdsSignal.value = null;
    followingRouteSignal.value = null;
    selectedStopSignal.value = null;
    displayedStopsSignal.value = stopsGroupedSignal.value;
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
    if (map && maxBoundsSignal.value) {
      map.setMaxBounds(maxBoundsSignal.value);
    }
  }, []);

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

  return (
    <MapGL
      ref={mapRef}
      mapStyle={mapStyle3d as StyleSpecification}
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
      class="h-full w-full"
      style={{ "--bearing": bearing }}
    >
      <NavigationControl visualizeZoom visualizePitch />

      <GeolocateControl
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
                handleVehicleClick(v.getMapId(), v.tripId);
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

      <Source id="route-stops" type="geojson" data={routeStopsFeatures}>
        <Layer
          id="route-stops-label"
          type="symbol"
          layout={{
            "text-font": ["IosevkAlly Bold"],
            "text-field": ["get", "name"],
            "text-variable-anchor": ["top", "bottom", "left", "right"],
            "text-radial-offset": 0.5,
            "text-justify": "auto",
            "text-size": ["interpolate", ["linear"], ["zoom"], 0, 7, 10, 9, 12, 13, 22, 30],
          }}
          paint={{
            "text-color": "#000",
            "text-halo-color": "#fff",
            "text-halo-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 3, 18, 3, 22, 6],
            "text-halo-blur": ["interpolate", ["linear"], ["zoom"], 10, 0, 14, 2, 18, 2, 22, 3],
          }}
        />
      </Source>

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
  );
}
