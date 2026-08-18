"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { datasetIcon } from "@/lib/icons-map";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/lib/types";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void api
      .get<NotificationItem[]>("/notifications")
      .then((n) => {
        if (active) setItems(n ?? []);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        bellRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const displayedItems = useMemo(() => {
    if (filter === "unread") return items.filter((n) => n.unread);
    return items;
  }, [items, filter]);

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
    void api.post("/notifications/read-all").catch(() => {});
  };

  const openItem = (n: NotificationItem, i: number) => {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, unread: false } : x)));
    setOpen(false);
    if (n.target) router.push(n.target);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={bellRef}
        type="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-border bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-bold leading-none text-white shadow-2xs">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] rounded-xl border border-border bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden text-text"
            role="menu"
            aria-labelledby="notif-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-text" id="notif-title">
                  Notifications
                </span>
                {unread > 0 && (
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10.5px] font-bold text-danger">
                    {unread} new
                  </span>
                )}
              </div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[12px] font-semibold text-primary hover:text-primary-dark transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center border-b border-border bg-surface-2/60 px-3 py-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-150",
                  filter === "all"
                    ? "bg-surface text-text shadow-2xs"
                    : "text-text-3 hover:text-text",
                )}
              >
                All ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-150",
                  filter === "unread"
                    ? "bg-surface text-text shadow-2xs"
                    : "text-text-3 hover:text-text",
                )}
              >
                Unread ({unread})
              </button>
            </div>

            {/* Notification List */}
            <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60 custom-scrollbar">
              {displayedItems.length === 0 && (
                <EmptyState
                  icon="bell"
                  title={filter === "unread" ? "No unread alerts" : "No notifications"}
                  subtitle={
                    filter === "unread"
                      ? "You have read all pending notifications."
                      : "You're all caught up! New alerts and ticket updates will appear here."
                  }
                  className="min-h-[180px] py-6 my-0"
                />
              )}
              {displayedItems.map((n, i) => (
                <button
                  key={`${n.title}-${i}`}
                  type="button"
                  role="menuitem"
                  onClick={() => openItem(n, i)}
                  className={cn(
                    "flex w-full items-start gap-3 p-3.5 text-left transition-colors duration-150 outline-none hover:bg-surface-2",
                    n.unread && "bg-primary-soft/20",
                  )}
                >
                  <span
                    className="mt-0.5 flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-lg shadow-2xs"
                    style={{ color: n.color, backgroundColor: `${n.color}1a` }}
                  >
                    <Icon name={datasetIcon(n.ic)} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium leading-snug text-text">
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-text-3">{n.meta}</p>
                  </div>
                  {n.unread && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
