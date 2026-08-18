"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  invalid?: boolean;
}

/** Password field with show/hide toggle. Real <button>, aria-label flips
 *  between "Show password" / "Hide password" (NIST allows reveal; the toggle
 *  defaults to hidden). */
export function PasswordInput({ className, invalid, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        aria-invalid={invalid || undefined}
        className={cn("input-control pr-10", invalid && "!border-danger", className)}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 flex h-[26px] w-[26px] -translate-y-1/2 items-center justify-center rounded-md text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text-2"
      >
        <Icon name={visible ? "eye-off" : "eye"} size={16} />
      </button>
    </div>
  );
}
