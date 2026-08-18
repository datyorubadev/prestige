"use client";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Lucide-style icon shown in a muted chip (defaults to the inbox glyph). */
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** Primary call-to-action (a button). Rendered below the copy. */
  action?: React.ReactNode;
  className?: string;
}

/** Standard empty state (design §4.3) — muted icon chip + bold title + quiet
 *  subtitle + one action, centred and transparent (no card/box behind it).
 *  An empty screen is an invitation to act, never a blank. */
export function EmptyState({ icon = "inbox", title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 h-full min-h-[280px] w-full flex-col items-center justify-center gap-2 px-6 py-12 text-center my-auto",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-text-3">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-[13.5px] font-semibold text-text">{title}</p>
      {subtitle && (
        <p className="max-w-[320px] text-[12.5px] leading-relaxed text-text-3">{subtitle}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
