/**
 * Tenant-timezone time formatting.
 *
 * The active tenant's IANA timezone is pushed here by auth-store whenever a
 * session is set/restored. All absolute timestamps in the app render in the
 * TENANT's local time — not the viewer's browser timezone.
 */

let tenantTz: string | null = null;

const BROWSER_TZ =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC";

export function setTenantTimezone(tz: string | null | undefined): void {
  tenantTz = tz && tz.trim() ? tz.trim() : null;
}

export function getTenantTimezone(): string {
  return tenantTz || BROWSER_TZ;
}

function fmt(iso: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: getTenantTimezone() }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** "Aug 22, 2026, 2:45 PM" */
export function fmtDateTime(iso: string | number | Date | null | undefined): string {
  return fmt(iso, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Aug 22, 2026" */
export function fmtDate(iso: string | number | Date | null | undefined): string {
  return fmt(iso, { month: "short", day: "numeric", year: "numeric" });
}

/** "2:45 PM" */
export function fmtTime(iso: string | number | Date | null | undefined): string {
  return fmt(iso, { hour: "numeric", minute: "2-digit" });
}

/** "Friday, Aug 22" */
export function fmtWeekday(iso: string | number | Date | null | undefined): string {
  return fmt(iso, { weekday: "long", month: "short", day: "numeric" });
}
