"use client";

import { Modal } from "@/components/ui/modal";
import { Icon, type IconName } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Consequences of the action — one or two short sentences. */
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Spinner on the confirm button while the action is in flight. */
  busy?: boolean;
  /** danger = red confirm (delete/suspend), primary = brand confirm (reset). */
  tone?: "danger" | "primary";
  icon?: IconName;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmation dialog (design.md §4.1 Modal — "confirm delete"). Wraps the
 *  base Modal with a single focused action so destructive or irreversible
 *  steps (delete, suspend, reset) require an explicit second click. */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  tone = "danger",
  icon = "alert-triangle",
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={icon}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
              tone === "danger"
                ? "bg-danger hover:bg-danger/90"
                : "bg-primary hover:bg-primary-dark",
            )}
          >
            {busy ? <Spinner size={14} /> : <Icon name={icon} size={14} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-text-2">{description}</div>
    </Modal>
  );
}
