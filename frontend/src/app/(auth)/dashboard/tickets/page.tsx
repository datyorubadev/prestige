"use client";

import { Suspense } from "react";
import { TicketList } from "@/components/inbox/ticket-list";

/** Ticket queue (guide §6.2 /dashboard/tickets) — Step 1 of the two-step
 *  inbox: a full-width Freshdesk/Zendesk-style list. Row clicks open the
 *  Step-2 detail workspace at /dashboard/tickets/[id]. Customers never reach
 *  it — the (auth) layout routes them to /portal. */
export default function TicketQueuePage() {
  return <TicketList />;
}

function QueueLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-8 w-20" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex gap-2 border-b border-border px-3 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-7 w-20" />
          ))}
        </div>
        <div className="flex gap-2 border-b border-border bg-surface-2 px-3 py-2">
          <div className="skeleton h-7 flex-1" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-7 w-28" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <div className="skeleton h-8 w-8 rounded-full" />
            <div className="flex-1">
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton mt-2 h-2.5 w-2/3" />
            </div>
            <div className="skeleton h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
