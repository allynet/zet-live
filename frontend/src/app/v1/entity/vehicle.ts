import { Map as MaplibreglMap, Marker as MaplibreglMarker } from "maplibre-gl";

export class VehicleV1<
  TMapEntity extends MaplibreglMarker | undefined = MaplibreglMarker | undefined
> {
  id: number;
  routeId: number;
  tripId: string;
  lat: number;
  lng: number;
  mapEntity = undefined as TMapEntity;

  public constructor(data: {
    id: number;
    routeId: number;
    tripId: string;
    latitude: number;
    longitude: number;
  }) {
    this.id = data.id;
    this.routeId = data.routeId;
    this.tripId = data.tripId;
    this.lat = data.latitude;
    this.lng = data.longitude;
  }

  public static fromSimple(data: (string | number)[]) {
    if (data.length < 5) {
      throw new Error("Not enough data");
    }

    return new VehicleV1({
      id: Number(data[0]),
      routeId: Number(data[1]),
      tripId: String(data[2]),
      latitude: Number(data[3]),
      longitude: Number(data[4]),
    });
  }

  public toJSON() {
    return {
      id: this.id,
      routeId: this.routeId,
      tripId: this.tripId,
      latitude: this.lat,
      longitude: this.lng,
    };
  }

  public setMapEntity<TEntity extends MaplibreglMarker | undefined>(
    entity: TEntity
  ) {
    this.mapEntity = entity as never;
    return this as unknown as VehicleV1<TEntity>;
  }

  public updateMapEntity(
    map: MaplibreglMap,
    createMapMarkerElement: (vehicle: VehicleV1) => HTMLElement
  ) {
    let entity =
      this.mapEntity ??
      new MaplibreglMarker({
        element: createMapMarkerElement(this),
      });

    entity = entity.setLngLat(this).addTo(map);

    return this.setMapEntity(entity);
  }
}
