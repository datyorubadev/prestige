"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { KnowledgeArticle } from "@/lib/types";

type Feedback = "yes" | "no" | null;

interface ArticleViewerProps {
  article: KnowledgeArticle | null;
  onClose: () => void;
  /** Opens the create-ticket flow (design.md §5 P5.4 KB → support loop). */
  onContactSupport: () => void;
  onUpdate?: (article: KnowledgeArticle) => void;
}

/** Help-center article reader (design.md §4.4 KB article view): title + meta,
 * ~65ch body, ends with "Was this helpful?" feedback. A "no" always offers
 * the path to a human. */
export function ArticleViewer({ article, onClose, onContactSupport, onUpdate }: ArticleViewerProps) {
  const [currentArticle, setCurrentArticle] = useState<KnowledgeArticle | null>(article);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (article) {
      setCurrentArticle(article);
      setFeedback(null);
      // Increment views count on the backend
      api
        .post<KnowledgeArticle>(`/portal/articles/${article.id}/view`, {})
        .then((updated) => {
          setCurrentArticle(updated);
          onUpdate?.(updated);
        })
        .catch(() => {});
    }
  }, [article?.id]);

  if (!currentArticle) return null;

  const answered = feedback !== null;

  const handleFeedback = (helpful: boolean) => {
    setFeedback(helpful ? "yes" : "no");
    api
      .post<KnowledgeArticle>(`/portal/articles/${currentArticle.id}/feedback`, { helpful })
      .then((updated) => {
        setCurrentArticle(updated);
        onUpdate?.(updated);
      })
      .catch(() => {});
  };

  return (
    <Modal
      open={!!article}
      onClose={onClose}
      title="Help article"
      icon="book"
      size="lg"
      ariaLabel={currentArticle.title}
    >
      <article className="max-w-[65ch]">
        <h2 className="text-[19px] font-extrabold tracking-tight text-text">{currentArticle.title}</h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] font-medium text-text-3">
          <span className="flex items-center gap-1">
            <Icon name="eye" size={12} />
            {(currentArticle.views ?? 0).toLocaleString()} views
          </span>
          <span className="flex items-center gap-1">
            <Icon name="smile" size={12} />
            {currentArticle.helpful ?? 0}% helpful
          </span>
        </p>

        <div className="my-4 h-px bg-border" />

        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">
          {currentArticle.content || currentArticle.body || currentArticle.snippet}
        </p>
      </article>

      <div className="mt-6 border-t border-border pt-4">
        {!answered ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] font-semibold text-text">Was this helpful?</p>
            <div className="flex gap-2">
              <FeedbackButton tone="yes" onClick={() => handleFeedback(true)}>
                Yes
              </FeedbackButton>
              <FeedbackButton tone="no" onClick={() => handleFeedback(false)}>
                No
              </FeedbackButton>
            </div>
          </div>
        ) : feedback === "yes" ? (
          <div className="flex items-center gap-2.5 rounded-md bg-primary-soft px-3.5 py-2.5 text-[13px] font-semibold text-primary-dark border border-primary-border animate-in fade-in">
            <Icon name="check" size={15} />
            Thanks — glad that answered it! Can we help with anything else?
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-md bg-warning-soft px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between border border-warning-border animate-in fade-in">
            <div className="flex items-center gap-2.5 text-[13px] font-semibold text-warning-dark">
              <Icon name="zap" size={15} />
              Sorry this didn&apos;t help.
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onContactSupport();
              }}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark"
            >
              <Icon name="send" size={13} />
              Talk to support
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function FeedbackButton({
  tone,
  onClick,
  children,
}: {
  tone: "yes" | "no";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all duration-150",
        tone === "yes"
          ? "border-primary-border bg-primary-soft text-primary-dark hover:border-primary hover:bg-primary hover:text-white"
          : "border-border bg-surface text-text-2 hover:border-border-strong hover:bg-surface-3 hover:text-text",
      )}
    >
      {tone === "yes" ? (
        <Icon
          name="smile"
          size={14}
          className="text-primary-dark transition-colors duration-150 group-hover:text-white"
        />
      ) : (
        <Icon
          name="close"
          size={13}
          className="text-text-3 transition-colors duration-150 group-hover:text-text"
        />
      )}
      <span>{children}</span>
    </button>
  );
}
