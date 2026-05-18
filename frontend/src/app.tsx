import { MapContainer } from "@/components/map-container";
import { StatusBar } from "@/components/status-bar";
import { StopCard } from "@/components/stop-card";
import { useWebSocket } from "@/hooks/use-websocket";
import { useStops } from "@/hooks/use-stops";

export function App() {
  useWebSocket();
  useStops();

  return (
    <>
      <MapContainer />
      <StopCard />
      <StatusBar />
    </>
  );
}
