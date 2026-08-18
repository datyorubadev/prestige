"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { ArticleViewer } from "@/components/portal/article-viewer";
import { CreateTicketModal } from "@/components/portal/create-ticket-modal";
import type { KnowledgeArticle } from "@/lib/types";

/** Canonical portal overview route: /[tenantSlug]/portal (e.g. /mediquick/portal) */
export default function TenantPortalOverviewPage() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantId = params?.tenantSlug ?? "nairawave";

  const [articles, setArticles] = useState<KnowledgeArticle[] | null>(null);
  const [query, setQuery] = useState("");
  const [openArticle, setOpenArticle] = useState<KnowledgeArticle | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .get<KnowledgeArticle[]>(`/portal/articles?tenantId=${encodeURIComponent(tenantId)}`)
      .then((ar) => {
        if (!active) return;
        setArticles(ar);
      })
      .catch(() => {
        if (active) setArticles([]);
      });
    return () => {
      active = false;
    };
  }, [tenantId]);

  const filtered = (articles ?? []).filter((a) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return a.title.toLowerCase().includes(q) || (a.body || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
      {/* Search Hero */}
      <div className="relative overflow-hidden rounded-md border border-border bg-gradient-to-b from-primary-soft/40 to-surface p-6 sm:p-8">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">
            How can we help you today?
          </h1>
          <p className="mt-1.5 text-[13px] text-text-2">
            Search our help center or create a support ticket.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <div className="relative flex-1">
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles, guides, FAQs..."
                aria-label="Search articles"
                className="w-full rounded-full border border-border bg-surface py-2.5 pl-10 pr-4 text-[13px] text-text placeholder:text-text-3 shadow-xs transition-colors duration-150 focus-within:border-primary-border"
                style={{ outline: "none", boxShadow: "none" }}
              />
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-primary px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-xs"
            >
              <Icon name="plus" size={14} />
              New ticket
            </button>
          </div>
        </div>
      </div>

      {/* Articles Grid */}
      <div className="space-y-3">
        <h2 className="text-[14px] font-bold text-text">Help Center Articles</h2>
        {!articles ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="h-28 animate-pulse bg-surface-2">
                <div />
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[12.5px] text-text-3">No articles match your search.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => setOpenArticle(art)}
                className="flex flex-col justify-between rounded-md border border-border bg-surface p-4 text-left shadow-card transition-all duration-150 hover:border-primary-border hover:shadow-md"
              >
                <div>
                  <h3 className="text-[13.5px] font-bold text-text">{art.title}</h3>
                  <p className="mt-1 line-clamp-2 text-[12px] text-text-2">{art.body || art.snippet}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/80 pt-2 text-[11px] font-medium text-text-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center gap-1">
                      <Icon name="eye" size={11} />
                      {(art.views ?? 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="smile" size={11} />
                      {art.helpful ?? 0}%
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-primary">
                    Read <Icon name="chevron-right" size={11} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {openArticle && (
        <ArticleViewer
          article={openArticle}
          onClose={() => setOpenArticle(null)}
          onContactSupport={() => setCreateOpen(true)}
          onUpdate={(updated) => {
            setArticles((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? null);
            setOpenArticle(updated);
          }}
        />
      )}
      {createOpen && (
        <CreateTicketModal
          open={createOpen}
          tenantId={tenantId}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
