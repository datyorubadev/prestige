"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { DataTable, CellMain } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateTicketModal } from "@/components/portal/create-ticket-modal";
import { channelLabel, DEMO_TENANT_SLUG, ticketNumberFor } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { PastTicket, Ticket } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PortalInboxPage() {
  return (
    <Suspense fallback={<PortalInboxLoading />}>
      <PortalInbox />
    </Suspense>
  );
}

interface TicketEntry {
  kind: "live" | "past";
  id: string;
  number: string;
  subject: string;
  status: string;
  meta: string;
  email: string;
}

/** Customer ticket tracker — look up by email, then deep-link into the chat
 * (?email= auto-opens the thread, see /chat/[tenantId]/page.tsx). */
function PortalInbox() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? DEMO_TENANT_SLUG;
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const initialEmail = searchParams.get("email") ?? user?.email ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [entries, setEntries] = useState<TicketEntry[] | null>(null);
  const [searched, setSearched] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("raise") === "1");
  const autoloaded = useRef(false);

  const lookup = (raw: string) => {
    const value = raw.trim();
    if (!EMAIL_RE.test(value)) {
      setError("Enter a valid email address to look up your tickets.");
      return;
    }
    setError(null);
    setLoading(true);
    setSearched(value);
    void Promise.all([
      api.post<Ticket[]>("/portal/tickets/list", { tenantId, email: value }),
      api.post<PastTicket[]>("/past-tickets", { tenantId, email: value }),
    ])
      .then(([tickets, past]) => {
        const live = tickets
          .filter((t) => t.email.toLowerCase() === value.toLowerCase())
          .map(
            (t): TicketEntry => ({
              kind: "live",
              id: t.id,
              number: ticketNumberFor(t),
              subject: t.subject,
              status: t.status,
              meta: channelLabel(t.channel),
              email: t.email,
            }),
          );
        const history = past
          .filter((p) => p.email.toLowerCase() === value.toLowerCase())
          .map(
            (p): TicketEntry => ({
              kind: "past",
              id: p.id,
              number: ticketNumberFor(p),
              subject: p.subject,
              status: p.status,
              meta: `Closed ${p.date}`,
              email: p.email,
            }),
          );
        setEntries([...live, ...history]);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        setError("Unable to load tickets for this email right now. Please try again.");
        setEntries([]);
      });
  };

  // ?email= deep link (or signed-in customer): prefill and run the lookup on arrival.
  useEffect(() => {
    if (autoloaded.current || !initialEmail) return;
    autoloaded.current = true;
    queueMicrotask(() => lookup(initialEmail));
  }, [initialEmail]);

  // Open a specific conversation; ?ticket= auto-selects it, ?email= prefills the
  // guest form so the thread opens without retyping.
  const deepLink = useCallback(
    (id: string, addr: string) =>
      `/chat/${tenantId}?ticket=${encodeURIComponent(id)}&email=${encodeURIComponent(addr)}`,
    [tenantId],
  );
  const openCount = entries?.filter((e) => !["resolved", "closed"].includes(e.status)).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-text">My tickets</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/portal/${tenantId}`}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <Icon name="book" size={14} />
            Help center
          </Link>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="plus" size={14} />
            New ticket
          </button>
        </div>
      </header>

      <Card title="Track your tickets" icon="ticket">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup(email);
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="lookup-email" className="sr-only">
              Email address
            </label>
            <div className="relative">
              <Icon
                name="mail"
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3"
              />
              <input
                id="lookup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-2.5 pl-9 pr-3 text-[13px] text-text placeholder:text-text-3"
              />
            </div>
            {error && <p className="mt-1.5 text-[12px] text-danger">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-primary px-4 py-2.5 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name={loading ? "clock" : "search"} size={14} />
            {loading ? "Looking up…" : "View tickets"}
          </button>
        </form>
        <p className="mt-3 text-[12px] leading-relaxed text-text-3">
          Your email is used to pull your open conversations and history. Opening a ticket hands it
          to a support agent with your full context already loaded.
        </p>
      </Card>

      <Card
        title={searched ? `Tickets for ${searched}` : "Your tickets"}
        icon="inbox"
        actions={
          searched && (
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-text-2">
              {entries?.length ?? 0} ticket{entries?.length === 1 ? "" : "s"}
              {openCount > 0 && <span className="text-primary">· {openCount} open</span>}
            </span>
          )
        }
      >
        {!searched ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Icon name="inbox" size={30} className="opacity-40 text-text-3" />
            <p className="text-[13.5px] font-medium text-text-2">
              Enter your email above to see your tickets.
            </p>
            <p className="max-w-[320px] text-[12px] text-text-3">
              We&apos;ll show every open conversation and resolved ticket across chat, email and the
              portal.
            </p>
          </div>
        ) : loading ? (
          <div className="space-y-3 p-[18px]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-3 w-16" />
                <div className="skeleton h-3 flex-1" />
                <div className="skeleton h-5 w-20" />
              </div>
            ))}
          </div>
        ) : entries && entries.length > 0 ? (
          <InboxTable entries={entries} deepLink={deepLink} />
        ) : (
          <EmptyState
            icon="search"
            title={`No tickets found for ${searched}`}
            subtitle="If you just raised a request it may still be arriving. Open a new ticket and a support agent will pick it up."
            action={
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
              >
                <Icon name="plus" size={14} />
                New ticket
              </button>
            }
          />
        )}
      </Card>

      {createOpen && <CreateTicketModal open tenantId={tenantId} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function TicketRow({ entry, deepLink }: { entry: TicketEntry; deepLink: string }) {
  const resolved = entry.status === "resolved" || entry.status === "closed";
  return (
    <Link
      href={deepLink}
      className={cnActionLink(resolved)}
    >
      <Icon name={resolved ? "ticket" : "arrow-right"} size={13} />
      {resolved ? "Reopen" : "Open in support"}
    </Link>
  );
}

function InboxTable({
  entries,
  deepLink,
}: {
  entries: TicketEntry[];
  deepLink: (id: string, addr: string) => string;
}) {
  const columns = useMemo<ColumnDef<TicketEntry, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: "Ticket",
        cell: ({ row }) => <span className="font-mono text-code">{row.original.number}</span>,
      },
      {
        accessorKey: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <CellMain
            main={row.original.subject}
            sub={row.original.kind === "past" ? "Past ticket" : "Live conversation"}
          />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Pill status={row.original.status} />,
      },
      {
        accessorKey: "meta",
        header: "Via",
        cell: ({ row }) => <span className="text-text-2">{row.original.meta}</span>,
      },
      {
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <TicketRow entry={row.original} deepLink={deepLink(row.original.id, row.original.email)} />
          </div>
        ),
      },
    ],
    [deepLink],
  );
  return (
    <DataTable
      columns={columns}
      data={entries}
      getRowId={(e) => `${e.kind}-${e.id}`}
      hoverable
      borderless
    />
  );
}

function cnActionLink(resolved: boolean): string {
  return resolved
    ? "inline-flex items-center gap-1.5 rounded-sm border border-violet-border bg-violet-soft px-2.5 py-1.5 text-[12px] font-semibold text-violet transition-colors duration-150 hover:bg-violet-soft/70"
    : "inline-flex items-center gap-1.5 rounded-sm bg-primary px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark";
}

function PortalInboxLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton mt-3 h-3 w-2/3" />
      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <div className="skeleton h-3.5 w-1/3" />
        <div className="skeleton mt-4 h-10 w-full" />
        <div className="skeleton mt-3 h-3 w-3/4" />
      </div>
      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <div className="skeleton h-3.5 w-1/3" />
        <div className="skeleton mt-4 h-[200px] w-full" />
      </div>
    </div>
  );
}
