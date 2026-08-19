"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  icon?: IconName;
  iconColor?: string;
  /** Presence dot color — renders a small colored circle before the label. */
  dotColor?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Compact toolbar/header variant (smaller padding + chevron). */
  size?: "md" | "sm";
  /** Open the panel upward (for controls anchored near the bottom edge,
   *  e.g. a pagination footer, so the dropdown isn't clipped). */
  up?: boolean;
  align?: "left" | "right";
  className?: string;
  id?: string;
  ariaLabel?: string;
}

/** Branded single-select dropdown (design.md §4.1). Portaled to document.body
 *  with fixed positioning so it NEVER gets clipped by modals or scroll boxes. */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  size = "md",
  up = false,
  align,
  className,
  id,
  ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const selected = options.find(
    (o) => o.value === value || o.value.toLowerCase() === (value || "").toLowerCase(),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const modal = rootRef.current.closest(".modal-panel, .modal-body, [role='dialog']");
    const bottomLimit = modal
      ? modal.getBoundingClientRect().bottom - 50
      : window.innerHeight;
    const spaceBelow = bottomLimit - rect.bottom;
    const isUp = up || (spaceBelow < 200 && rect.top > 160);
    const panelWidth = Math.max(rect.width, 160);
    const shouldAlignRight = align === "right" || (rect.left + panelWidth > window.innerWidth - 16);

    const style: React.CSSProperties = {
      position: "fixed",
      width: `${panelWidth}px`,
      zIndex: 99999,
    };

    if (shouldAlignRight) {
      style.right = `${window.innerWidth - rect.right}px`;
    } else {
      style.left = `${rect.left}px`;
    }

    if (isUp) {
      style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      style.top = `${rect.bottom + 4}px`;
    }

    setPanelStyle(style);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onScrollOrResize = () => updatePosition();
    const onDown = (e: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node) &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, up]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const panel =
    open && mounted ? (
      <div
        ref={panelRef}
        role="listbox"
        aria-label={ariaLabel ?? placeholder}
        style={panelStyle}
        className="menu-panel max-h-[220px] overflow-y-auto p-1 border border-border bg-surface text-text shadow-lg animate-in fade-in zoom-in-95 duration-150"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!selected && placeholder && (
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => choose("")}
            className={cn("menu-item", value === "" && "active")}
          >
            {placeholder}
          </button>
        )}
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={value === o.value}
            onClick={() => choose(o.value)}
            className={cn("menu-item flex items-center gap-2", value === o.value && "active")}
          >
            {o.icon && <Icon name={o.icon} size={14} className={cn("shrink-0", o.iconColor)} />}
            {o.dotColor && !o.icon && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: o.dotColor }} />}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className={cn("dd relative", open && "z-[100]", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={cn("dd-trigger focus-ring-soft", size === "sm" && "sm")}
      >
        <span className={cn("dd-value flex items-center gap-2 min-w-0 truncate", !selected && "dd-placeholder")}>
          {selected?.icon && (
            <Icon name={selected.icon} size={14} className={cn("shrink-0", selected.iconColor)} />
          )}
          {selected?.dotColor && !selected?.icon && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selected.dotColor }} />}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <Icon name="chevron-down" size={size === "sm" ? 14 : 16} className="dd-chevron" />
      </button>

      {panel && createPortal(panel, document.body)}
    </div>
  );
}
