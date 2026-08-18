import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

interface CardProps {
  title?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  /** pad0 → no padding, overflow hidden (tables edge-to-edge). Default body padding 18px. */
  pad0?: boolean;
  className?: string;
  children: ReactNode;
}

/** Surface grouping (design.md §4.2 Cards & grids). Clean resting white surface without unwanted hover background. */
export function Card({ title, icon, actions, pad0, className, children }: CardProps) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface shadow-xs", className)}>
      {title && (
        <header className="flex items-center gap-2 border-b border-border/80 px-4.5 py-3">
          {icon && <Icon name={icon} size={15} className="text-text-3" />}
          <h3 className="text-[13.5px] font-bold tracking-tight text-text">{title}</h3>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(pad0 ? "overflow-hidden" : "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}
