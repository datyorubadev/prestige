"use client";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import {
  passwordChecks,
  passwordScore,
  passwordStrength,
  passwordStrengthLabel,
  type PasswordStrength,
} from "@/lib/password";

const SEGMENTS = 4;

const TONES: Record<Exclude<PasswordStrength, "empty">, { bar: string; label: string }> = {
  weak: { bar: "bg-danger", label: "text-danger" },
  fair: { bar: "bg-warning", label: "text-warning-dark" },
  strong: { bar: "bg-primary", label: "text-primary-dark" },
};

/** Live password strength (design-system meter): 4 segments + requirement
 *  checklist. Every check is conveyed by icon + text, never color alone.
 *  Rules are shown before the user types (competitor norm), then check off
 *  as you type. */
export function PasswordStrength({ password, className }: { password: string; className?: string }) {
  const strength = passwordStrength(password);
  const score = passwordScore(password);
  const checks = passwordChecks(password);
  const tone = strength === "empty" ? null : TONES[strength];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2" aria-live="polite">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-180",
                i < score && tone ? tone.bar : "bg-surface-3",
              )}
            />
          ))}
        </div>
        {strength !== "empty" && (
          <span className={cn("text-micro font-bold", tone?.label)}>{passwordStrengthLabel(strength)}</span>
        )}
      </div>

      <ul className="grid grid-cols-1 gap-1">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-1.5 text-[11.5px]">
            <span
              className={cn(
                "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full",
                c.ok ? "bg-primary text-white" : "bg-surface-3 text-text-3",
              )}
            >
              {c.ok && <Icon name="check" size={9} strokeWidth={3} />}
            </span>
            <span className={c.ok ? "text-text-2" : "text-text-3"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
