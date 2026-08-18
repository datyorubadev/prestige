"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: "right" | "top" | "bottom" | "left";
  className?: string;
  tooltipClassName?: string;
}

/**
 * Sleek floating tooltip rendered via Portal to document.body.
 * Avoids any overflow clipping issues inside scrollable sidebars or card views.
 */
export function Tooltip({ content, children, side = "right", className, tooltipClassName }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (side === "right") {
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
      });
    } else if (side === "top") {
      setCoords({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    } else if (side === "bottom") {
      setCoords({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    } else {
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.left - 8,
      });
    }
  };

  const show = () => {
    updateCoords();
    setVisible(true);
  };

  const hide = () => {
    setVisible(false);
  };

  if (!content) return <>{children}</>;

  return (
    <div
      ref={triggerRef}
      className={cn("inline-flex items-center justify-center", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible &&
        mounted &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform:
                side === "right"
                  ? "translateY(-50%)"
                  : side === "left"
                    ? "translate(-100%, -50%)"
                    : side === "top"
                      ? "translate(-50%, -100%)"
                      : "translate(-50%, 0)",
            }}
            className={cn(
              "pointer-events-none z-[99999] whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg animate-fadeIn",
              tooltipClassName,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}
