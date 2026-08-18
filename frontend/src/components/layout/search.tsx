"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui/pill";
import { ArticleViewer } from "@/components/portal/article-viewer";
import { cn, ticketNumberFor } from "@/lib/utils";
import type { KnowledgeArticle, Ticket } from "@/lib/types";

export function SearchBox() {
  const { user } = useAuth();
  const router = useRouter();
  const isCustomer = user?.role === "customer";
  const myEmail = user?.email?.toLowerCase();
  const tenantId = user?.tenantId ?? "t1";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const dataLoadedRef = useRef(false);

  const loadData = () => {
    if (dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    let active = true;
    if (isCustomer) {
      void api
        .get<KnowledgeArticle[]>(`/portal/articles?tenantId=${encodeURIComponent(tenantId)}`)
        .then((a) => {
          if (active) setArticles(a);
        })
        .catch(() => {
          if (active) setArticles([]);
        });
    } else {
      void Promise.all([
        api.get<Ticket[]>("/tickets").catch(() => []),
        api.get<KnowledgeArticle[]>("/articles").catch(() => []),
      ]).then(([t, a]) => {
        if (active) {
          setTickets(t);
          setArticles(a);
        }
      });
    }
  };

  // Only fetch data when the search input is focused or opened — not on mount.
  useEffect(() => {
    if (open) loadData();
  }, [open]);

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
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const scopedTickets = useMemo(
    () =>
      isCustomer && myEmail
        ? tickets.filter((t) => t.email.toLowerCase() === myEmail)
        : tickets,
    [tickets, isCustomer, myEmail],
  );
  const ticketHits = useMemo(
    () =>
      q
        ? scopedTickets.filter(
            (t) =>
              t.id.toLowerCase().includes(q) ||
              t.subject.toLowerCase().includes(q) ||
              t.cust.toLowerCase().includes(q),
          )
        : [],
    [scopedTickets, q],
  );
  const articleHits = useMemo(
    () => (q ? articles.filter((a) => a.title.toLowerCase().includes(q)) : []),
    [articles, q],
  );
  const hasHits = ticketHits.length > 0 || articleHits.length > 0;

  // Combined, flat list of actionable results for keyboard navigation.
  const hits = useMemo(
    () => [
      ...ticketHits.slice(0, 4).map((t) => ({ kind: "ticket" as const, t })),
      ...articleHits.slice(0, 4).map((a) => ({ kind: "article" as const, a })),
    ],
    [ticketHits, articleHits],
  );

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const openTicket = (t: Ticket) => {
    close();
    setQuery("");
    if (isCustomer) {
      router.push(`/portal/${tenantId}/inbox?email=${encodeURIComponent(t.email)}`);
    } else {
      router.push(`/dashboard/tickets/${ticketNumberFor(t)}`);
    }
  };

  const openArticle = (a: KnowledgeArticle) => {
    close();
    setSelectedArticle(a);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const hit = hits[activeIndex];
      if (!hit) return;
      e.preventDefault();
      if (hit.kind === "ticket") openTicket(hit.t);
      else openArticle(hit.a);
    }
  };

  useEffect(() => {
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const onMouseEnter = (i: number) => setActiveIndex(i);

  return (
    <div ref={rootRef} className="relative w-full max-w-[420px]">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3">
        <Icon name="search" size={16} />
      </div>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && q ? "true" : "false"}
        aria-controls="search-results-listbox"
        aria-autocomplete="list"
        aria-label="Global search"
        placeholder={
          isCustomer ? "Search articles…" : "Search tickets, customers, articles…"
        }
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className={cn(
          "h-9 w-full rounded-md border-0 bg-surface-2/80 py-2 pl-9 text-[13px] text-text outline-none transition-colors duration-150 placeholder:text-text-3 hover:bg-surface-2 focus:bg-surface-2 focus:ring-0",
          query ? "pr-9" : "pr-3",
        )}
      />

      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setQuery("");
            setOpen(false);
            setActiveIndex(-1);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
        >
          <Icon name="close" size={14} />
        </button>
      )}

      {open && q && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={close} />
          <div
            id="search-results-listbox"
            role="listbox"
            aria-label="Search results"
            aria-activedescendant={activeIndex >= 0 ? `search-hit-${activeIndex}` : undefined}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 menu-panel rounded-xl shadow-lg border border-border bg-surface p-1.5"
            onKeyDown={onListKey}
          >
            <div className="max-h-[380px] overflow-y-auto custom-scrollbar">
              {!hasHits ? (
                <p className="menu-empty">No matches for “{query}”</p>
              ) : (
                <>
                  {ticketHits.length > 0 && (
                    <div>
                      <p className="menu-label">Tickets</p>
                      {ticketHits.slice(0, 4).map((t, ti) => {
                        const flatIndex = ti;
                        const isSelected = activeIndex === flatIndex;
                        return (
                          <button
                            key={t.id}
                            ref={(el) => {
                              itemRefs.current[flatIndex] = el;
                            }}
                            id={`search-hit-${flatIndex}`}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onMouseEnter={() => onMouseEnter(flatIndex)}
                            onClick={() => openTicket(t)}
                            className={cn(
                              "menu-item border-0 outline-none rounded-md px-3 py-2 text-[13px] transition-colors duration-150 flex items-center gap-2.5 w-full text-left",
                              isSelected ? "bg-surface-2 font-medium text-text" : "hover:bg-surface-2/60 text-text-2",
                            )}
                          >
                            <code className="shrink-0 font-mono text-code text-text-3">{ticketNumberFor(t)}</code>
                            <span className="min-w-0 flex-1 truncate font-medium text-text">
                              {t.subject}
                            </span>
                            <Pill status={t.status} className="shrink-0 !px-1.5 !py-[1px] !text-[9.5px]" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {ticketHits.length > 0 && articleHits.length > 0 && (
                    <div className="menu-divider" />
                  )}
                  {articleHits.length > 0 && (
                    <div>
                      <p className="menu-label">Knowledge</p>
                      {articleHits.slice(0, 4).map((a, ai) => {
                        const flatIndex = ticketHits.slice(0, 4).length + ai;
                        const isSelected = activeIndex === flatIndex;
                        return (
                          <button
                            key={a.id}
                            ref={(el) => {
                              itemRefs.current[flatIndex] = el;
                            }}
                            id={`search-hit-${flatIndex}`}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onMouseEnter={() => onMouseEnter(flatIndex)}
                            onClick={() => openArticle(a)}
                            className={cn(
                              "menu-item border-0 outline-none rounded-md px-3 py-2 text-[13px] transition-colors duration-150 flex items-center gap-2.5 w-full text-left",
                              isSelected ? "bg-surface-2 font-medium text-text" : "hover:bg-surface-2/60 text-text-2",
                            )}
                          >
                            <Icon name="book" size={15} className="shrink-0 text-text-3" />
                            <span className="min-w-0 flex-1 truncate font-medium text-text">
                              {a.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      <ArticleViewer
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
        onContactSupport={() => setSelectedArticle(null)}
      />
    </div>
  );
}
