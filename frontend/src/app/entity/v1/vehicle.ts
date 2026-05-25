export class VehicleV1 {
  id: string;
  routeId: string;
  tripId: string;
  lat: number;
  lng: number;
  prevLat: number | null;
  prevLng: number | null;
  bearing: number | null;
  nextStopId: string | null;
  nextStopSequence: number | null;
  nextStopArrivalDelay: number | null;
  nextStopArrivalTime: number | null;

  public constructor(data: {
    id: string;
    routeId: string;
    tripId: string;
    latitude: number;
    longitude: number;
    prevLat?: number | null;
    prevLng?: number | null;
    bearing?: number | null;
    nextStopId?: string | null;
    nextStopSequence?: number | null;
    nextStopArrivalDelay?: number | null;
    nextStopArrivalTime?: number | null;
  }) {
    this.id = data.id;
    this.routeId = data.routeId;
    this.tripId = data.tripId;
    this.lat = data.latitude;
    this.lng = data.longitude;
    this.prevLat = data.prevLat ?? null;
    this.prevLng = data.prevLng ?? null;
    this.bearing = data.bearing ?? null;
    this.nextStopId = data.nextStopId ?? null;
    this.nextStopSequence = data.nextStopSequence ?? null;
    this.nextStopArrivalDelay = data.nextStopArrivalDelay ?? null;
    this.nextStopArrivalTime = data.nextStopArrivalTime ?? null;
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
      prevLat: data[5] != null ? Number(data[5]) : null,
      prevLng: data[6] != null ? Number(data[6]) : null,
      bearing: data[11] != null ? Number(data[11]) : null,
      nextStopId: data[7] != null ? String(data[7]) : null,
      nextStopSequence: data[8] != null ? Number(data[8]) : null,
      nextStopArrivalDelay: data[9] != null ? Number(data[9]) : null,
      nextStopArrivalTime: data[10] != null ? Number(data[10]) : null,
    });
  }

  public toJSON() {
    return {
      id: this.id,
      routeId: this.routeId,
      tripId: this.tripId,
      latitude: this.lat,
      longitude: this.lng,
      prevLat: this.prevLat,
      prevLng: this.prevLng,
      bearing: this.bearing,
      nextStopId: this.nextStopId,
      nextStopSequence: this.nextStopSequence,
      nextStopArrivalDelay: this.nextStopArrivalDelay,
      nextStopArrivalTime: this.nextStopArrivalTime,
    };
  }

  public getMapId() {
    return `vehicle-${this.id}`;
  }
}
