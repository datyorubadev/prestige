"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "danger" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

export type ToastFn = {
  (text: string, tone?: ToastTone): void;
  success: (text: string) => void;
  danger: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
  warning: (text: string) => void;
};

const ToastContext = createContext<ToastFn | null>(null);

let nextId = 1;

const TONE_CONFIG: Record<
  string,
  { icon: IconName; iconBg: string; iconColor: string; borderColor: string }
> = {
  success: {
    icon: "check",
    iconBg: "bg-emerald-50 text-emerald-600 border border-emerald-200/60",
    iconColor: "text-emerald-600",
    borderColor: "border-border",
  },
  danger: {
    icon: "zap",
    iconBg: "bg-rose-50 text-rose-600 border border-rose-200/60",
    iconColor: "text-rose-600",
    borderColor: "border-rose-200",
  },
  error: {
    icon: "zap",
    iconBg: "bg-rose-50 text-rose-600 border border-rose-200/60",
    iconColor: "text-rose-600",
    borderColor: "border-rose-200",
  },
  info: {
    icon: "sparkles",
    iconBg: "bg-blue-50 text-blue-600 border border-blue-200/60",
    iconColor: "text-blue-600",
    borderColor: "border-blue-200",
  },
  warning: {
    icon: "zap",
    iconBg: "bg-amber-50 text-amber-600 border border-amber-200/60",
    iconColor: "text-amber-600",
    borderColor: "border-amber-200",
  },
};

/** Standard modern toast notification host (Sonner/Radix style).
 *  Clean white card, crisp border, soft shadow, icon badge, and dismiss button. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((text: string, tone: ToastTone = "success") => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      dismiss(id);
    }, 3200);
  }, [dismiss]);

  const toastHandler = useMemo(() => {
    const fn = ((text: string, tone: ToastTone = "success") => {
      addToast(text, tone);
    }) as ToastFn;

    fn.success = (text: string) => addToast(text, "success");
    fn.danger = (text: string) => addToast(text, "danger");
    fn.error = (text: string) => addToast(text, "danger");
    fn.info = (text: string) => addToast(text, "info");
    fn.warning = (text: string) => addToast(text, "warning");

    return fn;
  }, [addToast]);

  return (
    <ToastContext.Provider value={toastHandler}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[99999] flex flex-col items-end gap-2.5 max-w-sm w-full"
        aria-live="polite"
        role="region"
        aria-label="Notifications"
      >
        {items.map((t) => {
          const cfg = TONE_CONFIG[t.tone] ?? TONE_CONFIG.success;
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-[360px] items-center gap-3 rounded-lg border bg-white p-3.5 shadow-xl transition-all duration-200 animate-in fade-in slide-in-from-bottom-3",
                cfg.borderColor,
              )}
            >
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px]",
                  cfg.iconBg,
                )}
              >
                <Icon name={cfg.icon} size={13} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug text-text">
                  {t.text}
                </p>
              </div>

              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded-xs p-1 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
