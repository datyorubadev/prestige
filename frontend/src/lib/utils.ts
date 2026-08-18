import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Label } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Public demo tenant slug (seeded "NairaWave Fintech", id "t1"). Public
 *  routes (/chat/:id, /portal/:id, /widget-embed, register) resolve by slug
 *  or id, so demo/deep links reference the slug — the internal "t1" id is
 *  only used as a last-resort fallback when no user/param is available. */
export const DEMO_TENANT_SLUG = "nairawave";

/** Generate standardized ticket number TCKYYYYMMDDxxxxxx */
export function generateTicketNumber(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `TCK${yyyy}${mm}${dd}${rand}`;
}

/** Human-facing ticket number for display. Prefers the backend-provided
 *  ticketNumber ({prefix}{YYYYMMDD}{6 digits}); falls back to the raw id when
 *  the DTO didn't carry one (mock or optimistic tickets), and to the legacy
 *  TCK formatter for anything else. */
export function ticketNumberFor(ticket: {
  id?: string;
  ticketNumber?: string;
}): string {
  if (ticket?.ticketNumber) return ticket.ticketNumber;
  if (!ticket?.id) return formatTicketId();
  if (ticket.id.startsWith("TK-") || ticket.id.startsWith("PT-")) return ticket.id;
  if (ticket.id.includes("-")) return formatTicketId(ticket.id);
  return ticket.id;
}

/** Case-insensitive deep-link match: true when a ticket's raw id OR its
 *  human-readable number (e.g. "NAI20260815561159") equals the needle. Ids and
 *  numbers are interchangeable in /dashboard/tickets/:id routes, so lookups
 *  must never depend on the raw id shape. */
export function ticketMatches(
  ticket: { id?: string; ticketNumber?: string } | null | undefined,
  needle: string,
): boolean {
  const n = String(needle ?? "").trim().toLowerCase();
  if (!ticket || !n) return false;
  if (ticket.id && ticket.id.toLowerCase() === n) return true;
  return ticketNumberFor(ticket).toLowerCase() === n;
}

export function formatTicketId(id?: string): string {
  if (!id) return "TCK20260813871042";
  if (id.startsWith("TCK") && id.length >= 15) return id;
  const digits = id.replace(/\D/g, "");
  const suffix = (digits || "871042").slice(-6).padStart(6, "871042");
  return `TCK20260813${suffix}`;
}

/** The seeded library colors — kept in sync with backend scripts/db_setup.py
 *  SEED_LABELS so mock and real mode render identical chips. */
export const LABEL_LIBRARY_COLORS: Record<string, string> = {
  refund: "#0d8f63",
  transfers: "#2563eb",
  alerts: "#0891b2",
  "high-value": "#7c3aed",
  urgent: "#d93636",
  "how-to": "#b98800",
  security: "#2563eb",
  card: "#7c3aed",
  app: "#0d8f63",
  bug: "#d93636",
  bills: "#0891b2",
  profile: "#b98800",
  savings: "#2563eb",
  delivery: "#0d8f63",
  atm: "#0891b2",
  ussd: "#b98800",
  resolved: "#0d8f63",
};

/** Stable fallback palette for labels outside the library (auto-created). */
const FALLBACK_FG = ["#0d8f63", "#2563eb", "#7c3aed", "#d93636", "#b98800", "#0891b2", "#db2777", "#ea580c"];

/** Swatches offered in the label-creation color picker. */
export const LABEL_COLOR_PALETTE = [
  "#0d8f63",
  "#2563eb",
  "#7c3aed",
  "#d93636",
  "#b98800",
  "#0891b2",
  "#db2777",
  "#ea580c",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Resolve a label's hex color: library entry → seeded map → stable hash. */
export function labelColorFor(name: string, library?: Label[]): string {
  if (library) {
    const hit = library.find((l) => l.name === name);
    if (hit?.color) return hit.color;
  }
  return LABEL_LIBRARY_COLORS[name] ?? FALLBACK_FG[hashName(name) % FALLBACK_FG.length];
}

/** Inline style for a label chip — colored by the label library (with a soft
 *  bg tint derived from the fg hex). Falls back to the index palette. */
export function labelStyleFor(name: string, library?: Label[]): Record<string, string> {
  const fg = labelColorFor(name, library);
  return { color: fg, backgroundColor: `color-mix(in srgb, ${fg} 12%, white)` };
}

/** Canonical label vocabulary for add-label menus (seed + common extras). */
export const LABEL_OPTIONS = [
  "refund",
  "transfers",
  "alerts",
  "high-value",
  "urgent",
  "how-to",
  "security",
  "card",
  "app",
  "bug",
  "bills",
  "profile",
  "savings",
  "delivery",
  "atm",
  "ussd",
];

/** "₦45,000" — thousands separators, no decimals. */
export function formatNgn(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}

/** "2m", "18m", "1h", "2d", "Jul 22" (mock dataset format) → short label. */
export function timeAgo(input: string | number | Date): string {
  if (typeof input === "string") return input;
  const seconds = Math.floor((Date.now() - new Date(input).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(input).toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

/** Initials for a full name, max 2 chars. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Channel → display label. */
export function channelLabel(channel: string): string {
  switch (channel) {
    case "chat":
      return "Chat";
    case "whatsapp":
      return "WhatsApp";
    case "portal":
      return "Portal";
    case "email":
      return "Email";
    default:
      return channel;
  }
}

/** A ticket is finished (no composer, no handover, footer shows the resolved
 *  pill) when its status is resolved OR closed. Single source of truth so the
 *  list, the workspace header and the context rail never disagree. */
export function isResolved(status: string): boolean {
  return status === "resolved" || status === "closed";
}

const AVATAR_PALETTE = ["green", "violet", "blue", "amber", "slate"];

/** Deterministic avatar gradient per person (design.md §4.1 — same person, same color). */
export function avatarColorFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}
