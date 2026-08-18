"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Icon } from "@/components/icons";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import {
  AttachButton,
  AttachmentChip,
  uploadAttachment,
} from "@/components/ui/attachments";
import { cn } from "@/lib/utils";
import type { CannedResponse, WidgetAttachment } from "@/lib/types";

interface MentionOption {
  name: string;
  color: string;
}

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (attachments?: WidgetAttachment[], status?: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  sending?: boolean;
  sendLabel?: string;
  actions?: React.ReactNode;
  hint?: string;
  variant?: "standard" | "pill";
  canned?: CannedResponse[];
  note?: boolean;
  mentions?: MentionOption[];
  className?: string;
  minRows?: number;
  maxRows?: number;
  hideChevron?: boolean;
}

type SlashMenu = { type: "slash"; query: string; start: number } | null;
type MentionMenu = { type: "mention"; query: string; start: number } | null;

function trailingToken(value: string): { token: string; start: number } {
  const start = value.lastIndexOf(" ") + 1;
  return { token: value.slice(start), start };
}

const SEND_STATUS_OPTIONS = [
  { id: "send", label: "Send", status: undefined },
  { id: "waiting_for_customer", label: "Send & Pending Customer", status: "waiting_for_customer" },
  { id: "waiting_internal", label: "Send & Pending Internal", status: "waiting_internal" },
  { id: "resolved", label: "Send & Resolve", status: "resolved" },
  { id: "closed", label: "Send & Close", status: "closed" },
];

