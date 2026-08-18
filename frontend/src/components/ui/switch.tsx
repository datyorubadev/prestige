"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name (the setting it toggles). */
  label: string;
  className?: string;
}

/** Branded toggle switch (design.md §4.1 Toggle): 38×22px track, 16px thumb. */
export function Switch({ checked, onChange, disabled, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        checked ? "border-primary bg-primary" : "border-border bg-surface-3",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow-sm transition-transform duration-150",
          checked ? "translate-x-[16px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
