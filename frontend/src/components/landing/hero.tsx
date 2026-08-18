"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { mockApi } from "@/lib/mock";
import { DEMO_TENANT_SLUG } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui/pill";
import type { Ticket } from "@/lib/types";

/** Landing hero. The visual is the real shared inbox running against mock
 *  data — actual ticket rows, statuses and SLA pills — not a screenshot. Green
 *  appears on the two buttons and nowhere else. Falls back to the prototype
 *  dataset when the live backend isn't reachable, so the demo always renders. */
export function Hero() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<Ticket[]>("/tickets")
      .then((ts) => {
        if (active) setTickets(ts.slice(0, 4));
      })
      .catch(async () => {
        const ts = await mockApi.tickets();
        if (active) setTickets(ts.slice(0, 4));
        else if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-[-10%] h-[560px] w-[560px] rounded-full opacity-60"
        style={{
          background: "radial-gradient(circle, rgba(21,32,43,0.05) 0%, transparent 65%)",
        }}
      />

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-6 pb-20 pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-8 lg:pb-28 lg:pt-40">
        <div className="max-w-xl">
          <p className="text-micro uppercase text-text-3">Multi-tenant AI support portal</p>
          <h1 className="mt-4 font-display text-[44px] font-bold leading-[1.04] tracking-[-0.03em] text-text sm:text-[54px] lg:text-[60px]">
            Support that tells the truth.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[16.5px] leading-relaxed text-text-2">
            One shared inbox for every brand you serve. AI answers first, hands
            off to a human when it matters, and never pretends an agent is
            there.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/register" className="l-btn l-btn-primary">
              Start free
              <Icon name="arrow-right" size={15} />
            </Link>
            <Link href={`/chat/${DEMO_TENANT_SLUG}`} className="l-btn l-btn-ghost">
              Try the live chat
            </Link>
          </div>

          <p className="mt-6 text-meta text-text-3">
            Free for one tenant · no credit card · the demo runs on real mock data
          </p>
        </div>

        <div className="w-full">
          <InboxPreview tickets={tickets} failed={failed} />
        </div>
      </div>
    </section>
  );
}

/** The real inbox, compacted: live ticket rows with truthful status pills.
 *  Falls back to a small note, never a blank panel. */
function InboxPreview({ tickets, failed }: { tickets: Ticket[]; failed: boolean }) {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_70px_-30px_rgba(21,32,43,0.35)]">
        <div className="flex items-center gap-2.5 px-5 py-3.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-surface-2 text-text-2">
            <Icon name="inbox" size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold text-text">Shared inbox</p>
            <p className="text-[11px] text-text-3">every tenant, one queue</p>
          </div>
          <span className="l-chip">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-text/40" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-text-3" />
            </span>
            Live
          </span>
        </div>

        {failed ? (
          <div className="p-6 text-[12.5px] text-text-3">
            Demo data didn&apos;t load - the chat still works on the full page.
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col gap-3 p-5">
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
            <div className="skeleton h-12 rounded-xl" />
          </div>
        ) : (
          <ul className="flex flex-col">
            {tickets.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3.5 border-t border-border px-5 py-3.5 first:border-t-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-bold text-text-2">
                  {t.cust
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-text">{t.subject}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-text-3">
                    {t.cust} · {t.channel} · {t.time} ago
                  </p>
                </div>
                <Pill status={t.status} dot />
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-[11.5px] text-text-3">
            {tickets.length > 0 ? `${tickets.length} live tickets shown` : "loading…"}
          </p>
          <Link
            href={`/chat/${DEMO_TENANT_SLUG}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-text transition-colors duration-150 hover:text-primary-dark"
          >
            Open the widget
            <Icon name="arrow-right" size={13} />
          </Link>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute -bottom-5 -left-5 -z-10 hidden h-40 w-40 rounded-full opacity-70 lg:block"
        style={{
          background: "radial-gradient(circle, rgba(21,32,43,0.06) 0%, transparent 65%)",
        }}
      />
    </div>
  );
}
