"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AutosizeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onEnter?: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Minimum visible rows (grows from here on overflow). */
  minRows?: number;
  /** Cap before the composer scrolls internally (Zendesk-style). */
  maxRows?: number;
  disabled?: boolean;
  className?: string;
}

/** Auto-growing composer textarea (guide §6.2 + v3.3). Grows from `minRows`
 *  up to `maxRows`, then scrolls — the behaviour agents expect from
 *  Intercom/Zendesk composers, never a scroll-while-typing single line. */
export function AutosizeTextarea({
  value,
  onChange,
  onKeyDown,
  onPaste,
  onEnter,
  placeholder,
  ariaLabel,
  minRows = 1,
  maxRows = 5,
  disabled,
  className,
}: AutosizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const computedLineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
    const lineHeight = isNaN(computedLineHeight) || computedLineHeight <= 0 ? 18 : computedLineHeight;
    const singleLineHeight = lineHeight * minRows;
    const maxHeight = Math.max(lineHeight * maxRows - 8, singleLineHeight); // reduced fixed height by 8px
    if (!value || (!value.includes("\n") && el.scrollHeight <= singleLineHeight + 8)) {
      el.style.height = `${singleLineHeight}px`;
    } else {
      el.style.height = `${Math.min(Math.max(el.scrollHeight, singleLineHeight), maxHeight)}px`;
    }
  }, [value, minRows, maxRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === "Enter" && !e.shiftKey && onEnter && !e.isDefaultPrevented()) {
          e.preventDefault();
          onEnter(value);
        }
      }}
      rows={minRows}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        "resize-none overflow-y-auto outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 border-0 border-none shadow-none",
        className,
      )}
      style={{ outline: "none", boxShadow: "none" }}
    />
  );
}
