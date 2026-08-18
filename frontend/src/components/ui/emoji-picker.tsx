"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  EMOJI_BY_CATEGORY,
  EMOJI_CATEGORIES,
  SKIN_TONES,
  applySkinTone,
  searchEmojis,
  type EmojiCategory,
  type EmojiEntry,
} from "@/components/ui/emoji-data";

const RECENT_KEY = "prestige-emoji-recent";
const SKIN_KEY = "prestige-emoji-skin";
const MAX_RECENT = 24;

function loadRecents(): EmojiEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const chars: string[] = JSON.parse(raw);
    return chars
      .map((c) => EMOJI_BY_CATEGORY.flatMap((g) => g.emojis).find((e) => e.char === c))
      .filter((e): e is EmojiEntry => !!e);
  } catch {
    return [];
  }
}

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  /** Align the popover panel (defaults to right — composer toolbars sit right). */
  align?: "left" | "right";
  className?: string;
  buttonClassName?: string;
}

/** Standard emoji picker (Slack/Intercom pattern): search by name or keyword,
 *  category tabs, frequently-used row (persisted), skin-tone variants, and a
 *  hover preview. Inserts via `onPick`; closes on Esc or outside click. */
export function EmojiPicker({ onPick, align = "right", className, buttonClassName }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EmojiCategory>("smileys");
  const [tone, setTone] = useState<string>(() => {
    try {
      return localStorage.getItem(SKIN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [recents, setRecents] = useState<EmojiEntry[]>([]);
  const [hovered, setHovered] = useState<EmojiEntry | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search field when the picker opens.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => searchRef.current?.focus());
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setRecents(loadRecents());
    setQuery("");
    setCategory("smileys");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const results = useMemo(() => (query.trim() ? searchEmojis(query) : []), [query]);
  const searching = query.trim().length > 0;

  const pick = (e: EmojiEntry) => {
    const char = applySkinTone(e, tone);
    onPick(char);
    // Persist the picked emoji (base form) in recents, most-recent first.
    setRecents((prev) => {
      const next = [e, ...prev.filter((r) => r.char !== e.char)].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(
          RECENT_KEY,
          JSON.stringify(next.map((r) => r.char)),
        );
      } catch {
        // best-effort
      }
      return next;
    });
    setOpen(false);
  };

  const setSkin = (t: string) => {
    setTone(t);
    try {
      if (t) localStorage.setItem(SKIN_KEY, t);
      else localStorage.removeItem(SKIN_KEY);
    } catch {
      // best-effort
    }
  };

  const sections = searching
    ? results.length > 0
      ? [{ key: "search" as const, label: "Results", emojis: results.slice(0, 60) }]
      : []
    : EMOJI_BY_CATEGORY.filter((g) => g.key === category);

  const activeCat = searching ? null : category;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Emoji picker"
        title="Emoji"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text shadow-2xs",
          buttonClassName,
        )}
      >
        <Icon name="smile" size={15} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pick an emoji"
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute bottom-full z-30 mb-1.5 flex w-[300px] flex-col overflow-hidden rounded-md border border-border bg-surface shadow-overlay",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {/* Search */}
          <div className="relative border-b border-border p-2">
            <Icon
              name="search"
              size={13}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emoji…"
              aria-label="Search emoji"
              className="focus-ring-soft w-full rounded-sm border border-border bg-surface-2 py-1.5 pl-8 pr-2 text-[12px] text-text placeholder:text-text-3"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
              >
                <Icon name="close" size={11} />
              </button>
            )}
          </div>

          {/* Category tabs */}
          {!searching && (
            <div className="flex items-center gap-0.5 border-b border-border px-2 pt-1.5" role="tablist">
              {EMOJI_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={activeCat === c.key}
                  onClick={() => {
                    setCategory(c.key);
                    setQuery("");
                  }}
                  title={c.label}
                  aria-label={c.label}
                  className={cn(
                    "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-t-sm text-[15px] transition-colors duration-100",
                    activeCat === c.key
                      ? "bg-surface-3"
                      : "opacity-50 hover:opacity-90 hover:bg-surface-2",
                  )}
                >
                  {EMOJI_BY_CATEGORY.find((g) => g.key === c.key)?.emojis[0]?.char ?? "😀"}
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          <div className="max-h-[216px] overflow-y-auto p-1.5">
            {sections.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-text-3">No emoji found.</p>
            ) : (
              sections.map((s) => (
                <div key={s.key}>
                  <p className="sticky top-0 z-10 bg-surface px-1 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-[0.07em] text-text-3">
                    {s.label}
                  </p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {s.emojis.map((e) => {
                      const char = applySkinTone(e, tone);
                      return (
                        <button
                          key={e.char + tone}
                          type="button"
                          onClick={() => pick(e)}
                          onMouseEnter={() => setHovered(e)}
                          onMouseLeave={() => setHovered(null)}
                          aria-label={e.name}
                          title={e.name}
                          className="flex h-[30px] w-[30px] items-center justify-center rounded-sm text-[17px] transition-colors duration-100 hover:bg-surface-3"
                        >
                          {char}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer — preview + skin tone */}
          <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[16px]">
              {hovered ? applySkinTone(hovered, tone) : "🙂"}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-text-2">
              {hovered ? hovered.name : "Select an emoji"}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              {SKIN_TONES.map((s) => (
                <button
                  key={s.tone || "default"}
                  type="button"
                  onClick={() => setSkin(s.tone)}
                  aria-label={s.label}
                  title={s.label}
                  className={cn(
                    "flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] transition-transform duration-100",
                    tone === s.tone ? "scale-110 ring-2 ring-primary-border" : "opacity-70 hover:opacity-100",
                  )}
                >
                  {s.swatch}
                </button>
              ))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
