import { useConnections } from "@/lib/queries";
import { Card, Empty, Spinner } from "@/components/ui";

function ConnectionsCard() {
  const { data, isLoading, isError } = useConnections();

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
        <Empty>Failed to load connections.</Empty>
      </Card>
    );
  }

  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <Card>
        <Empty>No active connections</Empty>
      </Card>
    );
  }

  const total = entries.reduce((sum, [, c]) => sum + c, 0);

  return (
    <Card>
      <p className="text-text-muted mb-2 text-xs">
        Total: {total} connection{total !== 1 ? "s" : ""} from {entries.length} IP
        {entries.length !== 1 ? "s" : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([ip, count]) => (
          <div key={ip} className="bg-bg flex justify-between rounded px-2 py-1 text-xs">
            <span className="font-mono text-[#cbd5e1]">{ip}</span>
            <span className="text-primary font-semibold">{count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DashboardRoute() {
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold text-[#f8fafc]">Dashboard</h1>
      <h2 className="text-text-muted mb-2 text-sm font-semibold tracking-wide uppercase">
        Connections
      </h2>
      <ConnectionsCard />
    </div>
  );
}
