"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import { Icon, type IconName } from "@/components/icons";
import { Markdown } from "@/components/ui/markdown";
import { Pill } from "@/components/ui/pill";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { KnowledgeSource, Tenant, FAQItem } from "@/lib/types";

type MainTab = "sources" | "faqs";
type IngestTab = "link" | "crawler" | "files" | "text";

const MAIN_TABS: { id: MainTab; label: string; icon: IconName }[] = [
  { id: "sources", label: "Sources & Documents", icon: "book" },
  { id: "faqs", label: "Curated FAQs", icon: "edit" },
];

const INGEST_TABS: { id: IngestTab; label: string; icon: IconName }[] = [
  { id: "link", label: "Single Link", icon: "link" },
  { id: "crawler", label: "Live Web & Doc Crawler", icon: "sparkles" },
  { id: "files", label: "Files", icon: "file" },
  { id: "text", label: "Raw text", icon: "edit" },
];

/** Ingestion stages (guide §5.4): extract → chunk/embed → index. */
const STAGES = ["Extracting content…", "Chunking & embedding…", "Indexing into the knowledge base…"];

const SOURCE_ICON: Record<string, IconName> = {
  link: "link",
  pdf: "file",
  raw_text: "edit",
  markdown: "file",
  docx: "file",
  csv: "file",
  file: "file",
};

const TYPE_LABEL: Record<string, string> = {
  link: "Link",
  pdf: "PDF",
  raw_text: "Raw Text",
  markdown: "Markdown",
  docx: "Word Document",
  csv: "CSV",
  file: "File",
};

const FAQ_PAGE_SIZE = 10;

/** Best-effort CSV parser that honours quoted fields and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cur.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      if (cur.some((c) => c.trim() !== "")) rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  cur.push(field);
  if (cur.some((c) => c.trim() !== "")) rows.push(cur);
  return rows;
}

function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 8);
  if (lines.length < 2) return false;
  const counts = lines.map((l) => l.split(",").length - 1);
  const first = counts[0];
  return first >= 1 && counts.every((c) => Math.abs(c - first) <= 1);
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes extracted/chunked source text readable in the preview modal.
 *
 * Paragraphs are kept as full flowing blocks — never hard-wrapped into
 * arbitrary lines (sentences that belong together must stay together) — and
 * every paragraph gets its own row of space before the next one, exactly like
 * the seeded NairaWave help docs. Extra blank runs and stray line endings are
 * collapsed so lists, code fences and multi-line blocks still render cleanly.
 */
