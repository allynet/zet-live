import type { GbfsStationV1 } from "@/app/entity/v1/gbfs-station";

type Props = {
  station: GbfsStationV1;
};

export function GbfsStationSheet({ station }: Props) {
  const bikes = station.numBikesAvailable;
  const docks = station.numDocksAvailable;
  const rentUrl = new URL("https://app.nextbike.net/station");
  rentUrl.searchParams.set("id", station.id);

  return (
    <div className="px-4 pb-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Bikes available" value={bikes} accent={bikes === 0 ? "empty" : "ok"} />
        <Stat label="Docks free" value={docks} />
        {bikes && bikes > 0 ? (
          <a
            className="bg-primary-container text-primary-container-hover hover:bg-primary-container-hover col-span-2 rounded px-4 py-3 text-center font-semibold transition-colors"
            target="_blank"
            rel="noreferrer"
            href={rentUrl.toString()}
          >
            Open App
          </a>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <StatusPill ok={station.isRenting} okLabel="Renting" notOkLabel="Not renting" />
        <StatusPill ok={station.isReturning} okLabel="Returning" notOkLabel="Not returning" />
        {station.capacity !== null && (
          <span className="bg-surface-dim text-on-surface-muted rounded px-1.5 py-0.5 text-xs font-medium">
            Capacity {station.capacity}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: number | null; accent?: "ok" | "empty" }) {
  const value = props.value ?? 0;
  return (
    <div className="bg-surface-dim flex flex-col rounded-lg p-2.5">
      <span className="text-on-surface-muted text-xs font-medium">{props.label}</span>
      <span
        className={`text-2xl font-bold ${
          props.accent === "empty" ? "text-danger" : "text-on-surface"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill(props: { ok: boolean; okLabel: string; notOkLabel: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
        props.ok
          ? "bg-success-container text-on-success-container"
          : "bg-surface-dim text-on-surface-muted"
      }`}
    >
      {props.ok ? props.okLabel : props.notOkLabel}
    </span>
  );
}