export function MessageComposer({
  value,
  onChange,
  onSend,
  placeholder,
  ariaLabel,
  disabled,
  sending,
  sendLabel = "Send",
  actions,
  hint = "Enter to send · Shift+Enter for new line",
  variant = "standard",
  canned,
  note = false,
  mentions = [],
  className,
  minRows = 2,
  maxRows = 5,
  hideChevron = false,
}: MessageComposerProps) {
  const [attachments, setAttachments] = useState<WidgetAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [selectedStatusOption, setSelectedStatusOption] = useState(SEND_STATUS_OPTIONS[0]);
  const sendMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sendMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (sendMenuRef.current && !sendMenuRef.current.contains(e.target as Node)) {
        setSendMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [sendMenuOpen]);

  const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);

  const slash: SlashMenu = useMemo(() => {
    if (note || !canned?.length || !value.trim()) return null;
    const { token, start } = trailingToken(value);
    if (!token.startsWith("/") || token.length < 2) return null;
    return { type: "slash", query: token.slice(1).toLowerCase(), start };
  }, [value, canned, note]);

  const mention: MentionMenu = useMemo(() => {
    if (!note || mentions.length === 0) return null;
    const { token, start } = trailingToken(value);
    if (!token.startsWith("@") || token.length < 2) return null;
    return { type: "mention", query: token.slice(1).toLowerCase(), start };
  }, [value, note, mentions]);

  const slashHits = useMemo(() => {
    if (!slash) return [];
    return (canned ?? []).filter(
      (c) => c.label.toLowerCase().includes(slash.query) || c.text.toLowerCase().includes(slash.query),
    );
  }, [slash, canned]);

  const mentionHits = useMemo(() => {
    if (!mention) return [];
    return mentions.filter((m) => m.name.toLowerCase().includes(mention.query));
  }, [mention, mentions]);

  const menuOpen = slashHits.length > 0 || mentionHits.length > 0;
  const hits = slash ? slashHits : mentionHits;

  const safeIdx = Math.min(activeIdx, Math.max(hits.length - 1, 0));

  const selectHit = (index: number) => {
    if (!slash && !mention) return;
    const hit = hits[index];
    if (!hit) return;
    if (slash) {
      const cannedHit = hit as CannedResponse;
      const before = value.slice(0, slash.start);
      onChange(before ? `${before} ${cannedHit.text}` : cannedHit.text);
    } else if (mention) {
      const mentionHit = hit as MentionOption;
      const before = value.slice(0, mention.start);
      onChange(before ? `${before}@${mentionHit.name} ` : `@${mentionHit.name} `);
    }
    setActiveIdx(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!menuOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectHit(safeIdx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActiveIdx(0);
      const t = trailingToken(value);
      onChange(value.slice(0, t.start));
    }
  };

  const submit = (st?: string) => {
    if (!canSend || sending) return;
    onSend(attachments, st ?? selectedStatusOption.status);
    setAttachments([]);
    setActiveIdx(0);
  };

  const handleFile = (file: File) => {
    void uploadAttachment(file).then((a) => setAttachments((prev) => [...prev, a]));
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) handleFile(f);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void uploadAttachment(file).then((a) => setAttachments((prev) => [...prev, a]));
        }
      }
    }
  };

  const pill = variant === "pill";
  const noteHint = note
    ? "Private note — visible to your team only. @ to mention a teammate"
    : hint;

  return (
    <div
      className={cn("relative flex flex-col gap-2", className)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-surface/90 text-[13px] font-semibold text-primary backdrop-blur-xs">
          Drop files to attach
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              onRemove={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
            />
          ))}
        </div>
      )}

      {menuOpen && (
        <ul
          role="listbox"
          aria-label={slash ? "Canned responses" : "Mention team member"}
          className="menu-panel absolute bottom-full left-0 z-30 mb-1 max-h-48 w-72 overflow-y-auto rounded-md border border-border bg-surface shadow-card"
        >
          {hits.map((hit, i) => {
            const isSelected = i === safeIdx;
            return (
              <li
                key={slash ? (hit as CannedResponse).id : (hit as MentionOption).name}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectHit(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[12.5px]",
                  isSelected ? "bg-surface-3 text-text font-medium" : "text-text-2 hover:bg-surface-2",
                )}
              >
                {slash ? (
                  <>
                    <span className="font-semibold text-text">/{(hit as CannedResponse).label}</span>
                    <span className="truncate text-[11.5px] text-text-3">
                      {(hit as CannedResponse).text}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold text-white"
                        style={{ backgroundColor: (hit as MentionOption).color }}
                      >
                        {(hit as MentionOption).name.charAt(0)}
                      </span>
                      <span className="text-[12px] font-semibold text-text">
                        {(hit as MentionOption).name}
                      </span>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pill ? (
        <div className="flex items-center gap-2 w-full">
          <AttachButton
            onChange={handleFile}
            multiple
            className="shrink-0"
            buttonClassName="h-9 w-9 border border-border/80 bg-surface text-text-2 hover:bg-surface-2"
          />
          <EmojiPicker
            onPick={(e) => onChange(value + e)}
            align="left"
            className="shrink-0"
            buttonClassName="h-9 w-9 border border-border/80 bg-surface text-text-2 hover:bg-surface-2"
          />
          <div className="flex-1 min-w-0 flex items-center min-h-[36px] max-h-[102px] rounded-[20px] border border-border bg-surface px-3 py-1.5 transition-colors duration-150 focus-within:border-primary-border">
            <AutosizeTextarea
              value={value}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={handlePaste}
              onEnter={() => submit()}
              ariaLabel={ariaLabel ?? "Message"}
              placeholder={placeholder ?? "Type a message…"}
              minRows={1}
              maxRows={4}
              disabled={disabled}
              className="min-w-0 flex-1 resize-none border-0 bg-transparent p-0 text-[12.5px] leading-snug text-text placeholder:text-text-3 outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 shadow-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            />
          </div>
          <button
            type="button"
            onClick={() => submit()}
            disabled={!canSend}
            aria-label={sendLabel}
            title={sendLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 shadow-xs"
          >
            <Icon name="send" size={15} />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col rounded-sm border bg-surface shadow-card transition-colors duration-150 focus-within:border-primary-border",
            note ? "border-warning-border bg-warning-soft/60" : "border-border",
          )}
        >
          {note && (
            <div className="flex items-center gap-1.5 border-b border-warning-border/60 px-3 py-1.5">
              <Icon name="lock" size={11} className="text-warning" />
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-warning-dark">
                Private note — visible to your team only
              </span>
            </div>
          )}
          <AutosizeTextarea
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            onEnter={() => submit()}
            ariaLabel={ariaLabel ?? "Message"}
            placeholder={
              placeholder ??
              (note ? "Write an internal note… (@ to mention a teammate)" : "Type a message…")
            }
            minRows={2}
            maxRows={4}
            disabled={disabled}
            className="min-w-0 w-full resize-none rounded-t-sm border-0 bg-transparent px-3 py-2 text-[13px] leading-snug text-text placeholder:text-text-3"
          />
          <div className="flex items-center gap-1.5 border-t border-border px-2 py-1.5">
            <AttachButton onChange={handleFile} multiple />
            <EmojiPicker onPick={(e) => onChange(value + e)} align="left" />
            {actions}
            <p className="ml-2 hidden shrink-0 text-[11px] text-text-3 sm:block">{note ? noteHint : hint}</p>
            <div className="ml-auto" />

            {/* Chatwoot-style Split Send Button with status options */}
            {!note ? (
              hideChevron ? (
                <button
                  type="button"
                  onClick={() => submit()}
                  disabled={!canSend}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="send" size={14} />
                  Send
                </button>
              ) : (
                <div ref={sendMenuRef} className="relative inline-flex rounded-sm bg-primary text-white shadow-xs">
                  <button
                    type="button"
                    onClick={() => submit()}
                    disabled={!canSend}
                    className="inline-flex items-center gap-1.5 rounded-l-sm px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon name="send" size={14} />
                    {selectedStatusOption.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMenuOpen((o) => !o)}
                    disabled={!canSend}
                    className="border-l border-white/20 px-1.5 py-1.5 text-white hover:bg-primary-dark rounded-r-sm disabled:opacity-50"
                  >
                    <Icon name="chevron-down" size={12} />
                  </button>

                {sendMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-1 z-30 w-52 rounded-md border border-border bg-surface py-1 shadow-card text-left">
                    {SEND_STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelectedStatusOption(opt);
                          setSendMenuOpen(false);
                          submit(opt.status);
                        }}
                        className="w-full px-3 py-1.5 text-left text-[12px] font-medium text-text hover:bg-surface-2 transition-colors flex items-center justify-between"
                      >
                        <span>{opt.label}</span>
                        {selectedStatusOption.id === opt.id && <Icon name="check" size={12} className="text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : (
              <button
                type="button"
                onClick={() => submit()}
                disabled={!canSend}
                className="inline-flex items-center justify-center gap-1.5 rounded-sm bg-warning-dark px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-warning disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="send" size={14} />
                Add Note
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
