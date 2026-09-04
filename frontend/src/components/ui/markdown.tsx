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

function parseMarkdownTable(tableLines: string[], keyBase: string): ReactNode {
  if (tableLines.length < 2) {
    return (
      <div key={keyBase} className="whitespace-pre-wrap">
        {tableLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    );
  }

  const cleanCells = (row: string) =>
    row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const headerCells = cleanCells(tableLines[0]);
  let dataLines = tableLines.slice(1);
  if (dataLines.length > 0 && dataLines[0].split("|").every((c) => /^\s*:?-+:?\s*$/.test(c) || !c.trim())) {
    dataLines = dataLines.slice(1);
  }

  return (
    <div key={keyBase} className="my-2 max-w-full overflow-x-auto rounded border border-border">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-border bg-surface-2/80 font-semibold text-text">
            {headerCells.map((cell, ci) => (
              <th key={ci} className="px-3 py-2">
                {parseInlineLine(cell, `${keyBase}-th-${ci}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {dataLines.map((row, ri) => {
            const cells = cleanCells(row);
            return (
              <tr key={ri} className="hover:bg-surface-2/40 transition-colors">
                {cells.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-text-2">
                    {parseInlineLine(cell, `${keyBase}-td-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderLines(lines: string[], keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  let liKey = 0;
  let tableRows: string[] | null = null;
  let tableKey = 0;

  const flushTable = () => {
    if (!tableRows) return;
    out.push(parseMarkdownTable(tableRows, `${keyBase}-tbl-${tableKey}`));
    tableRows = null;
    tableKey += 1;
  };

  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? "ol" : "ul";
    const cls = list.ordered
      ? "mt-1 list-decimal space-y-0.5 pl-5 marker:font-semibold text-text"
      : "mt-1 list-disc space-y-0.5 pl-5 text-text";
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

  const flushAll = () => {
    flushList();
    flushTable();
  };

  lines.forEach((line, i) => {
    const key = `${keyBase}-l${i}`;
    const trimmed = line.trim();

    // Table rows
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1)) {
      flushList();
      tableRows ??= [];
      tableRows.push(trimmed);
      return;
    }
    flushTable();

    // Lists
    const ul = /^[-*]\s+/.exec(line);
    const ol = /^\d+[.)]\s+/.exec(line);
    if (ul || ol) {
      if (!list || (list.ordered ? !ol : !ul)) flushList();
      list ??= { ordered: !!ol, items: [] };
      list.items.push(
        <li key={key} className="text-inherit">
          {parseInlineLine(line.replace(/^[-*]\s+|\d+[.)]\s+/, ""), `${key}-li`)}
        </li>,
      );
      return;
    }
    flushList();

    // Blank line
    if (!trimmed) {
      out.push(<div key={key} className="h-1.5" />);
      return;
    }

    // Horizontal Rule
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      out.push(<hr key={key} className="my-3 border-border" />);
      return;
    }

    // Headings
    if (trimmed.startsWith("#### ")) {
      out.push(
        <h4 key={key} className="mt-2.5 mb-1 font-bold text-[13.5px] text-text">
          {parseInlineLine(trimmed.slice(5), key)}
        </h4>,
      );
      return;
    }
    if (trimmed.startsWith("### ")) {
      out.push(
        <h3 key={key} className="mt-3 mb-1.5 font-bold text-[14.5px] text-text">
          {parseInlineLine(trimmed.slice(4), key)}
        </h3>,
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      out.push(
        <h2 key={key} className="mt-3.5 mb-1.5 font-bold text-[16px] text-text border-b border-border/40 pb-1">
          {parseInlineLine(trimmed.slice(3), key)}
        </h2>,
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      out.push(
        <h1 key={key} className="mt-4 mb-2 font-extrabold text-[18px] text-text border-b border-border pb-1.5">
          {parseInlineLine(trimmed.slice(2), key)}
        </h1>,
      );
      return;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      out.push(
        <blockquote key={key} className="my-1.5 rounded-r border-l-2 border-primary/70 bg-surface-2/60 px-3 py-1.5 text-[12.5px] italic text-text-2">
          {parseInlineLine(trimmed.slice(2), key)}
        </blockquote>,
      );
      return;
    }

    // Normal text line
    out.push(
      <div key={key} className="whitespace-pre-wrap">
        {parseInlineLine(line, key)}
      </div>,
    );
  });

  flushAll();
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
