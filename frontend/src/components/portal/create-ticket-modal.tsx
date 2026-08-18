"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Ticket, TicketPriority, TicketType } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CATEGORIES: (SelectOption & { type: TicketType })[] = [
  { value: "payments", label: "Payments & transfers", type: "request" },
  { value: "cards", label: "Cards & security", type: "complaint" },
  { value: "account", label: "Account & profile", type: "request" },
  { value: "billing", label: "Billing & invoices", type: "inquiry" },
  { value: "other", label: "Something else", type: "unclassified" },
];

const URGENCIES: (SelectOption & { priority: TicketPriority })[] = [
  { value: "low", label: "It can wait", priority: "low" },
  { value: "medium", label: "Needs attention", priority: "medium" },
  { value: "high", label: "It's urgent", priority: "high" },
];

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  /** Tenant the ticket is raised against (portal route). Defaults to the
   *  signed-in user's tenant. */
  tenantId?: string;
  /** Called with the created ticket so callers can refresh/navigate. */
  onCreated?: (ticket: Ticket) => void;
}

/** Customer "contact support" form — the modal home of ticket creation
 *  (design.md §4.1 Modal + §5 Patterns). Email/subject/message are required;
 *  category and urgency are brand Selects; submit swaps to a spinner. */
export function CreateTicketModal({ open, onClose, tenantId, onCreated }: CreateTicketModalProps) {
  const { user } = useAuth();
  const tenant = tenantId ?? user?.tenantId ?? "t1";

  const [email, setEmail] = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [urgency, setUrgency] = useState("medium");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<Ticket | null>(null);

  // Callers mount this component only while open ({createOpen && …}), so the
  // form state below is already fresh per open — no reset-on-effect needed.

  const canSubmit =
    EMAIL_RE.test(email.trim()) &&
    subject.trim().length >= 4 &&
    message.trim().length >= 10 &&
    !sending;

  const submit = async () => {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const categoryDef = CATEGORIES.find((c) => c.value === category);
      const urgencyDef = URGENCIES.find((u) => u.value === urgency);
      const ticket = await api.post<Ticket>("/portal/tickets", {
        tenantId: tenant,
        email: email.trim(),
        cust: user?.fullName ?? email.split("@")[0],
        subject: subject.trim(),
        text: message.trim(),
        type: categoryDef?.type ?? "unclassified",
        priority: urgencyDef?.priority ?? "medium",
        channel: "portal",
      });
      setCreated(ticket);
      onCreated?.(ticket);
    } catch {
      setError("Couldn't submit your ticket — check your connection and try again.");
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={sending ? () => {} : onClose}
      title={created ? "Ticket submitted" : "Contact support"}
      icon={created ? undefined : "send"}
      size="md"
      ariaLabel="Contact support"
    >
      {!user ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="lock" size={22} />
          </span>
          <div>
            <p className="text-[15px] font-bold text-text">Login or register to raise a ticket</p>
            <p className="mx-auto mt-1 max-w-[320px] text-[13px] leading-relaxed text-text-2">
              We need to know who you are so we can track your request and keep you posted on
              replies.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/portal/${tenant}/login?raise=1`}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
            >
              <Icon name="user" size={14} />
              Login
            </Link>
            <Link
              href={`/portal/${tenant}/register?raise=1`}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text transition-colors duration-150 hover:bg-surface-2"
            >
              <Icon name="users" size={14} />
              Register
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 text-[12px] font-medium text-text-3 transition-colors duration-150 hover:text-text-2"
          >
            Continue browsing as guest
          </button>
        </div>
      ) : created ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="check" size={22} />
          </span>
          <div>
            <p className="text-[15px] font-bold text-text">
              Ticket <span className="font-mono">{created.id}</span> created
            </p>
            <p className="mx-auto mt-1 max-w-[320px] text-[13px] leading-relaxed text-text-2">
              A support agent will pick it up shortly. You can track it anytime under{" "}
              <span className="font-semibold text-text">My tickets</span>.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/chat/${user?.tenantId ?? "t1"}?email=${encodeURIComponent(created.email)}`}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
            >
              <Icon name="inbox" size={14} />
              Open conversation
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text transition-colors duration-150 hover:bg-surface-2"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Your email" required>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </Field>
            <Field label="Urgency" required>
              <Select
                value={urgency}
                onChange={setUrgency}
                options={URGENCIES}
                ariaLabel="Urgency"
              />
            </Field>
          </div>

          <Field label="Subject" required>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What do you need help with?"
              className={inputClass}
            />
          </Field>

          <Field label="Category">
            <Select
              value={category}
              onChange={setCategory}
              placeholder="Choose a category…"
              options={CATEGORIES}
              ariaLabel="Category"
            />
          </Field>

          <Field label="Tell us more" required>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Describe what happened, when it happened, and anything we should know…"
              className={cn(inputClass, "min-h-[110px] resize-y")}
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}

          <p className="text-[12px] leading-relaxed text-text-3">
            We usually reply within a couple of hours during support hours. Adding an email lets us
            keep you posted even after you leave.
          </p>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text transition-colors duration-150 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex min-w-[120px] items-center justify-center gap-1.5 rounded-sm bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <>
                  <Spinner size={14} />
                  Submitting…
                </>
              ) : (
                <>
                  <Icon name="send" size={14} />
                  Submit ticket
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-text">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "focus-ring-soft w-full rounded-sm border border-border bg-surface px-3 py-2.5 text-[13.5px] text-text placeholder:text-text-3";
