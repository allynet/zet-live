import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button, Card, Input } from "@/components/ui";
import { defaultApiUrl, setCredentials } from "@/lib/auth";

export function LoginRoute() {
  const navigate = useNavigate();
  const [apiUrl, setApiUrl] = useState(defaultApiUrl());
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const url = apiUrl.trim() || defaultApiUrl();
    const key = apiKey.trim();
    if (!key) {
      setError("Admin key is required.");
      return;
    }
    setCredentials({ apiUrl: url, apiKey: key });
    void navigate({ to: "/" });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center p-6">
      <Card>
        <h1 className="mb-1 text-lg font-semibold text-[#f8fafc]">ZET Live Admin</h1>
        <p className="text-text-muted mb-4 text-xs">
          Enter the admin API URL (defaults to the same origin) and your admin key.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <label className="text-text-muted flex flex-col gap-1 text-xs">
            Admin API URL
            <Input
              type="text"
              value={apiUrl}
              onChange={(e) => {
                setApiUrl(e.target.value);
              }}
              placeholder="/api"
              autoFocus
            />
          </label>
          <label className="text-text-muted flex flex-col gap-1 text-xs">
            Admin key
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
              }}
              placeholder="••••••••"
            />
          </label>
          {error && <p className="text-xs text-[#fca5a5]">{error}</p>}
          <Button type="submit">Sign in</Button>
        </form>
      </Card>
    </div>
  );
}
