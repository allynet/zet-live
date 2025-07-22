import { Map as MaplibreglMap, Marker as MaplibreglMarker } from "maplibre-gl";

export class VehicleV1<
  TMapEntity extends MaplibreglMarker | undefined = MaplibreglMarker | undefined
> {
  id: string;
  routeId: string;
  tripId: string;
  lat: number;
  lng: number;
  moveAngle?: number;
  mapEntity = undefined as TMapEntity;

  public constructor(data: {
    id: string;
    routeId: string;
    tripId: string;
    latitude: number;
    longitude: number;
    moveAngle?: number;
  }) {
    this.id = data.id;
    this.routeId = data.routeId;
    this.tripId = data.tripId;
    this.lat = data.latitude;
    this.lng = data.longitude;
    this.moveAngle = data.moveAngle;
  }

  public static fromSimple(data: (string | number)[]) {
    if (data.length < 5) {
      throw new Error("Not enough data");
    }

    return new VehicleV1({
      id: String(data[0]),
      routeId: String(data[1]),
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
      moveAngle: this.moveAngle,
    };
  }

  public getMapId() {
    return `vehicle-${this.id}`;
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
    {
      const prevLoc = this.mapEntity?.getLngLat();
      if (prevLoc) {
        const hasMoved =
          Math.abs(this.lat - prevLoc.lat) > 0 ||
          Math.abs(this.lng - prevLoc.lng) > 0;

        if (hasMoved) {
          this.moveAngle = Math.atan2(
            this.lat - prevLoc.lat,
            this.lng - prevLoc.lng
          );
        }
      }
    }

    let entity =
      this.mapEntity ??
      new MaplibreglMarker({
        element: createMapMarkerElement(this),
      });

    entity = entity.setLngLat(this).addTo(map);

    if (this.moveAngle) {
      entity
        .getElement()
        .style.setProperty("--move-angle", this.moveAngle.toString());
    } else {
      entity.getElement().style.removeProperty("--move-angle");
    }

    return this.setMapEntity(entity);
  }
}
