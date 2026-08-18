import type { ReactNode } from "react";

/**
 * Lightweight message-body renderer (Chatwoot-style markdown, no dependencies).
 *
 * Supports the subset agents actually type in a reply:
 *   **bold**, *italic*, `inline code`, ```fenced code```,
 *   [link text](https://…) — external links only, plain http(s) URLs,
 *   "- " / "* " bullet lists, "1. " numbered lists, and hard line breaks.
 * Everything else stays literal. Output is built as React nodes — no
 * dangerouslySetInnerHTML, so message text can never inject markup.
 */

interface MarkdownProps {
  text: string;
  /** Render as a single inline span (no block spacing) — used in previews. */
  inline?: boolean;
  /** Extra class for the wrapping element. */
  className?: string;
}

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]\n]+\]\([^)\s]+\))/g;
const CODE_BLOCK_RE = /```([\s\S]*?)```/g;

/** Builds React nodes for inline markdown (bold / italic / code / links). */
function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(INLINE_RE);
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (!part) return;
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push(<strong key={key}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      out.push(<em key={key}>{part.slice(1, -1)}</em>);
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push(
        <code
          key={key}
          className="rounded-sm bg-black/10 px-1 py-px font-mono text-[0.92em] dark:bg-white/10"
        >
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part.startsWith("[") && part.includes("](")) {
      const close = part.indexOf("](");
      const label = part.slice(1, close);
      const url = part.slice(close + 2, -1);
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          out.push(
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-info underline underline-offset-2"
            >
              {label || url}
            </a>,
          );
          return;
        }
      } catch {
        // not a parseable URL — fall through to literal text
      }
      out.push(part);
    } else {
      out.push(part);
    }
  });
  return out;
}

function parseInlineLine(line: string, key: string): ReactNode {
  return <>{inline(line, key)}</>;
}

/** Renders a fenced code block's content (first line stripped for ```lang). */
function codeBlock(text: string, key: string): ReactNode {
  const body = text.replace(/^\s*[a-zA-Z]+\n/, "");
  return (
    <pre
      key={key}
      className="mt-1 overflow-x-auto rounded-sm bg-black/85 px-2.5 py-2 font-mono text-[11.5px] leading-snug text-white"
    >
      {body.trim()}
    </pre>
  );
}

/** Splits text on fenced code blocks, preserving everything between. */
function splitBlocks(text: string): { code?: string; rest?: string }[] {
  const out: { code?: string; rest?: string }[] = [];
  const parts = text.split(CODE_BLOCK_RE);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      out.push({ code: parts[i] });
    } else if (parts[i].length) {
      out.push({ rest: parts[i] });
    }
  }
  return out;
}

function renderLines(lines: string[], keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  let liKey = 0;

  const flush = () => {
    if (!list) return;
    const tag = list.ordered ? "ol" : "ul";
    const cls = list.ordered
      ? "mt-1 list-decimal space-y-0.5 pl-5 marker:font-semibold"
      : "mt-1 list-disc space-y-0.5 pl-5";
    out.push(
      tag === "ol" ? (
        <ol key={`${keyBase}-list-${liKey}`} className={cls}>
          {list.items}
        </ol>
      ) : (
        <ul key={`${keyBase}-list-${liKey}`} className={cls}>
          {list.items}
        </ul>
      ),
    );
    list = null;
    liKey += 1;
  };

  lines.forEach((line, i) => {
    const key = `${keyBase}-l${i}`;
    const ul = /^[-*]\s+/.exec(line);
    const ol = /^\d+[.)]\s+/.exec(line);
    if (ul || ol) {
      if (!list || (list.ordered ? !ol : !ul)) flush();
      list ??= { ordered: !!ol, items: [] };
      list.items.push(
        <li key={key} className="text-inherit">
          {parseInlineLine(line.replace(/^[-*]\s+|\d+[.)]\s+/, ""), `${key}-li`)}
        </li>,
      );
      return;
    }
    flush();
    if (!line.trim()) {
      out.push(<div key={key} className="h-1.5" />);
      return;
    }
    out.push(
      <div key={key} className="whitespace-pre-wrap">
        {parseInlineLine(line, key)}
      </div>,
    );
  });
  flush();
  return out;
}

export function Markdown({ text, inline: inlineMode = false, className }: MarkdownProps) {
  const body = String(text ?? "");

  if (inlineMode) {
    return <span className={className}>{inline(body, "md-i")}</span>;
  }

  const blocks = splitBlocks(body);
  const nodes: ReactNode[] = [];
  blocks.forEach((b, bi) => {
    if (b.code) {
      nodes.push(codeBlock(b.code, `md-code-${bi}`));
    } else if (b.rest) {
      nodes.push(...renderLines(b.rest.split("\n"), `md-${bi}`));
    }
  });

  return <div className={className}>{nodes}</div>;
}