function formatReadableText(text: string): string {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Renders an extracted source's raw text in a readable, formatted view:
 *  CSVs become real tables, JSON is pretty-printed, and documents/text are
 *  rendered through the safe Markdown renderer. */
function SourcePreviewContent({ text }: { text: string }) {
  if (looksLikeJson(text)) {
    let pretty = text.trim();
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // fall back to the raw text
    }
    return (
      <pre className="max-h-[68vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-4 font-mono text-[12px] leading-relaxed text-text">
        {pretty}
      </pre>
    );
  }

  if (looksLikeCsv(text)) {
    const rows = parseCsv(text).slice(0, 400);
    if (rows.length > 0) {
      const firstIsHeader =
        rows[0].length > 0 &&
        rows[0].some((c) => c.trim() && !/^[-+0-9.,%()$N\$]+$/.test(c.trim()));
      const body = firstIsHeader ? rows.slice(1) : rows;
      const header = firstIsHeader ? rows[0] : null;
      const cols = Math.max(...rows.map((r) => r.length));
      return (
        <div className="max-h-[68vh] overflow-auto rounded-md border border-border">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr>
                {Array.from({ length: cols }).map((_, i) => (
                  <th
                    key={i}
                    className="sticky top-0 border-b border-border bg-surface-2/90 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-3"
                  >
                    {header?.[i]?.trim() || `Col ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {body.map((r, ri) => (
                <tr key={ri} className="align-top transition-colors hover:bg-surface-2/60">
                  {Array.from({ length: cols }).map((_, ci) => (
                    <td key={ci} className="break-words whitespace-pre-wrap px-3 py-1.5 text-text-2">
                      {r[ci]?.trim() ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  return (
    <div className="max-h-[68vh] overflow-y-auto rounded-md border border-border bg-surface-2 px-6 py-5 text-[13px] leading-relaxed text-text">
      <Markdown text={text} />
    </div>
  );
}

export function KnowledgeUpload() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "t1";
  const toast = useToast();

  const [mainTab, setMainTab] = useState<MainTab>("sources");
  const [ingestTab, setIngestTab] = useState<IngestTab>("link");
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  const [faqs, setFaqs] = useState<FAQItem[] | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  // Ingest form fields
  const [url, setUrl] = useState("");
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlMaxPages, setCrawlMaxPages] = useState(15);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");

  // Ingest feedback
  const [ingesting, setIngesting] = useState(false);
  const [stage, setStage] = useState(0);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [confirmRemoveSource, setConfirmRemoveSource] = useState<KnowledgeSource | null>(null);

  // Source preview
  const [previewSource, setPreviewSource] = useState<KnowledgeSource | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // FAQ state & pagination
  const [faqOffset, setFaqOffset] = useState(0);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQItem | null>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqSaving, setFaqSaving] = useState(false);
  const [deletingFaqId, setDeletingFaqId] = useState<number | null>(null);
  const [confirmRemoveFaq, setConfirmRemoveFaq] = useState<FAQItem | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.get<KnowledgeSource[]>("/knowledge/sources").catch(() => []),
      api.get<FAQItem[]>("/faqs").catch(() => []),
      api
        .get<Tenant>(`/tenants/${tenantId}`)
        .then((t) => t)
        .catch(() => null),
    ]).then(([src, faqList, ten]) => {
      if (!active) return;
      setSources(src);
      setFaqs(faqList);
      setTenant(ten);
    });
    return () => {
      active = false;
    };
  }, [tenantId]);

  const chunksTotal =
    sources?.reduce((sum, s) => sum + (s.status === "ready" ? s.chunks : 0), 0) ?? 0;

  const runIngest = async (action: () => Promise<KnowledgeSource | KnowledgeSource[]>) => {
    setIngesting(true);
    setStage(0);
    const advance = (i: number) => {
      if (i < STAGES.length - 1) {
        setTimeout(() => advance(i + 1), 650);
      } else {
        setTimeout(() => void finish(), 650);
      }
      setStage(i);
    };
    const finish = async () => {
      try {
        const created = await action();
        const createdArray = Array.isArray(created) ? created : [created];
        setSources((prev) => (prev ? [...createdArray, ...prev] : createdArray));
        toast(
          createdArray.length === 1
            ? `${createdArray[0].title} added to the knowledge base`
            : `${createdArray.length} sources added to the knowledge base`,
        );
        setUrl("");
        setUploadedFiles([]);
        setTextTitle("");
        setTextBody("");
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : "Could not ingest that source", "danger");
      } finally {
        setIngesting(false);
      }
    };
    advance(0);
  };

  const canSubmitIngest =
    (ingestTab === "link" && url.trim().length > 0) ||
    (ingestTab === "crawler" && crawlUrl.trim().length > 0) ||
    (ingestTab === "files" && uploadedFiles.length > 0) ||
    (ingestTab === "text" && textTitle.trim().length > 0 && textBody.trim().length > 0);

  const submitIngest = () => {
    if (ingesting || !canSubmitIngest) return;
    if (ingestTab === "link") {
      const raw = url.trim();
      const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      void runIngest(() => api.post<KnowledgeSource>("/knowledge/ingest-link", { url: normalized }));
    } else if (ingestTab === "crawler") {
      const raw = crawlUrl.trim();
      const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      void runIngest(async () => {
        const res = await api.post<{
          ok?: boolean;
          pagesCrawled?: number;
          chunksIndexed?: number;
          message?: string;
        }>("/crawl", { url: normalized, maxPages: crawlMaxPages });
        if (res.ok === false) {
          throw new Error(res.message ?? "Could not crawl that site.");
        }
        const refreshed = await api.get<KnowledgeSource[]>("/knowledge/sources").catch(() => []);
        setSources(refreshed);
        return {
          id: String(Date.now()),
          tenantId,
          type: "link" as const,
          title: `Crawled ${res.pagesCrawled || 1} pages from ${new URL(normalized).hostname}`,
          status: "ready" as const,
          chunks: res.chunksIndexed || 1,
          createdAt: new Date().toISOString(),
        };
      });
    } else if (ingestTab === "files" && uploadedFiles.length > 0) {
      const form = new FormData();
      uploadedFiles.forEach((f) => form.append("files", f, f.name));
      void runIngest(() => api.post<KnowledgeSource[]>("/knowledge/ingest-files", form));
    } else {
      void runIngest(() =>
        api.post<KnowledgeSource>("/knowledge/ingest-text", {
          title: textTitle.trim(),
          content: textBody,
        }),
      );
    }
  };

  const removeSource = async (id: string) => {
    setDeletingSource(id);
    try {
      await api.del(`/knowledge/sources/${id}`);
      setSources((prev) => (prev ?? []).filter((s) => s.id !== id));
      setConfirmRemoveSource(null);
      toast("Source removed");
    } catch {
      toast("Could not remove source", "danger");
    } finally {
      setDeletingSource(null);
    }
  };

  const openPreview = async (source: KnowledgeSource) => {
    setPreviewSource(source);
    setPreviewText(null);
    setPreviewLoading(true);
    try {
      const full = await api.get<KnowledgeSource>(`/knowledge/sources/${source.id}`);
      setPreviewText(full.text ?? "");
    } catch {
      setPreviewText("");
    } finally {
      setPreviewLoading(false);
    }
  };

  // FAQ Modal Handlers
  const openCreateFaqModal = () => {
    setEditingFaq(null);
    setFaqQuestion("");
    setFaqAnswer("");
    setShowFaqModal(true);
  };

  const openEditFaqModal = (faq: FAQItem) => {
    setEditingFaq(faq);
    setFaqQuestion(faq.question);
    setFaqAnswer(faq.answer);
    setShowFaqModal(true);
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim() || faqSaving) return;
    setFaqSaving(true);
    try {
      if (editingFaq) {
        const updated = await api.put<FAQItem>(`/faqs/${editingFaq.id}`, {
          question: faqQuestion.trim(),
          answer: faqAnswer.trim(),
        });
        const target = updated ?? { id: editingFaq.id, question: faqQuestion.trim(), answer: faqAnswer.trim() };
        setFaqs((prev) =>
          prev ? prev.map((f) => (f.id === editingFaq.id ? target : f)) : [target]
        );
        toast("FAQ updated successfully");
      } else {
        const created = await api.post<FAQItem>("/faqs", {
          question: faqQuestion.trim(),
          answer: faqAnswer.trim(),
        });
        if (created && created.id) {
          setFaqs((prev) => (prev ? [created, ...prev] : [created]));
        } else {
          const fresh = await api.get<FAQItem[]>("/faqs").catch(() => []);
          setFaqs(fresh);
        }
        toast("FAQ created successfully");
      }
      setShowFaqModal(false);
    } catch (err) {
      console.error("Failed to save FAQ:", err);
      toast(editingFaq ? "Could not update FAQ" : "Could not create FAQ", "danger");
    } finally {
      setFaqSaving(false);
    }
  };

  const removeFaq = async (faq: FAQItem) => {
    setDeletingFaqId(faq.id);
    try {
      await api.del(`/faqs/${faq.id}`);
      setFaqs((prev) => (prev ?? []).filter((f) => f.id !== faq.id));
      setConfirmRemoveFaq(null);
      toast("FAQ deleted");
    } catch (err) {
      console.error("Failed to delete FAQ:", err);
      toast("Could not delete FAQ", "danger");
    } finally {
      setDeletingFaqId(null);
    }
  };

  const paginatedFaqs = faqs ? faqs.slice(faqOffset, faqOffset + FAQ_PAGE_SIZE) : [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 text-text">Knowledge base</h1>
        <p className="flex items-center gap-1.5 text-meta font-medium text-text-2">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
          {tenant?.name ?? "Loading…"}
        </p>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <StatCard label="Sources" value={String(sources?.length ?? "—")} context="indexed documents" />
        <StatCard label="Chunks indexed" value={String(sources ? chunksTotal : "—")} context="~600 tokens each" />
        <StatCard label="Curated FAQs" value={String(faqs?.length ?? "—")} context="direct Q&A pairs" />
        <StatCard
          label="KB usage"
          value={`${tenant?.kbMb ?? "—"} MB`}
          context={tenant?.plan ? `${tenant.plan} plan` : undefined}
        />
      </div>

      {/* Main Tab Navigation */}
      <div
        role="tablist"
        aria-label="Knowledge base sections"
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      >
        {MAIN_TABS.map((t) => {
          const active = mainTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMainTab(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-sm border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition-colors duration-150",
                active
                  ? "border-primary text-primary-dark font-bold"
                  : "border-transparent text-text-2 hover:bg-surface-2 hover:text-text"
              )}
            >
              <Icon name={t.icon} size={15} className={cn("opacity-80", active && "opacity-100")} />
              {t.label}
              {t.id === "sources" && sources != null && (
                <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-text-2">
                  {sources.length}
                </span>
              )}
              {t.id === "faqs" && faqs != null && (
                <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-text-2">
                  {faqs.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-6 min-h-[520px]">

      {mainTab === "sources" && (
        <>
          <Card title="Add a source" icon="plus">
            {/* Segmented tabs */}
            <div className="mb-4 flex items-center gap-1 rounded-sm border border-border bg-surface-2 p-1">
              {INGEST_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setIngestTab(t.id)}
                  aria-pressed={ingestTab === t.id}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150",
                    ingestTab === t.id ? "bg-surface text-text shadow-sm" : "text-text-3 hover:text-text-2"
                  )}
                >
                  <Icon name={t.icon} size={14} />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {ingestTab === "link" && (
                <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
                  Page URL
                  <div className="flex items-center gap-2">
                    <span className="input-control flex w-auto items-center gap-2 !py-0 text-text-3">
                      <Icon name="link" size={14} />
                      https://
                    </span>
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitIngest()}
                      placeholder="docs.yourcompany.ng/help"
                      className="input-control"
                      aria-label="Knowledge base page URL"
                    />
                  </div>
                </label>
              )}

              {ingestTab === "crawler" && (
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3.5">
                  <div className="flex items-center gap-2 text-text">
                    <Icon name="sparkles" size={16} className="text-primary" />
                    <span className="text-[13px] font-bold">Recursive Live Website & Documentation Crawler</span>
                  </div>
                  <p className="text-[12px] text-text-2">
                    Enter the root URL of your website, public documentation, or Zendesk/Notion portal. The crawler will recursively discover internal pages, clean boilerplate headers/footers, and embed semantic chunks directly into Chroma.
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-3">
                      <label className="text-[11.5px] font-semibold text-text-2">Website / Docs Root URL</label>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="input-control flex w-auto items-center gap-2 !py-0 text-text-3 font-mono text-[12px]">
                          https://
                        </span>
                        <input
                          value={crawlUrl}
                          onChange={(e) => setCrawlUrl(e.target.value)}
                          placeholder="help.nairawave.ng"
                          className="input-control font-mono text-[12px]"
                        />
                      </div>
                    </div>
                    <div className="col-span-1">
                      <label className="text-[11.5px] font-semibold text-text-2">Max Pages</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={crawlMaxPages}
                        onChange={(e) => setCrawlMaxPages(Number(e.target.value))}
                        className="input-control mt-1 font-mono text-[12px]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {ingestTab === "files" && (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border-strong bg-surface-2 px-4 py-8 text-center transition-colors duration-150 hover:border-primary hover:bg-primary-soft/40">
                  <Icon name="file" size={26} className="text-text-3" />
                  <span className="text-[13px] font-semibold text-text">
                    {uploadedFiles.length > 0
                      ? `${uploadedFiles.length} file(s) selected`
                      : "Drop PDFs, Word docs, Excel spreadsheets, CSVs, or text files here"}
                  </span>
                  <span className="text-[11.5px] text-text-3">
                    {uploadedFiles.length > 0
                      ? uploadedFiles.map((f) => f.name).join(", ")
                      : "Supports .pdf, .docx, .xlsx, .csv, .txt, .md (Max 25 MB each)"}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.csv,.xlsx,.xls,.docx,.txt,.md"
                    className="hidden"
                    onChange={(e) => {
                      const fl = Array.from(e.target.files ?? []);
                      if (fl.length > 0) setUploadedFiles(fl);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}

              {ingestTab === "text" && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-text-2">Title</span>
                    <label className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-primary hover:underline">
                      <Icon name="file" size={13} />
                      Import text file (.txt, .md)
                      <input
                        type="file"
                        accept=".txt,.md,.text"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const cleanTitle = f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const text = event.target?.result as string;
                              if (text) {
                                setTextTitle(cleanTitle);
                                setTextBody(text);
                                toast(`Imported ${f.name}`);
                              }
                            };
                            reader.readAsText(f);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <input
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    placeholder="e.g. Transfer SLA notes"
                    className="input-control"
                  />
                  <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
                    Content
                    <textarea
                      value={textBody}
                      onChange={(e) => setTextBody(e.target.value)}
                      placeholder="Paste the article, FAQ or policy text here…"
                      rows={6}
                      className="input-control resize-y leading-relaxed"
                    />
                  </label>
                </>
              )}

              {ingesting ? (
                <div className="flex items-center gap-2.5 rounded-sm bg-primary-soft px-3.5 py-2.5">
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary-border border-t-primary" />
                  <p className="text-[12.5px] font-semibold text-primary-dark">{STAGES[stage]}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={submitIngest}
                  disabled={!canSubmitIngest}
                  className="inline-flex items-center justify-center gap-1.5 self-start rounded-sm bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="plus" size={14} />
                  {ingestTab === "link" ? "Fetch & ingest" : ingestTab === "files" ? "Upload & parse files" : "Ingest text"}
                </button>
              )}
            </div>
          </Card>

          <Card title="Sources" icon="book" pad0>
            {!sources ? (
              <div className="space-y-3 p-[18px]">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton h-9 w-9 rounded-[9px]" />
                    <div className="min-w-0 flex-1">
                      <div className="skeleton h-3 w-2/3" />
                      <div className="skeleton mt-2 h-2.5 w-1/2" />
                    </div>
                    <div className="skeleton h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : sources.length === 0 ? (
              <EmptyState
                icon="book"
                title="No sources yet"
                subtitle="Add a link, PDF or raw text above and the assistant will answer your customers from it."
                action={
                  <button
                    type="button"
                    onClick={() => setIngestTab("link")}
                    className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                  >
                    <Icon name="plus" size={14} />
                    Add a source
                  </button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-center gap-3.5 px-4 py-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-info-soft text-info">
                      <Icon name={SOURCE_ICON[s.type] ?? "file"} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-text">{s.title}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-text-3">
                        {s.type === "link" && s.url ? s.url : (TYPE_LABEL[s.type] ?? s.type.replace("_", " "))}
                        {s.sizeKb ? ` · ${s.sizeKb} KB` : ""} · {s.chunks} chunks · {s.createdAt}
                      </p>
                    </div>
                    <Pill status={s.status === "ready" ? "ready" : "processing"} tone={s.status === "ready" ? "success" : "warning"} />
                    <button
                      type="button"
                      onClick={() => void openPreview(s)}
                      aria-label={`Preview ${s.title}`}
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-info-soft hover:text-info"
                    >
                      <Icon name="eye" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveSource(s)}
                      disabled={deletingSource === s.id}
                      aria-label={`Remove ${s.title}`}
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                    >
                      {deletingSource === s.id ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-danger-border border-t-danger" />
                      ) : (
                        <Icon name="close" size={15} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {mainTab === "faqs" && (
        <Card title="Curated FAQs" icon="edit" pad0>
          {!faqs ? (
            <div className="space-y-3 p-[18px]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="skeleton h-3 w-2/3" />
                    <div className="skeleton mt-2 h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : faqs.length === 0 ? (
            <EmptyState
              icon="edit"
              title="No FAQs yet"
              subtitle="Add questions and direct answers that the AI assistant can use immediately when answering customer queries."
              action={
                <button
                  type="button"
                  onClick={openCreateFaqModal}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
                >
                  <Icon name="plus" size={14} />
                  Add an FAQ
                </button>
              }
            />
          ) : (
            <div className="flex flex-col">
              <ul className="divide-y divide-border">
                {paginatedFaqs.map((faq) => (
                  <li key={faq.id} className="flex items-start justify-between gap-4 px-4 py-3.5 hover:bg-surface-2/50 transition-colors duration-150">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-text">{faq.question}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-text-2">{faq.answer}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => openEditFaqModal(faq)}
                        aria-label={`Edit FAQ: ${faq.question}`}
                        className="flex h-7 w-7 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveFaq(faq)}
                        disabled={deletingFaqId === faq.id}
                        aria-label={`Delete FAQ: ${faq.question}`}
                        className="flex h-7 w-7 items-center justify-center rounded-sm text-text-3 transition-colors duration-150 hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                      >
                        {deletingFaqId === faq.id ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-danger-border border-t-danger" />
                        ) : (
                          <Icon name="close" size={14} />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Pagination Controls */}
              {faqs.length > 0 && (
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 bg-surface-2/40">
                  <p className="text-[12px] font-medium text-text-3">
                    Showing{" "}
                    <span className="font-semibold text-text">
                      {Math.min(faqOffset + 1, faqs.length)}
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold text-text">
                      {Math.min(faqOffset + FAQ_PAGE_SIZE, faqs.length)}
                    </span>{" "}
                    of <span className="font-semibold text-text">{faqs.length}</span> FAQs
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openCreateFaqModal}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark mr-1"
                    >
                      <Icon name="plus" size={14} />
                      Add FAQ
                    </button>
                    <button
                      type="button"
                      disabled={faqOffset === 0}
                      onClick={() => setFaqOffset(Math.max(0, faqOffset - FAQ_PAGE_SIZE))}
                      className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="chevron-left" size={14} />
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={faqOffset + FAQ_PAGE_SIZE >= faqs.length}
                      onClick={() => setFaqOffset(faqOffset + FAQ_PAGE_SIZE)}
                      className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                      <Icon name="chevron-right" size={14} />
                    </button>
                  </div>
                </footer>
              )}
            </div>
          )}
        </Card>
      )}
      </div>

      {/* Source Text Preview Modal */}
      <Modal
        open={!!previewSource}
        onClose={() => setPreviewSource(null)}
        title={previewSource?.title ?? "Preview source"}
        icon={previewSource ? (SOURCE_ICON[previewSource.type] ?? "book") : "book"}
        size="2xl"
        className="!max-w-[1240px] !w-[96vw]"
      >
        {previewSource && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-3">
              {previewSource.type === "link" && previewSource.url ? (
                <span className="truncate font-medium text-info">{previewSource.url}</span>
              ) : (
                <span className="inline-flex items-center rounded bg-surface-3 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text">
                  {TYPE_LABEL[previewSource.type] ?? previewSource.type.replace("_", " ")}
                </span>
              )}
              {previewSource.sizeKb ? <span>· {previewSource.sizeKb} KB</span> : null}
              <span>· {previewSource.chunks} chunks · {previewSource.createdAt}</span>
            </div>
            {previewLoading ? (
              <div className="flex items-center gap-2.5 py-8 text-[12.5px] font-semibold text-text-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-border border-t-primary" />
                Loading extracted text…
              </div>
            ) : previewText ? (
              <SourcePreviewContent text={previewText} />
            ) : (
              <p className="rounded-sm border border-border bg-surface-2 px-4 py-8 text-center text-[12.5px] text-text-3">
                No extractable text was stored for this source.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Remove Source Modal */}
      <ConfirmModal
        open={!!confirmRemoveSource}
        onClose={() => setConfirmRemoveSource(null)}
        title="Remove source"
        icon="trash"
        confirmLabel="Remove source"
        busy={!!deletingSource}
        onConfirm={() => confirmRemoveSource && void removeSource(confirmRemoveSource.id)}
        description={
          <>
            <b className="text-text">{confirmRemoveSource?.title}</b> and its{" "}
            <b className="text-text">{confirmRemoveSource?.chunks}</b> chunks will be dropped from the
            knowledge base. The AI assistant will stop answering from it immediately.
          </>
        }
      />

      {/* FAQ Create / Edit Modal */}
      <Modal
        open={showFaqModal}
        onClose={() => setShowFaqModal(false)}
        title={editingFaq ? "Edit FAQ" : "Add FAQ"}
        icon={editingFaq ? "edit" : "plus"}
        size="md"
      >
        <form onSubmit={handleSaveFaq} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
            Question
            <input
              type="text"
              required
              value={faqQuestion}
              onChange={(e) => setFaqQuestion(e.target.value)}
              placeholder="e.g. What are your opening hours?"
              className="input-control"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-text-2">
            Answer
            <textarea
              required
              rows={4}
              value={faqAnswer}
              onChange={(e) => setFaqAnswer(e.target.value)}
              placeholder="Provide a clear, direct answer for the AI assistant..."
              className="input-control resize-y leading-relaxed"
            />
          </label>
          <div className="flex justify-end items-center gap-2 mt-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setShowFaqModal(false)}
              disabled={faqSaving}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-surface-3 hover:text-text transition-colors duration-150 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={faqSaving || !faqQuestion.trim() || !faqAnswer.trim()}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-primary-dark transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {faqSaving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              {editingFaq ? "Save changes" : "Create FAQ"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete FAQ Modal */}
      <ConfirmModal
        open={!!confirmRemoveFaq}
        onClose={() => setConfirmRemoveFaq(null)}
        title="Delete FAQ"
        icon="trash"
        confirmLabel="Delete FAQ"
        busy={deletingFaqId !== null}
        onConfirm={() => confirmRemoveFaq && void removeFaq(confirmRemoveFaq)}
        description={
          <>
            Are you sure you want to delete the FAQ{" "}
            <b className="text-text">&ldquo;{confirmRemoveFaq?.question}&rdquo;</b>? The AI assistant will stop using this answer immediately.
          </>
        }
      />
    </div>
  );
}

function StatCard({ label, value, context }: { label: string; value: string; context?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <p className="text-micro uppercase text-text-3">{label}</p>
      <p className="mt-2 text-kpi tabular-nums text-text">{value}</p>
      {context && <p className="mt-1 text-meta text-text-2">{context}</p>}
    </div>
  );
}
