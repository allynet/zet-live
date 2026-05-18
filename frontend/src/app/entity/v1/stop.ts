export class StopV1 {
  id: string;
  name: string;
  lat: number;
  lng: number;

  public constructor(data: { id: string; name: string; lat: number; lng: number }) {
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

  public getMapId() {
    return `stop-${this.id}`;
  }
}
