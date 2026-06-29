import { toast } from "sonner";

import { Button, Card, Empty, Label, Row, Spinner, StatusBadge } from "@/components/ui";
import { useForceSync, useMetadata } from "@/lib/queries";

function SyncRow({ label, type }: { label: string; type: "realtime" | "static" | "gbfs" }) {
  const force = useForceSync();
  return (
    <Row>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            force.mutate(type, {
              onSuccess: () => toast.success(`${label} sync triggered`),
              onError: (e) => toast.error(`Failed: ${e.message}`),
            });
          }}
        >
          Sync Now
        </Button>
      </div>
    </Row>
  );
}

function MetadataCard() {
  const { data, isLoading, isError } = useMetadata();

  if (isLoading) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <Empty>Failed to load metadata.</Empty>
      </Card>
    );
  }

  const entries = Object.entries(data).sort((a, b) => b[0].localeCompare(a[0]));
  if (entries.length === 0) {
    return (
      <Card>
        <Empty>No metadata available</Empty>
      </Card>
    );
  }

  return (
    <Card>
      {entries.map(([name, m]) => (
        <Row key={name}>
          <span className="w-[200px] shrink-0 text-sm font-medium text-[#cbd5e1]">{name}</span>
          <div className="text-text-dim flex flex-1 flex-wrap items-center gap-2 text-xs">
            <StatusBadge status={m.status} />
            {m.lastSyncAt && <span>{new Date(m.lastSyncAt).toLocaleString()}</span>}
            {m.durationMs !== undefined && m.durationMs !== null && <span>({m.durationMs}ms)</span>}
            {m.recordsProcessed !== undefined && m.recordsProcessed !== null && (
              <span>{m.recordsProcessed} records</span>
            )}
            {m.errorMessage && <span className="text-[#fca5a5]">{m.errorMessage}</span>}
          </div>
        </Row>
      ))}
    </Card>
  );
}

export function SyncRoute() {
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold text-[#f8fafc]">Sync</h1>
      <Card>
        <SyncRow label="Force Realtime Sync" type="realtime" />
        <SyncRow label="Force Static Sync" type="static" />
        <SyncRow label="Force GBFS Sync" type="gbfs" />
      </Card>

      <h2 className="text-text-muted mt-6 mb-2 text-sm font-semibold tracking-wide uppercase">
        Metadata
      </h2>
      <MetadataCard />
    </div>
  );
}
