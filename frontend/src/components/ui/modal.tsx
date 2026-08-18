"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: IconName;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Optional id/aria-label for the dialog. Defaults to the title. */
  ariaLabel?: string;
}

/** Branded overlay surface (design.md §4.1 Modal): slides up over a faded
 * overlay, traps focus, Esc or overlay-click closes, focus returns to the
 * opener on close. */
export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  size = "md",
  ariaLabel,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // Keep onClose out of the effect deps: parents pass inline closures that are
  // recreated on every render, which would tear down + re-run the focus trap on
  // each keystroke and yank focus out of the open dialog.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      panel.focus();
      // Keep scroll on the body, not the page behind the overlay.
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCloseRef.current();
      };
      window.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("keydown", onKey);
        document.body.style.overflow = prevOverflow;
        restoreRef.current?.focus?.();
      };
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        className={cn("modal-panel", size !== "md" && size)}
      >
        {title && (
          <header className="modal-header">
            <h2 className="modal-title">
              {icon && <Icon name={icon} size={16} className="text-text-2" />}
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="modal-close"
            >
              <Icon name="close" size={18} />
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
