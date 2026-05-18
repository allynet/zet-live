export class VehicleV1 {
  id: string;
  routeId: string;
  tripId: string;
  lat: number;
  lng: number;
  moveAngle?: number;

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
}
