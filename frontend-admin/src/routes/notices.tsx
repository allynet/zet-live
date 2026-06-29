import { useState } from "react";
import { toast } from "sonner";

import {
  Button,
  Card,
  Empty,
  SectionTitle,
  Select,
  SeverityBadge,
  Spinner,
  Textarea,
} from "@/components/ui";
import { type NoticeSeverity, noticeSeveritySchema } from "@/entity/schemas";
import { useSettings, useUpdateSetting } from "@/lib/queries";

function GlobalNotices() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSetting();
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<NoticeSeverity>("info");

  const notices = data?.globalNotices ?? [];

  async function save(next: typeof notices) {
    try {
      await update.mutateAsync({ name: "globalNotices", value: next });
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : ""}`);
    }
  }

  function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    void save([...notices, { id: crypto.randomUUID(), text: trimmed, severity }]);
    setText("");
  }

  return (
    <Card>
      <SectionTitle>Global Notices</SectionTitle>
      {isLoading ? (
        <Spinner />
      ) : notices.length === 0 ? (
        <Empty>No active notices</Empty>
      ) : (
        notices.map((n) => (
          <div key={n.id} className="bg-bg mb-2 flex items-center gap-2 rounded p-2 last:mb-0">
            <SeverityBadge severity={n.severity} />
            <span className="flex-1 text-xs break-words text-[#cbd5e1]">{n.text}</span>
            <span className="text-text-dim font-mono text-[0.65rem]">{n.id.slice(0, 8)}</span>
            <Button
              variant="danger"
              className="px-1.5 py-0.5 text-[0.7rem]"
              onClick={() => void save(notices.filter((x) => x.id !== n.id))}
            >
              ×
            </Button>
          </div>
        ))
      )}
      <div className="border-border mt-3 flex flex-col gap-2 border-t pt-3">
        <Textarea
          placeholder="Enter notice text…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <div className="flex items-end gap-2">
          <Select
            value={severity}
            onChange={(e) => {
              setSeverity(noticeSeveritySchema.parse(e.target.value));
            }}
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </Select>
          <Button onClick={add}>Add Notice</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (notices.length === 0) return;
              void save([]);
            }}
          >
            Clear All
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function NoticesRoute() {
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold text-[#f8fafc]">Notices</h1>
      <p className="text-text-muted mb-3 text-xs">
        Per-account notices are managed on each user&apos;s page under{" "}
        <a href="/auth" className="text-primary hover:underline">
          Auth
        </a>
        .
      </p>
      <GlobalNotices />
    </div>
  );
}
