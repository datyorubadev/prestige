"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { ArticleViewer } from "@/components/portal/article-viewer";
import { CreateTicketModal } from "@/components/portal/create-ticket-modal";
import { cn, DEMO_TENANT_SLUG } from "@/lib/utils";
import type { KnowledgeArticle } from "@/lib/types";

export default function PortalOverviewPage() {
  return (
    <Suspense fallback={null}>
      <PortalOverview />
    </Suspense>
  );
}

function PortalOverview() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? DEMO_TENANT_SLUG;
  const searchParams = useSearchParams();

  const [articles, setArticles] = useState<KnowledgeArticle[] | null>(null);
  const [query, setQuery] = useState("");
  const [openArticle, setOpenArticle] = useState<KnowledgeArticle | null>(null);
  // Guest gating: "Contact support" sends guests to login/register (create-ticket
  // modal renders the gate). Returning with ?raise=1 mounts the form open.
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("raise") === "1");

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

  const q = query.trim().toLowerCase();
  const hits =
    articles?.filter((a) => !q || `${a.title} ${a.snippet}`.toLowerCase().includes(q)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Help center</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/portal/${tenantId}/inbox`}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-2 hover:text-text"
          >
            <Icon name="inbox" size={14} />
            Track a ticket
          </Link>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="send" size={14} />
            Contact support
          </button>
        </div>
      </header>

      <div className="relative">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the knowledge base… e.g. transfer, refund, alert"
          className="focus-ring-soft w-full rounded-md border border-border bg-surface py-3.5 pl-11 pr-4 text-[13.5px] text-text shadow-card placeholder:text-text-3"
        />
      </div>

      <Card
        title={q ? `Articles matching "${query.trim()}"` : "Popular articles"}
        icon="book"
        pad0
      >
        {!articles ? (
          <div className="space-y-3 p-[18px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-9 w-9 rounded-[8px]" />
                <div className="min-w-0 flex-1">
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton mt-2 h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : hits.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Icon name="search" size={30} className="opacity-40 text-text-3" />
            <p className="text-[13.5px] font-medium text-text-2">No articles found.</p>
            <p className="max-w-[320px] text-[12px] text-text-3">
              If you can&apos;t find an answer, contact support and we&apos;ll route you to the
              right person.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
            >
              <Icon name="send" size={13} />
              Contact support
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {hits.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpenArticle(a)}
                  className="flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors duration-150 hover:bg-surface-2"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-info-soft text-info">
                    <Icon name="file" size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-text">{a.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-text-2">
                      {a.snippet}
                    </span>
                    <span className="mt-1.5 flex items-center gap-3 text-[11px] font-medium text-text-3">
                      <span className="flex items-center gap-1">
                        <Icon name="eye" size={11} />
                        {a.views.toLocaleString()} views
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="smile" size={11} />
                        {a.helpful}% helpful
                      </span>
                    </span>
                  </span>
                  <Icon
                    name="chevron-right"
                    size={15}
                    className={cn("mt-1 shrink-0 text-text-3 transition-transform duration-200")}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ArticleViewer
        article={openArticle}
        onClose={() => setOpenArticle(null)}
        onContactSupport={() => setCreateOpen(true)}
        onUpdate={(updated) => {
          setArticles((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? null);
          setOpenArticle(updated);
        }}
      />

      {createOpen && (
        <CreateTicketModal open tenantId={tenantId} onClose={() => setCreateOpen(false)} />
      )}
    </div>
  );
}
