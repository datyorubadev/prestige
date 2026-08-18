"use client";

import type { ReactNode } from "react";
import { cn, labelStyleFor } from "@/lib/utils";
import type { Label } from "@/lib/types";

/** Colored label chip sourced from the per-tenant label library (Chatwoot
 *  parity). Falls back to a stable auto color when the label is not in the
 *  library yet. Pass optional children (e.g. a remove button). */
export function LabelChip({
  name,
  labels,
  className,
  title,
  children,
}: {
  name: string;
  labels?: Label[];
  className?: string;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <span
      title={title}
      style={labelStyleFor(name, labels)}
      className={cn(
        "inline-flex max-w-[160px] items-center truncate rounded-sm px-1.5 py-px text-[10px] font-bold uppercase tracking-wide",
        className,
      )}
    >
      <span className="truncate">{name}</span>
      {children}
    </span>
  );
}