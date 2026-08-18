import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui/pill";
import { Reveal } from "@/components/landing/reveal";

function Cell({
  icon,
  title,
  body,
  children,
  className,
  delay = 0,
}: {
  icon: "inbox" | "bot" | "sliders" | "book" | "smile";
  title: string;
  body: string;
  children?: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <div className="flex h-full flex-col rounded-2xl bg-surface p-6 shadow-[0_1px_2px_rgba(21,32,43,0.04)] ring-1 ring-border lg:p-7">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-text-2">
          <Icon name={icon} size={18} />
        </span>
        <h3 className="mt-5 font-display text-[16px] font-bold text-text">{title}</h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">{body}</p>
        {children && <div className="mt-6 flex-1">{children}</div>}
      </div>
    </Reveal>
  );
}

/** Features — bento grid (2+3), not rows of identical cards. Every cell's
 *  preview is the real UI pattern, not a fake screenshot. */
export function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
        <Reveal>
          <h2 className="max-w-2xl font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-text sm:text-[38px]">
            Everything a support team needs.
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-2">
            No dashboard soup - the inbox, the widget, the help center and the
            rules that connect them, all in one calm surface.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6">
          <Cell
            icon="inbox"
            title="One shared inbox for every queue"
            body="Chat, email and portal tickets from all your tenants land in a single three-pane inbox. Agents stop switching tabs and start resolving."
            className="md:col-span-6 lg:col-span-4"
          >
            <MiniTickets />
          </Cell>

          <Cell
            icon="bot"
            title="AI answers, then hands off"
            body="The assistant streams replies in real time. Ask for a human and the thread moves to an agent - no re-explaining, no dead end."
            className="md:col-span-3 lg:col-span-2"
            delay={80}
          >
            <MiniChat />
          </Cell>

          <Cell
            icon="sliders"
            title="Escalation rules with teeth"
            body="Rules decide when a human steps in and how fast. Handovers carry a visible SLA, and overdue conversations get loud."
            className="md:col-span-3 lg:col-span-2"
          >
            <MiniEscalation />
          </Cell>

          <Cell
            icon="book"
            title="A help center that answers first"
            body="Publish articles your customers can find. Every answer ends with “Did this help?” and a fallback to a human."
            className="md:col-span-3 lg:col-span-2"
            delay={80}
          >
            <MiniHelpCenter />
          </Cell>

          <Cell
            icon="smile"
            title="CSAT in the conversation"
            body="Resolved chats close with a five-face scale in the thread - optional, one per conversation, never a pop-up wall."
            className="md:col-span-3 lg:col-span-2"
            delay={160}
          >
            <MiniCsat />
          </Cell>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Real UI pattern previews — compact, non-interactive slices of the   */
/* actual components (ticket rows, bubbles, handover, KB, CSAT).       */
/* ------------------------------------------------------------------ */

const TICKETS = [
  { who: "AK", subject: "Refund for failed transfer", time: "2m", status: "Escalated" },
  { who: "DE", subject: "Delivery delayed to Ota", time: "18m", status: "In progress" },
  { who: "MK", subject: "Can't reset my PIN", time: "1h", status: "Resolved" },
];

function MiniTickets() {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-2/60">
      {TICKETS.map((t) => (
        <div key={t.subject} className="flex items-center gap-3 px-3.5 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[10.5px] font-bold text-text-2">
            {t.who}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-text">{t.subject}</p>
            <p className="text-[11px] text-text-3">{t.time} ago · chat</p>
          </div>
          <Pill status={t.status} />
        </div>
      ))}
    </div>
  );
}

function MiniChat() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex max-w-[88%] items-start gap-1.5 self-start rounded-xl rounded-bl-sm border border-border bg-surface-2/60 px-2.5 py-1.5">
        <Icon name="bot" size={12} className="mt-0.5 shrink-0 text-text-2" />
        <p className="text-[11.5px] leading-snug text-text">
          I can check that transfer for you. Give me the reference number?
        </p>
      </div>
      <div className="max-w-[88%] self-end rounded-xl rounded-br-sm bg-text px-2.5 py-1.5 text-[11.5px] leading-snug text-white">
        talk to a human
      </div>
      <div className="flex items-center gap-1.5 self-center rounded-full bg-warning-soft px-2.5 py-1 text-[10.5px] font-bold text-warning-dark">
        <Icon name="zap" size={11} />
        Handed off to a human agent
      </div>
    </div>
  );
}

function MiniEscalation() {
  return (
    <div className="rounded-xl border border-warning-border bg-warning-soft p-3">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-warning-dark">
        Handover to Tier 2
      </p>
      <p className="mt-1 text-[11.5px] leading-snug text-text-2">
        Escalated after 2 failed AI answers. SLA target: 10 minutes.
      </p>
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-bold text-text-2">
        <Icon name="clock" size={11} className="text-warning-dark" />
        08:42 remaining
      </div>
    </div>
  );
}

const KB = [
  { title: "How transfers work", tag: "5 min read" },
  { title: "Refunds and timelines", tag: "3 min read" },
];

function MiniHelpCenter() {
  return (
    <div className="flex flex-col gap-1.5">
      {KB.map((a) => (
        <div
          key={a.title}
          className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3 py-2"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-surface text-text-2">
            <Icon name="book" size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-text">{a.title}</p>
            <p className="text-[10.5px] text-text-3">{a.tag} · did this help?</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniCsat() {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-3 py-3 text-center">
      <p className="text-[11.5px] font-bold text-text">How did we do?</p>
      <div className="mt-2 flex items-center justify-center gap-2 text-[19px] leading-none" aria-hidden="true">
        <span className="opacity-50 grayscale">😞</span>
        <span className="opacity-50 grayscale">😕</span>
        <span className="opacity-50 grayscale">😐</span>
        <span className="opacity-100">🙂</span>
        <span className="opacity-50 grayscale">😍</span>
      </div>
      <p className="mt-2 text-[10.5px] font-semibold text-text-3">One rating per conversation</p>
    </div>
  );
}
