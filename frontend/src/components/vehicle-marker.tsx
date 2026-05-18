import type { VehicleV1 } from "@/app/entity/v1/vehicle";

type Props = {
  vehicle: VehicleV1;
  isFollowing: boolean;
  isNotFollowing: boolean;
  onClick: () => void;
};

export function VehicleMarker({ vehicle, isFollowing, isNotFollowing, onClick }: Props) {
  const style: Record<string, string> = {};
  if (vehicle.moveAngle) {
    style["--move-angle"] = `${vehicle.moveAngle}`;
  }

  return (
    <div
      class={isFollowing ? "following" : isNotFollowing ? "not-following" : undefined}
      data-id={vehicle.id}
      data-route-id={vehicle.routeId}
      data-trip-id={vehicle.tripId}
      style={style}
    >
      <div
        class="vehicle-marker"
        style={{
          "--theme-color": vehicle.routeId.length > 2 ? "blue" : "red",
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
      >
        <div class="vehicle-marker-name">{vehicle.routeId}</div>
        <div class="vehicle-marker-arrow-container">
          <div class="vehicle-marker-arrow" />
        </div>
      </div>
    </div>
  );
}
