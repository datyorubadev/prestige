import { cn } from "@/lib/utils";

export type PillTone = "success" | "warning" | "danger" | "neutral" | "info" | "violet";

const TONES: Record<PillTone, string> = {
  success: "bg-primary-soft text-primary-dark",
  warning: "bg-warning-soft text-warning-dark",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-[#eef1f5] text-text-2",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
};

/** Status string → pill tone (design.md §4.1 reserved set). */
export function toneForStatus(status: string): PillTone {
  switch (status) {
    case "active":
    case "online":
    case "paid":
    case "success":
    case "resolved":
    case "completed":
      return "success";
    case "pending":
    case "warn":
    case "trial":
    case "waiting_for_customer":
      return "warning";
    case "escalated":
    case "high":
    case "overdue":
    case "suspended":
    case "over":
    case "past_due":
      return "danger";
    case "info":
    case "medium":
    case "open":
    case "unassigned":
    case "in_progress":
      return "info";
    case "waiting_internal":
      return "neutral";
    case "violet":
      return "violet";
    default:
      return "neutral";
  }
}

interface PillProps {
  status: string;
  tone?: PillTone;
  dot?: boolean;
  className?: string;
}

/** Compact status pill — state is conveyed in text, never color alone. */
export function Pill({ status, tone, dot, className }: PillProps) {
  const resolved = tone ?? toneForStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-normal",
        TONES[resolved],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-current" />}
      {status}
    </span>
  );
}
