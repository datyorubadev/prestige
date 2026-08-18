"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { Pill } from "@/components/ui/pill";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { KnowledgeArticle } from "@/lib/types";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All articles" },
  { value: "published", label: "Published" },
  { value: "pending_review", label: "Pending Review" },
  { value: "draft", label: "Drafts" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "published", label: "Published — visible in help centre & deflections" },
  { value: "draft", label: "Draft — not shown to customers" },
];

export function KbManager() {
  const toast = useToast();
  const { user, role } = useAuth();
  const isOwner = role === "owner" || role === "super_admin";
  const isAgent = role === "agent";

  const [articles, setArticles] = useState<KnowledgeArticle[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const [modal, setModal] = useState<KnowledgeArticle | "new" | null>(null);
  const [viewingArticle, setViewingArticle] = useState<KnowledgeArticle | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<KnowledgeArticle | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [deleting, setDeleting] = useState<KnowledgeArticle | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => {
    api
      .get<KnowledgeArticle[]>("/articles")
      .then((data) => setArticles(data))
      .catch(() => setArticles([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setTitle("");
    setCategory("");
    setContent("");
    setStatus("draft");
    setModal("new");
  };

  const openEdit = (a: KnowledgeArticle) => {
    setTitle(a.title);
    setCategory(a.category ?? "");
    setContent(a.content || a.body || "");
    setStatus(a.status ?? "published");
    setModal(a);
    setViewingArticle(null);
  };

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast("Title and body are required", "danger");
      return;
    }
    setSaving(true);
    try {
      if (modal === "new") {
        const created = await api.post<KnowledgeArticle>("/articles", {
          title: title.trim(),
          content: content.trim(),
          category: category.trim() || undefined,
          status: isAgent ? "draft" : status,
        });
        setArticles((prev) => (prev ? [created, ...prev] : [created]));
        toast(created.status === "published" ? "Article published" : "Draft article created");
      } else if (modal) {
        const payload: Record<string, unknown> = {
          title: title.trim(),
          content: content.trim(),
          category: category.trim() || undefined,
        };
        if (!isAgent) payload.status = status;
        const updated = await api.patch<KnowledgeArticle>(`/articles/${modal.id}`, payload);
        setArticles((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? null);
        toast("Article updated");
      }
      setModal(null);
    } catch {
      toast("Could not save article", "danger");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: KnowledgeArticle) => {
    setRemoving(true);
    try {
      await api.del(`/articles/${a.id}`);
      setArticles((prev) => prev?.filter((x) => x.id !== a.id) ?? null);
      setDeleting(null);
      setViewingArticle(null);
      toast("Article deleted");
    } catch {
      toast("Could not delete article", "danger");
    } finally {
      setRemoving(false);
    }
  };

  const publish = async (a: KnowledgeArticle, next: string) => {
    try {
      const updated = await api.patch<KnowledgeArticle>(`/articles/${a.id}`, { status: next });
      setArticles((prev) => prev?.map((x) => (x.id === a.id ? updated : x)) ?? null);
      if (viewingArticle?.id === a.id) setViewingArticle(updated);
      toast(next === "published" ? "Published" : "Moved to drafts");
    } catch {
      toast("Could not update status", "danger");
    }
  };

  const submitForReview = async (a: KnowledgeArticle) => {
    try {
      const updated = await api.post<KnowledgeArticle>(`/articles/${a.id}/submit`, {});
      setArticles((prev) => prev?.map((x) => (x.id === a.id ? updated : x)) ?? null);
      if (viewingArticle?.id === a.id) setViewingArticle(updated);
      toast("Submitted for review");
    } catch {
      toast("Could not submit", "danger");
    }
  };

  const approve = async (a: KnowledgeArticle) => {
    try {
      const updated = await api.post<KnowledgeArticle>(`/articles/${a.id}/approve`, {});
      setArticles((prev) => prev?.map((x) => (x.id === a.id ? updated : x)) ?? null);
      if (viewingArticle?.id === a.id) setViewingArticle(updated);
      toast("Article approved and published");
    } catch {
      toast("Could not approve", "danger");
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      const updated = await api.post<KnowledgeArticle>(`/articles/${rejectTarget.id}/reject`, { note: rejectNote });
      setArticles((prev) => prev?.map((x) => (x.id === rejectTarget.id ? updated : x)) ?? null);
      if (viewingArticle?.id === rejectTarget.id) setViewingArticle(updated);
      toast("Article returned to draft");
      setRejectTarget(null);
      setRejectNote("");
    } catch {
      toast("Could not reject", "danger");
    } finally {
      setRejecting(false);
    }
  };

  const [discovering, setDiscovering] = useState(false);

  const autoDiscover = async () => {
    setDiscovering(true);
    try {
      const res = await api.post<{ discovered: number; articles: KnowledgeArticle[] }>("/articles/auto-discover", {});
      if (res.discovered > 0) {
        toast(`Auto-discovered ${res.discovered} draft FAQs from resolved tickets!`);
        load();
      } else {
        toast("No new recurring questions found in resolved tickets.");
      }
    } catch {
      toast("Could not run auto-discovery", "danger");
    } finally {
      setDiscovering(false);
    }
  };

  const list = useMemo(() => {
    const all = articles ?? [];
    if (statusFilter === "all") return all;
    return all.filter((a) => (a.status ?? "published") === statusFilter);
  }, [articles, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-text">KB articles</h1>
          <p className="mt-1 text-[12.5px] text-text-3">
            Knowledge base entries the assistant deflects with and the help centre shows.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS.map((s) => ({ value: s.value, label: s.label }))}
            size="sm"
            ariaLabel="Filter by status"
            className="w-[150px]"
          />
          {isOwner && (
            <button
              type="button"
              onClick={autoDiscover}
              disabled={discovering}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text-2 shadow-xs transition-colors duration-150 hover:bg-surface hover:text-text disabled:opacity-50"
            >
              {discovering ? <Spinner size={14} /> : <Icon name="sparkles" size={14} className="text-primary" />}
              Auto-Discover FAQs
            </button>
          )}
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
          >
            <Icon name="plus" size={15} />
            New article
          </button>
        </div>
      </header>

      {!articles ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-4">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton mt-2 h-3 w-3/4" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface/40 p-12 text-center">
          <Icon name="book" size={28} className="mx-auto text-text-3" />
          <p className="mt-3 text-[13.5px] font-semibold text-text">
            {statusFilter === "all" ? "No articles yet" : `No ${statusFilter} articles`}
          </p>
          <p className="mt-1 text-[12.5px] text-text-3">
            {statusFilter === "all"
              ? "Write a first article to start deflecting repeat questions."
              : statusFilter === "draft"
                ? "Everything written so far is published."
                : "Nothing has been published yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((a) => (
            <div
              key={a.id}
              onClick={() => setViewingArticle(a)}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface p-4 transition-colors hover:border-primary-border"
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
                  (a.status ?? "published") === "draft"
                    ? "bg-amber-500/10 text-amber-500"
                    : "bg-primary-soft text-primary",
                )}
              >
                <Icon name={a.status === "draft" ? "edit" : "book"} size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13.5px] font-bold text-text hover:text-primary">{a.title}</p>
                  <Pill status={a.status ?? "published"} />
                  {a.category && (
                    <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-3">
                      {a.category}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-text-2 line-clamp-2">{a.snippet || a.content || a.body}</p>
                <p className="mt-1 text-[11px] text-text-3">
                  {a.views} views · {a.helpful} helpful
                </p>
              </div>
              <div
                className="flex shrink-0 flex-wrap items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {(isOwner || (isAgent && a.createdBy === user?.id && a.status === "draft")) && (
                  <button
                    type="button"
                    onClick={() => openEdit(a)}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
                  >
                    <Icon name="edit" size={13} />
                    Edit
                  </button>
                )}
                {isAgent && a.createdBy === user?.id && a.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => void submitForReview(a)}
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-info transition-colors hover:bg-surface-3"
                  >
                    <Icon name="send" size={12} />
                    Submit for review
                  </button>
                )}
                {isOwner && a.status === "pending_review" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void approve(a)}
                      className="inline-flex items-center gap-1 rounded-sm border border-green-700/30 bg-green-500/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-green-600 dark:text-green-400 transition-colors hover:opacity-80"
                    >
                      <Icon name="check" size={12} />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRejectTarget(a); setRejectNote(""); }}
                      className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-danger transition-colors hover:opacity-80"
                    >
                      <Icon name="close" size={12} />
                      Reject
                    </button>
                  </>
                )}
                {isOwner && a.status !== "pending_review" && (
                  <button
                    type="button"
                    onClick={() =>
                      void publish(a, (a.status ?? "published") === "published" ? "draft" : "published")
                    }
                    className="inline-flex items-center gap-1 rounded-sm border border-primary-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-primary transition-colors duration-150 hover:bg-primary hover:text-white hover:border-primary"
                  >
                    <Icon name={a.status === "draft" ? "eye" : "eye-off"} size={12} />
                    {a.status === "draft" ? "Publish" : "Move to drafts"}
                  </button>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setDeleting(a)}
                    className="inline-flex items-center gap-1 rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-semibold text-danger transition-colors hover:bg-danger-soft/70"
                  >
                    <Icon name="close" size={13} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Article Detail View Modal */}
      {viewingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-md border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="book" size={16} className="text-primary shrink-0" />
                <h2 className="text-[16px] font-bold text-text truncate">{viewingArticle.title}</h2>
                <Pill status={viewingArticle.status ?? "published"} />
              </div>
              <button onClick={() => setViewingArticle(null)} className="rounded-sm p-1 text-text-3 hover:text-text">
                <Icon name="close" size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {viewingArticle.category && (
                <div>
                  <span className="text-micro uppercase text-text-3 block mb-1">Category</span>
                  <span className="inline-flex rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[12px] font-semibold text-text-2">
                    {viewingArticle.category}
                  </span>
                </div>
              )}
              {viewingArticle.rejectNote && (
                <div className="rounded-sm border border-danger-border bg-danger-soft p-3 text-[12.5px] text-danger">
                  <strong>Revision requested:</strong> {viewingArticle.rejectNote}
                </div>
              )}
              <div>
                <span className="text-micro uppercase text-text-3 block mb-1">Article Content</span>
                <div className="rounded-sm border border-border bg-surface-2 p-4 text-[13.5px] leading-relaxed text-text whitespace-pre-wrap">
                  {viewingArticle.content || viewingArticle.body || viewingArticle.snippet}
                </div>
              </div>
              <div className="flex items-center gap-4 text-[12px] text-text-3 pt-2">
                <span>{viewingArticle.views} Views</span>
                <span>•</span>
                <span>{viewingArticle.helpful} Helpful</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={() => setViewingArticle(null)} className="rounded-sm border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2">
                Close
              </button>
              {(isOwner || (isAgent && viewingArticle.createdBy === user?.id && viewingArticle.status === "draft")) && (
                <button onClick={() => openEdit(viewingArticle)} className="inline-flex items-center gap-1 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-primary-dark">
                  <Icon name="edit" size={13} /> Edit Article
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Article Create / Edit Modal */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "new" ? "New article" : "Edit article"}
        icon="book"
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              {modal === "new" ? (isAgent ? "Create Draft" : "Create Article") : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Title *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. How to reset your transfer PIN"
              className={cn("input-control")}
              autoFocus
            />
          </label>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-micro uppercase text-text-3">Category</span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Payments"
                className={cn("input-control")}
              />
            </label>
            {isOwner ? (
              <label className="block">
                <span className="mb-1.5 block text-micro uppercase text-text-3">Status</span>
                <Select
                  value={status}
                  onChange={setStatus}
                  options={STATUS_OPTIONS}
                  ariaLabel="Article status"
                  className="w-full"
                />
              </label>
            ) : (
              <div className="block">
                <span className="mb-1.5 block text-micro uppercase text-text-3">Status</span>
                <div className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-[12.5px] font-medium text-text-2">
                  Draft (Submit for owner review after creating)
                </div>
              </div>
            )}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-micro uppercase text-text-3">Body *</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="What customers and agents need to know…"
              className="input-control resize-y"
            />
          </label>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete article"
        icon="book"
        confirmLabel="Delete article"
        busy={removing}
        onConfirm={() => deleting && void remove(deleting)}
        description={
          deleting && (
            <>
              <b className="text-text">{deleting.title}</b> will be removed from the knowledge
              base. The assistant stops deflecting with it and the help centre no longer lists it.
            </>
          )
        }
      />

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-surface p-5">
            <h2 className="mb-3 text-[15px] font-bold text-text">Reject article</h2>
            <p className="mb-3 text-[13px] text-text-2">
              Returning <b>{rejectTarget.title}</b> to draft. Add a note to help the author revise it.
            </p>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (optional)…"
              className="input-control resize-y"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectTarget(null)} className="rounded-sm border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2">
                Cancel
              </button>
              <button
                onClick={() => void reject()}
                disabled={rejecting}
                className="inline-flex items-center gap-1.5 rounded-sm border border-danger-border bg-danger-soft px-3.5 py-1.5 text-[12.5px] font-semibold text-danger hover:opacity-80 disabled:opacity-50"
              >
                {rejecting ? <Spinner size={13} /> : <Icon name="close" size={13} />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
