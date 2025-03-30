import { Map as MaplibreglMap, Marker as MaplibreglMarker } from "maplibre-gl";

export class StopV1<
  TMapEntity extends MaplibreglMarker | undefined = MaplibreglMarker | undefined
> {
  id: string;
  name: string;
  lat: number;
  lng: number;
  mapEntity = undefined as TMapEntity;

  public constructor(data: {
    id: string;
    name: string;
    lat: number;
    lng: number;
  }) {
    this.id = data.id;
    this.name = data.name;
    this.lat = data.lat;
    this.lng = data.lng;
  }

  public static fromSimple(data: (string | number)[]) {
    if (data.length < 4) {
      throw new Error("Not enough data");
    }

    return new StopV1({
      id: String(data[0]),
      name: String(data[1]),
      lat: Number(data[2]),
      lng: Number(data[3]),
    });
  }

  public toJSON() {
    return {
      id: this.id,
      name: this.name,
      latitude: this.lat,
      longitude: this.lng,
    };
  }

  public distanceFrom(other: Pick<StopV1, "lat" | "lng">): number {
    return Math.sqrt(
      Math.pow(this.lat - other.lat, 2) + Math.pow(this.lng - other.lng, 2)
    );
  }

  public getMapId() {
    return `stop-${this.id}`;
  }

  public setMapEntity<TEntity extends MaplibreglMarker | undefined>(
    entity: TEntity
  ) {
    this.mapEntity = entity as never;
    return this as unknown as StopV1<TEntity>;
  }

  public updateMapEntity(
    map: MaplibreglMap,
    createMapMarkerElement: (stop: StopV1) => HTMLElement
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
