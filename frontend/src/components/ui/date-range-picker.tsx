"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type DateRangePreset = "today" | "7d" | "14d" | "30d" | "90d" | "ytd" | "custom";

export interface DateRange {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  label: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const PRESETS: { preset: DateRangePreset; label: string }[] = [
  { preset: "today", label: "Today" },
  { preset: "7d", label: "Last 7 days" },
  { preset: "14d", label: "Last 14 days" },
  { preset: "30d", label: "Last 30 days" },
  { preset: "90d", label: "Last 90 days" },
  { preset: "ytd", label: "Year to date" },
  { preset: "custom", label: "Custom range" },
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [showCustomFields, setShowCustomFields] = useState(value.preset === "custom");
  const [customStart, setCustomStart] = useState(value.startDate ?? "");
  const [customEnd, setCustomEnd] = useState(value.endDate ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const selectPreset = (p: DateRangePreset, label: string) => {
    if (p !== "custom") {
      setShowCustomFields(false);
      onChange({ preset: p, label });
      setOpen(false);
    } else {
      setShowCustomFields(true);
    }
  };

  const applyCustom = () => {
    if (customStart && customEnd) {
      onChange({
        preset: "custom",
        startDate: customStart,
        endDate: customEnd,
        label: `${customStart} – ${customEnd}`,
      });
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className={cn("relative inline-block text-left", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-[12.5px] font-medium text-text shadow-xs outline-none focus:outline-none"
      >
        <span className="flex items-center gap-2">
          <Icon name="sliders" size={14} className="text-text-3" />
          <span>{value.label}</span>
        </span>
        <Icon name="chevron-down" size={13} className="text-text-3" />
      </button>

      {open && (
        <div className="menu-panel absolute right-0 top-full z-50 mt-1.5 w-60 p-1.5 shadow-lg border border-border rounded-xl bg-surface animate-in fade-in zoom-in-95 duration-100">
          <div className="space-y-0.5">
            {PRESETS.map((p) => {
              const isSelected = value.preset === p.preset;
              return (
                <button
                  key={p.preset}
                  type="button"
                  onClick={() => selectPreset(p.preset, p.label)}
                  className={cn(
                    "menu-item flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[12.5px] font-medium outline-none",
                    isSelected
                      ? "bg-primary-soft/60 font-semibold text-primary-dark"
                      : "text-text",
                  )}
                >
                  <span>{p.label}</span>
                  {isSelected && <Icon name="check" size={13} className="text-primary" />}
                </button>
              );
            })}
          </div>

          {(showCustomFields || value.preset === "custom") && (
            <div className="mt-2 border-t border-border/70 pt-2.5 px-1 space-y-2.5">
              <div className="flex flex-col gap-1 text-[11px] font-semibold text-text-3 uppercase tracking-wider">
                <span>Start Date</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 rounded-md border border-border bg-surface px-2.5 text-[12px] text-text outline-none transition-colors hover:border-border-strong focus:border-primary-border"
                />
              </div>
              <div className="flex flex-col gap-1 text-[11px] font-semibold text-text-3 uppercase tracking-wider">
                <span>End Date</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 rounded-md border border-border bg-surface px-2.5 text-[12px] text-text outline-none transition-colors hover:border-border-strong focus:border-primary-border"
                />
              </div>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customStart || !customEnd}
                className="w-full h-8 rounded-md bg-primary hover:bg-primary-dark text-[12px] font-semibold text-white shadow-xs transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed outline-none"
              >
                Apply Range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
