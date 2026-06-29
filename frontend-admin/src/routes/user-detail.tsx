import { type ColumnDef } from "@tanstack/react-table";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table";
import { NoticeForm } from "@/components/notice-form";
import { UserEditForm } from "@/components/user-edit-form";
import {
  Badge,
  Button,
  Card,
  CategoryBadge,
  Empty,
  Row,
  SectionTitle,
  SeverityBadge,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { type SessionInfo } from "@/entity/schemas";
import {
  useCreateUserNotice,
  useDeleteSession,
  useDeleteUser,
  useDeleteUserNotice,
  useRevokeUserSessions,
  useUserDetail,
} from "@/lib/queries";
import { confirmAction } from "@/lib/utils";

export function UserDetailRoute() {
  const { id } = useParams({ from: "/layout/auth/users/$id" });
  const navigate = useNavigate();
  const { data, isLoading, isError } = useUserDetail(id);
  const deleteUser = useDeleteUser();
  const revokeAll = useRevokeUserSessions();
  const revokeSession = useDeleteSession();
  const createNotice = useCreateUserNotice();
  const deleteNotice = useDeleteUserNotice();

  const sessionColumns: ColumnDef<SessionInfo>[] = [
    {
      header: "IP",
      accessorFn: (s) => s.ip ?? "",
      cell: ({ row }) => (
        <span className="text-text-muted font-mono text-xs">{row.original.ip || "—"}</span>
      ),
    },
    {
      header: "User agent",
      accessorFn: (s) => s.userAgent ?? "",
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <span className="text-text-muted block max-w-[320px] truncate text-xs">
          {row.original.userAgent || "—"}
        </span>
      ),
    },
    {
      header: "Created",
      accessorKey: "createdAt",
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <span className="text-text-dim text-xs">
          {new Date(row.original.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      header: "Expires",
      accessorKey: "expiresAt",
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <span className="text-text-dim text-xs">
          {new Date(row.original.expiresAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <Button
          variant="danger"
          className="px-2 py-1 text-[0.7rem]"
          onClick={() => void handleRevokeSession(row.original.id)}
        >
          Revoke
        </Button>
      ),
    },
  ];

  async function handleRevokeSession(sessionId: string) {
    if (!confirmAction("Revoke this session? The user will be logged out.")) return;
    try {
      await revokeSession.mutateAsync(sessionId);
      toast.success("Session revoked");
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : ""}`);
    }
  }

  async function handleRevokeAll() {
    if (!confirmAction("Revoke all sessions for this user? They will be signed out everywhere.")) {
      return;
    }
    try {
      await revokeAll.mutateAsync(id);
      toast.success("Sessions revoked");
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : ""}`);
    }
  }

  async function handleDelete() {
    if (
      !confirmAction(
        "Delete this account permanently? All sessions and linked providers will be removed. Feedback will be kept but anonymized.",
      )
    ) {
      return;
    }
    try {
      await deleteUser.mutateAsync(id);
      toast.success("Account deleted");
      void navigate({ to: "/auth" });
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : ""}`);
    }
  }

  async function handleCreateNotice(values: {
    text: string;
    severity: "info" | "warning" | "error";
  }) {
    try {
      await createNotice.mutateAsync({ userId: id, text: values.text, severity: values.severity });
      toast.success("Notice added");
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : ""}`);
    }
  }

  async function handleDeleteNotice(noticeId: string) {
    try {
      await deleteNotice.mutateAsync(noticeId);
      toast.success("Notice deleted");
    } catch (e) {
      toast.error(`Failed: ${e instanceof Error ? e.message : ""}`);
    }
  }

  if (isLoading) {
    return (
      <div>
        <BackLink />
        <Card>
          <Spinner />
        </Card>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div>
        <BackLink />
        <Card>
          <Empty>Failed to load user, or user not found.</Empty>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <BackLink />
      <h1 className="mb-3 text-xl font-semibold text-[#f8fafc]">
        {data.displayName || data.email || data.id}
      </h1>

      <Card className="mb-4">
        <SectionTitle>Profile</SectionTitle>
        <Row>
          <span className="text-text-muted w-[140px] shrink-0 text-xs">ID</span>
          <span className="text-text font-mono text-xs">{data.id}</span>
        </Row>
        <Row>
          <span className="text-text-muted w-[140px] shrink-0 text-xs">Email</span>
          <span className="text-text text-sm">{data.email || "—"}</span>
        </Row>
        <Row>
          <span className="text-text-muted w-[140px] shrink-0 text-xs">Providers</span>
          <span className="text-text-muted text-sm">
            {data.providers.length === 0 ? "—" : data.providers.join(", ")}
          </span>
        </Row>
        <Row>
          <span className="text-text-muted w-[140px] shrink-0 text-xs">Joined</span>
          <span className="text-text-muted text-sm">
            {new Date(data.createdAt).toLocaleString()}
          </span>
        </Row>
        <Row>
          <span className="text-text-muted w-[140px] shrink-0 text-xs">Notices</span>
          <span className="text-sm">
            {data.noticeCount > 0 ? (
              <Badge className="bg-[#713f12] text-[#fde68a]">{data.noticeCount}</Badge>
            ) : (
              <span className="text-text-dim">—</span>
            )}
          </span>
        </Row>

        <div className="border-border mt-3 border-t pt-3">
          <SectionTitle>Edit profile</SectionTitle>
          <UserEditForm user={data} />
        </div>

        <div className="border-border mt-3 flex flex-wrap gap-2 border-t pt-3">
          <Button variant="secondary" onClick={() => void handleRevokeAll()}>
            Revoke all sessions
          </Button>
          <Button variant="danger" onClick={() => void handleDelete()}>
            Delete account
          </Button>
        </div>
      </Card>

      <h2 className="text-text-muted mb-2 text-sm font-semibold tracking-wide uppercase">
        Sessions ({data.sessions.length})
      </h2>
      <div className="mb-6">
        <DataTable
          columns={sessionColumns}
          data={data.sessions}
          searchAccessor={(s) => `${s.ip ?? ""} ${s.userAgent ?? ""}`}
          searchPlaceholder="Search sessions…"
          pageSize={10}
          emptyMessage="No active sessions."
        />
      </div>

      <Card className="mb-6">
        <SectionTitle>Per-account notices ({data.notices.length})</SectionTitle>
        {data.notices.length === 0 ? (
          <Empty>No notices for this user.</Empty>
        ) : (
          data.notices.map((n) => (
            <div key={n.id} className="bg-bg mb-2 flex items-center gap-2 rounded p-2 last:mb-0">
              <SeverityBadge severity={n.severity} />
              <span className="flex-1 text-xs break-words text-[#cbd5e1]">{n.text}</span>
              <Button
                variant="danger"
                className="px-1.5 py-0.5 text-[0.7rem]"
                onClick={() => void handleDeleteNotice(n.id)}
              >
                ×
              </Button>
            </div>
          ))
        )}
        <div className="border-border mt-3 border-t pt-3">
          <NoticeForm onSubmit={handleCreateNotice} />
        </div>
      </Card>

      <h2 className="text-text-muted mb-2 text-sm font-semibold tracking-wide uppercase">
        Feedback ({data.feedback.length})
      </h2>
      <Card>
        {data.feedback.length === 0 ? (
          <Empty>No feedback from this user.</Empty>
        ) : (
          data.feedback.map((f) => (
            <div key={f.id} className="bg-bg border-border mb-2 rounded border p-2 last:mb-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <CategoryBadge category={f.category} />
                <StatusBadge status={f.status} />
                <span className="text-text-dim font-mono text-[0.7rem]">
                  {new Date(f.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-text text-sm break-words whitespace-pre-wrap">{f.message}</p>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/auth"
      className="text-text-muted hover:text-text mb-3 inline-block text-xs hover:underline"
    >
      ← Back to Auth
    </Link>
  );
}
