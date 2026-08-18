"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import type { ColumnDef } from "@tanstack/react-table";
import type { AgentUser } from "@/lib/types";

const roleOptions: SelectOption[] = [
  { value: "agent", label: "agent" },
  { value: "owner", label: "owner" },
];

const scopeOptions: SelectOption[] = [
  { value: "all", label: "All tickets" },
  { value: "assigned", label: "Only assigned to me" },
  { value: "team", label: "My team + unassigned" },
];

const SCOPE_LABEL: Record<string, string> = {
  all: "All tickets",
  assigned: "Assigned to me",
  team: "My team",
};

export function AgentsManager() {
  const toast = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "t1";
  const [agents, setAgents] = useState<AgentUser[] | null>(null);
  const [maxAgents, setMaxAgents] = useState(5);
  const [openTickets, setOpenTickets] = useState(0);
  const [query, setQuery] = useState("");

  const [inviting, setInviting] = useState(false);
  const [sending, setSending] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");

  const [managing, setManaging] = useState<AgentUser | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get<AgentUser[]>("/agents").then(setAgents).catch(() => setAgents([]));
    api
      .get<{ status: string }[]>("/tickets")
      .then((data) => {
        setOpenTickets(data.filter((t) => ["open", "in_progress", "escalated"].includes(t.status)).length);
      })
      .catch(() => setOpenTickets(0));
    api
      .get<{ maxAgents?: number }>(`/tenants/${tenantId}`)
      .then((t) => setMaxAgents(t.maxAgents ?? 5))
      .catch(() => setMaxAgents(5));
  };

  useEffect(() => {
    load();
  }, []);

  useRealtime({ agents_changed: () => load() });

  const resend = async (a: AgentUser) => {
    setBusy(true);
    try {
      const updated = await api.post<AgentUser>(`/agents/${a.id}/resend`);
      setAgents((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
      if (managing?.id === a.id) setManaging(updated);
      toast(`Invite re-sent to ${a.email}`);
    } catch {
      toast("Could not re-send invite", "danger");
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (a: AgentUser, active: boolean) => {
    setBusy(true);
    try {
      const updated = await api.patch<AgentUser>(`/agents/${a.id}`, { active });
      setAgents((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
      if (managing?.id === a.id) setManaging(updated);
      toast(active ? `${a.name} re-activated` : `${a.name} paused`);
    } catch {
      toast("Could not update agent", "danger");
    } finally {
      setBusy(false);
    }
  };

  const setScope = async (a: AgentUser, scope: string) => {
    setBusy(true);
    try {
      const updated = await api.patch<AgentUser>(`/agents/${a.id}`, { inbox_scope: scope });
      setAgents((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
      if (managing?.id === a.id) setManaging(updated);
      toast(`${a.name} inbox: ${SCOPE_LABEL[scope] ?? scope}`);
    } catch {
      toast("Could not update inbox scope", "danger");
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (!name.trim() || !email.trim()) {
      toast("Name and email required", "danger");
      return;
    }
    setSending(true);
    try {
      const created = await api.post<AgentUser>("/agents", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
      });
      setAgents((prev) => (prev ? [...prev, created] : [created]));
      setInviting(false);
      setName("");
      setEmail("");
      setRole("agent");
      toast(`Invite sent to ${created.email}`);
    } catch {
      toast("Could not send invite", "danger");
    } finally {
      setSending(false);
    }
  };

  const activeCount = agents?.filter((a) => !a.invitePending && a.active !== false).length ?? 0;
  const onlineCount = agents?.filter((a) => a.online).length ?? 0;

  const filteredAgents = (agents ?? []).filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.email.toLowerCase().includes(query.toLowerCase()) ||
      a.role.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Agents</h1>
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
        >
          <Icon name="plus" size={15} />
          Invite agent
        </button>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <StatCard label="Active agents" value={`${activeCount} / ${maxAgents}`} context={`plan limit: ${maxAgents}`} />
        <StatCard label="Online now" value={String(onlineCount)} context="presence heartbeat 30s" />
        <StatCard
          label="Open tickets"
          value={String(openTickets)}
          context="across all agents"
          tone={openTickets > 5 ? "warn" : undefined}
        />
      </div>

      <div className="relative max-w-sm">
        <Icon
          name="search"
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teammates by name or email…"
          className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-2 pl-9 pr-3 text-[12.5px] text-text placeholder:text-text-3"
        />
      </div>

      <div className="w-full">
        {!agents ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton mt-3 h-10 w-full" />
            <div className="skeleton mt-3 h-10 w-full" />
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
            <EmptyState
              icon="users"
              title="No agents yet"
              subtitle="Invite your first teammate and they'll appear here with presence and live workload."
              action={
                <button
                  type="button"
                  onClick={() => setInviting(true)}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                >
                  <Icon name="plus" size={14} />
                  Invite an agent
                </button>
              }
            />
          </div>
        ) : (
          <AgentsTable
            agents={filteredAgents}
            busy={busy}
            onResend={(a) => void resend(a)}
            onManage={setManaging}
          />
        )}
      </div>

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite an agent"
        icon="users"
        footer={
          <>
            <button
              type="button"
              onClick={() => setInviting(false)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void invite()}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? <Spinner size={14} /> : <Icon name="send" size={14} />}
              Send invite
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Zainab Lawal"
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="zainab@nairawave.ng"
              className="input-control"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Role</span>
            <Select
              value={role}
              onChange={setRole}
              options={roleOptions}
              ariaLabel="Agent role"
            />
          </label>
          <p className="rounded-sm bg-primary-soft px-3 py-2 text-[11.5px] text-primary-dark">
            The invite lands as a pending user — they show here until they accept.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!managing}
        onClose={() => setManaging(null)}
        title={`Manage ${managing?.name ?? ""}`}
        icon="users"
        footer={
          <>
            <button
              type="button"
              onClick={() => setManaging(null)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Close
            </button>
          </>
        }
      >
        {managing && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={managing.name} color={managing.color} size="md" />
              <div>
                <p className="text-[14px] font-bold text-text">{managing.name}</p>
                <p className="text-[12px] text-text-2">{managing.email}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-sm border border-border bg-surface-2 p-3">
                <dt className="text-micro uppercase text-text-3">Role</dt>
                <dd className="mt-0.5 text-[13px] font-semibold text-text">{managing.role}</dd>
              </div>
              <div className="rounded-sm border border-border bg-surface-2 p-3">
                <dt className="text-micro uppercase text-text-3">Open tickets</dt>
                <dd className="mt-0.5 text-[13px] font-semibold text-text tabular-nums">{managing.tickets}</dd>
              </div>
              <div className="rounded-sm border border-border bg-surface-2 p-3">
                <dt className="text-micro uppercase text-text-3">Resolutions (30d)</dt>
                <dd className="mt-0.5 text-[13px] font-semibold text-text tabular-nums">{managing.resolutions30d}</dd>
              </div>
              <div className="rounded-sm border border-border bg-surface-2 p-3">
                <dt className="text-micro uppercase text-text-3">CSAT</dt>
                <dd className="mt-0.5 text-[13px] font-semibold text-text tabular-nums">
                  {managing.csat === null ? "—" : `${managing.csat}%`}
                </dd>
              </div>
            </dl>
            <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface-2 px-3 py-3">
              <div>
                <p className="text-[13px] font-semibold text-text">
                  {managing.active === false ? "Paused" : "Active in workspace"}
                </p>
                <p className="mt-0.5 text-[12px] text-text-2">
                  Pausing stops new ticket assignment and removes them from presence.
                </p>
              </div>
              <Switch
                checked={managing.active !== false}
                onChange={(v) => void setActive(managing, v)}
                disabled={busy}
                label={`Toggle ${managing.name} active state`}
              />
            </div>
            <div className="rounded-sm border border-border bg-surface-2 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-text">Inbox scope</p>
                  <p className="mt-0.5 text-[12px] text-text-2">
                    Which conversations appear in their queue.
                  </p>
                </div>
                <Select
                  value={managing.inboxScope ?? "all"}
                  onChange={(v) => void setScope(managing, v)}
                  options={scopeOptions}
                  disabled={busy}
                  size="sm"
                  ariaLabel={`Inbox scope for ${managing.name}`}
                  className="w-44"
                />
              </div>
            </div>
            {managing.invitePending && (
              <button
                type="button"
                onClick={() => void resend(managing)}
                disabled={busy}
                className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Spinner size={13} /> : <Icon name="clock" size={13} />}
                Re-send invite
              </button>
            )}
            <p className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-[11.5px] text-text-3">
              Presence & workload are shared live with the whole team.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AgentsTable({
  agents,
  busy,
  onResend,
  onManage,
}: {
  agents: AgentUser[];
  busy: boolean;
  onResend: (a: AgentUser) => void;
  onManage: (a: AgentUser) => void;
}) {
  const columns = useMemo<ColumnDef<AgentUser, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Agent",
        cell: ({ row }) => {
          const a = row.original;
          return (
            <CellMain
              main={
                <span className="flex items-center gap-2.5">
                  <Avatar name={a.name} color={a.color} size="sm" />
                  <span className="font-semibold text-text">{a.name}</span>
                </span>
              }
              sub={`${a.role} · ${a.email}`}
            />
          );
        },
      },
      {
        accessorKey: "online",
        header: "Presence",
        enableSorting: false,
        cell: ({ row }) => <Pill status={row.original.online ? "online" : "offline"} dot />,
      },
      {
        accessorKey: "tickets",
        header: "Open tickets",
        cell: ({ row }) => (
          <span className="font-mono text-code tabular-nums">{row.original.tickets}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          return a.invitePending ? (
            <Pill status="invited" tone="warning" />
          ) : a.active === false ? (
            <Pill status="paused" tone="neutral" />
          ) : (
            <Pill status="active" tone="success" />
          );
        },
      },
      {
        accessorKey: "inboxScope",
        header: "Inbox scope",
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <Pill
              status={SCOPE_LABEL[a.inboxScope ?? "all"] ?? "All tickets"}
              tone={a.inboxScope === "assigned" ? "info" : a.inboxScope === "team" ? "violet" : "neutral"}
            />
          );
        },
      },
      {
        id: "row_actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="text-right">
              <span className="flex items-center justify-end gap-1.5">
                {a.invitePending && (
                  <button
                    type="button"
                    onClick={() => onResend(a)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon name="clock" size={13} />
                    Resend
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onManage(a)}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                >
                  Manage
                </button>
              </span>
            </div>
          );
        },
      },
    ],
    [busy, onResend, onManage],
  );
  return <DataTable columns={columns} data={agents} getRowId={(a) => a.id} hoverable />;
}

function StatCard({
  label,
  value,
  context,
  tone,
}: {
  label: string;
  value: string;
  context?: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <p className="text-[12px] font-semibold text-text-2">{label}</p>
      <p className={tone === "warn" ? "mt-2 text-kpi tabular-nums text-warning" : "mt-2 text-kpi tabular-nums text-text"}>
        {value}
      </p>
      {context && <p className="mt-1 text-meta text-text-3">{context}</p>}
    </div>
  );
}
