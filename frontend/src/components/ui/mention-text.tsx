import type { ReactNode } from "react";

interface MentionTextProps {
  text: string;
  /** Teammate names whose "@Name" mentions should be highlighted. */
  mentions?: string[];
  className?: string;
}

/** Renders note/thread text with @mentions of known teammates highlighted
 *  (Chatwoot-style violet emphasis). Falls back to plain text when no mention
 *  list is supplied. */
export function MentionText({ text, mentions = [], className }: MentionTextProps) {
  if (!mentions.length) {
    return <span className={className}>{text}</span>;
  }

  const pattern = mentions
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length)
    .join("|");
  const re = new RegExp(`(@(?:${pattern}))`, "g");
  const parts = text.split(re);

  const nodes: ReactNode[] = parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("@")) {
      return (
        <span key={i} className="rounded-sm bg-violet-soft px-1 font-semibold text-violet">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });

  return <span className={className}>{nodes}</span>;
}
