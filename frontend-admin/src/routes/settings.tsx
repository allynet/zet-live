import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, Card, Input, Label, Row, Toggle } from "@/components/ui";
import { useSettings, useUpdateSetting } from "@/lib/queries";

function UrlSetting({
  name,
  label,
  current,
}: {
  name: string;
  label: string;
  current: string | null | undefined;
}) {
  const [value, setValue] = useState("");
  const update = useUpdateSetting();

  useEffect(() => {
    setValue(current ?? "");
  }, [current]);

  return (
    <Row>
      <Label>{label}</Label>
      <Input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        placeholder="Default from env"
      />
      <Button
        onClick={() => {
          update.mutate(
            { name, value: value.trim() || null },
            {
              onSuccess: () => toast.success(`${label} saved`),
              onError: (e) => toast.error(`Failed to save: ${e.message}`),
            },
          );
        }}
      >
        Save
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          setValue("");
          update.mutate(
            { name, value: null },
            {
              onSuccess: () => toast.success(`${label} reset`),
              onError: (e) => toast.error(`Failed to reset: ${e.message}`),
            },
          );
        }}
      >
        Reset
      </Button>
    </Row>
  );
}

function PauseSetting({
  name,
  label,
  current,
}: {
  name: string;
  label: string;
  current: boolean | null | undefined;
}) {
  const update = useUpdateSetting();
  const paused = Boolean(current);

  return (
    <Row>
      <Label>{label}</Label>
      <Toggle
        checked={paused}
        onChange={(next) => {
          update.mutate(
            { name, value: next },
            {
              onSuccess: () => toast.success(next ? `${label} paused` : `${label} resumed`),
              onError: (e) => toast.error(`Failed: ${e.message}`),
            },
          );
        }}
      />
    </Row>
  );
}

export function SettingsRoute() {
  const { data, isLoading } = useSettings();

  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold text-[#f8fafc]">Settings</h1>
      <Card>
        {isLoading || !data ? (
          <p className="text-text-muted text-sm">Loading…</p>
        ) : (
          <>
            <UrlSetting name="realtimeUrl" label="Realtime URL" current={data.realtimeUrl} />
            <UrlSetting name="staticUrl" label="Static URL" current={data.staticUrl} />
            <UrlSetting name="gbfsUrl" label="GBFS URL" current={data.gbfsUrl} />
            <PauseSetting
              name="realtimePaused"
              label="Pause Realtime"
              current={data.realtimePaused}
            />
            <PauseSetting name="staticPaused" label="Pause Static" current={data.staticPaused} />
            <PauseSetting name="gbfsPaused" label="Pause GBFS" current={data.gbfsPaused} />
          </>
        )}
      </Card>
      <p className="text-text-dim mt-3 text-xs">
        Global notices are managed on the{" "}
        <a href="/notices" className="text-primary hover:underline">
          Notices
        </a>{" "}
        page.
      </p>
    </div>
  );
}
