"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { USE_MOCK, api, staticUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { WidgetAttachment } from "@/lib/types";

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Reads a File into a WidgetAttachment. Every file gets a data-URL so it can
 *  be previewed in the browser or downloaded — not just images. */
export function fileToAttachment(file: File): Promise<WidgetAttachment> {
  const kind: WidgetAttachment["kind"] = file.type.startsWith("image/") ? "image" : "file";
  return new Promise((resolve) => {
    const base: WidgetAttachment = {
      id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      kind,
    };
    const reader = new FileReader();
    reader.onload = () => resolve({ ...base, dataUrl: String(reader.result) });
    reader.onerror = () => resolve(base);
    reader.readAsDataURL(file);
  });
}

/** Keep small images client-side as a thumbnail so chips/grids stay snappy.
 *  Large files (and everything else) stream from the server instead of being
 *  base64-bloated into memory. */
const IMAGE_THUMB_MAX = 1.5 * 1024 * 1024;

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
}

/** Convert a picked File into an attachment — uploaded to the backend in live
 *  mode (so any file size can be previewed by URL) or base64 data-URL in mock
 *  mode. Falls back to a data-URL when the upload fails (e.g. anonymous
 *  widget guests have no session). */
export async function uploadAttachment(file: File): Promise<WidgetAttachment> {
  if (USE_MOCK) return fileToAttachment(file);
  const kind: WidgetAttachment["kind"] = file.type.startsWith("image/") ? "image" : "file";
  const form = new FormData();
  form.append("file", file);
  try {
    const up = await api.post<UploadedFile>("/attachments/upload", form);
    const base: WidgetAttachment = {
      id: up.id ?? `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: up.name ?? file.name,
      size: up.size ?? file.size,
      type: up.type || file.type || "application/octet-stream",
      kind,
      url: staticUrl(up.url),
    };
    if (kind === "image" && file.size <= IMAGE_THUMB_MAX) {
      const dataUrl = await fileToAttachment(file);
      return { ...base, dataUrl: dataUrl.dataUrl };
    }
    return base;
  } catch {
    return fileToAttachment(file);
  }
}

/** File-type badge derived from the extension — PDF, ZIP, DOC, XLSX, etc. */
const FILE_KINDS: { ext: RegExp; label: string; icon: IconName; color: string }[] = [
  { ext: /\.pdf$/i, label: "PDF", icon: "file", color: "bg-danger-soft text-danger" },
  { ext: /\.(zip|rar|7z|tar|gz)$/i, label: "ZIP", icon: "file", color: "bg-warning-soft text-warning-dark" },
  { ext: /\.(doc|docx|txt|rtf|odt)$/i, label: "DOC", icon: "file", color: "bg-info-soft text-info" },
  { ext: /\.(xls|xlsx|csv|ods)$/i, label: "XLS", icon: "file", color: "bg-primary-soft text-primary-dark" },
  { ext: /\.(ppt|pptx|key)$/i, label: "PPT", icon: "file", color: "bg-danger-soft text-danger" },
  { ext: /\.(mp3|wav|ogg|flac|m4a)$/i, label: "AUD", icon: "file", color: "bg-violet-soft text-violet" },
  { ext: /\.(mp4|mov|avi|mkv|webm)$/i, label: "VID", icon: "file", color: "bg-info-soft text-info" },
];

export function fileKindFor(name: string) {
  return FILE_KINDS.find((k) => k.ext.test(name));
}

interface AttachmentChipProps {
  attachment: WidgetAttachment;
  onRemove?: () => void;
  className?: string;
}

/** Pending/inline attachment chip — image thumbnails or a file card with
 *  name + size, plus an optional remove (X) for composer previews. */
export function AttachmentChip({ attachment, onRemove, className }: AttachmentChipProps) {
  return (
    <span
      className={cn(
        "group inline-flex max-w-[180px] items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5",
        className,
      )}
    >
      {attachment.kind === "image" && (attachment.dataUrl || attachment.url) ? (
        <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={attachment.url ?? attachment.dataUrl} alt="" className="h-full w-full object-cover" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-surface-3 text-text-3"
        >
          <Icon name="file" size={13} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-semibold text-text">
          {attachment.name}
        </span>
        <span className="block text-[9.5px] text-text-3">{formatBytes(attachment.size)}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${attachment.name}`}
          title="Remove"
          className="-mr-0.5 ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors duration-150 hover:bg-surface-3 hover:text-text"
        >
          <Icon name="close" size={11} />
        </button>
      )}
    </span>
  );
}

/** Read-only file card shown inside a sent message bubble — type badge,
 *  filename, size. Clicking opens the full-screen preview lightbox. */
function FileCard({
  attachment,
  onPreview,
}: {
  attachment: WidgetAttachment;
  onPreview?: () => void;
}) {
  const kind = fileKindFor(attachment.name);
  const previewable = Boolean(onPreview);
  return (
    <button
      type="button"
      onClick={onPreview}
      disabled={!previewable}
      title={previewable ? `Preview ${attachment.name}` : attachment.name}
      className={cn(
        "inline-flex max-w-full items-center gap-2.5 rounded-md border border-border bg-surface/80 px-2.5 py-2 text-left",
        previewable && "cursor-pointer transition-colors duration-150 hover:border-primary/40 hover:bg-surface",
        !previewable && "cursor-default",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold",
          kind?.color ?? "bg-surface-3 text-text-3",
        )}
      >
        {kind?.label ?? "FILE"}
      </span>
      <span className="min-w-0">
        <span className="block max-w-[180px] truncate text-[12px] font-semibold text-text">
          {attachment.name}
        </span>
        <span className="block text-[10px] text-text-3">
          {formatBytes(attachment.size)}
          {attachment.dataUrl || attachment.url ? " · tap to preview" : ""}
        </span>
      </span>
      <span aria-hidden="true" className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center text-text-3">
        <Icon name="file" size={13} />
      </span>
    </button>
  );
}

type PreviewKind = "image" | "pdf" | "video" | "audio" | "other";

function previewKindOf(attachment: { name: string; type?: string }): PreviewKind {
  if ((attachment.type || "").startsWith("image/")) return "image";
  const type = (attachment.type || "").toLowerCase();
  const name = attachment.name.toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/i.test(name)) return "video";
  if (type.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a)$/i.test(name)) return "audio";
  return "other";
}

/** Full-screen preview lightbox for chat attachments — images, PDFs, video and
 *  audio render inline; anything else offers a download. Esc/arrow keys and
 *  overlay click work like the old image viewer. */
export function AttachmentLightbox({
  items,
  index,
  onClose,
}: {
  items: { src: string; name: string; kind: PreviewKind; type?: string }[];
  index: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index);
  const [prevIndex, setPrevIndex] = useState(index);
  if (index !== prevIndex) {
    setPrevIndex(index);
    setCurrent(index);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCurrent((i) => Math.min(i + 1, items.length - 1));
      if (e.key === "ArrowLeft") setCurrent((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [items.length, onClose]);

  if (items.length === 0) return null;
  const item = items[current];
  if (!item) return null;

  const renderBody = () => {
    switch (item.kind) {
      case "image":
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt={item.name}
            className="max-h-full max-w-full rounded-md object-contain shadow-overlay"
          />
        );
      case "pdf":
        return (
          <object
            data={item.src}
            type="application/pdf"
            aria-label={`Preview of ${item.name}`}
            className="h-full w-full rounded-md bg-white"
          >
            <a href={item.src} download={item.name} className="text-white underline">
              Download {item.name}
            </a>
          </object>
        );
      case "video":
        return (
          <video src={item.src} controls className="max-h-full max-w-full rounded-md shadow-overlay" />
        );
      case "audio":
        return (
          <div className="w-full max-w-md">
            <span className="mb-2 block text-[12px] text-white/70">{item.name}</span>
            <audio src={item.src} controls className="w-full" />
          </div>
        );
      default:
        return (
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-md border border-white/15 bg-white/5 p-6 text-center">
            <Icon name="file" size={28} className="text-white/70" />
            <span className="break-all text-[13px] text-white">{item.name}</span>
            <a
              href={item.src}
              download={item.name}
              className="rounded-md bg-white px-3 py-1.5 text-[12px] font-semibold text-black"
            >
              Download file
            </a>
          </div>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      className="fixed inset-0 z-[120] flex flex-col bg-black/90"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center gap-2 p-3 text-white">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{item.name}</span>
        <a
          href={item.src}
          download={item.name}
          aria-label={`Download ${item.name}`}
          title="Download"
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white/80 transition-colors duration-150 hover:bg-white/15 hover:text-white"
        >
          <Icon name="arrow-right" size={16} className="-rotate-90" />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-8 w-8 items-center justify-center rounded-sm text-white/80 transition-colors duration-150 hover:bg-white/15 hover:text-white"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setCurrent((i) => Math.max(i - 1, 0))}
            disabled={current === 0}
            aria-label="Previous attachment"
            className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors duration-150 hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Icon name="chevron-right" size={18} className="rotate-180" />
          </button>
        )}
        {renderBody()}
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setCurrent((i) => Math.min(i + 1, items.length - 1))}
            disabled={current === items.length - 1}
            aria-label="Next attachment"
            className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors duration-150 hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Icon name="chevron-right" size={18} />
          </button>
        )}
      </div>

      {items.length > 1 && (
        <p className="pb-3 text-center text-[12px] tabular-nums text-white/70">
          {current + 1} / {items.length}
        </p>
      )}
    </div>
  );
}

interface InlineAttachmentsProps {
  attachments?: WidgetAttachment[];
  /** Show images as a thumbnail grid with click-to-expand (chat bubbles). */
  grid?: boolean;
  onImageClick?: (url: string) => void;
}

/** Inline list of sent attachments inside a message bubble (read-only).
 *  Images render as a thumbnail grid; files render as type-badged cards. Any
 *  attachment with a data URL opens the full-screen preview lightbox. */
export function InlineAttachments({ attachments, grid = true, onImageClick }: InlineAttachmentsProps) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (!attachments || attachments.length === 0) return null;

  const images = attachments
    .filter((a) => a.kind === "image" && (a.dataUrl || a.url))
    .map((a) => ({ src: (a.url ?? a.dataUrl) as string, name: a.name }));
  const files = attachments.filter((a) => a.kind !== "image" || !(a.dataUrl || a.url));
  const previewItems = [
    ...images.map((i) => ({ ...i, kind: "image" as PreviewKind })),
    ...files
      .filter((a) => a.dataUrl || a.url)
      .map((a) => ({
        src: (a.url ?? a.dataUrl) as string,
        name: a.name,
        kind: previewKindOf(a),
        type: a.type,
      })),
  ];

  return (
    <span className="mt-1.5 flex flex-col gap-1.5">
      {images.length > 0 && (
        <span
          className={cn(
            "grid gap-1",
            grid && images.length > 1 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {images.map((img, i) => (
            <button
              key={img.name + i}
              type="button"
              onClick={() => {
                if (onImageClick) onImageClick(img.src);
                else setLightbox(i);
              }}
              aria-label={`View ${img.name}`}
              title={img.name}
              className={cn(
                "group relative overflow-hidden rounded-sm border border-border",
                grid && images.length === 1 && "max-w-[220px]",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.src}
                alt={img.name}
                className={cn(
                  "h-full w-full object-cover transition-opacity duration-150 group-hover:opacity-90",
                  grid ? (images.length === 1 ? "max-h-[180px]" : "max-h-[140px]") : "max-h-[120px]",
                )}
              />
            </button>
          ))}
        </span>
      )}
      {files.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {files.map((a) => (
            <FileCard
              key={a.id}
              attachment={a}
              onPreview={
                a.dataUrl || a.url ? () => setLightbox(images.length + files.indexOf(a)) : undefined
              }
            />
          ))}
        </span>
      )}
      {lightbox !== null && (
        <AttachmentLightbox
          items={previewItems}
          index={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </span>
  );
}

interface AttachButtonProps {
  onChange: (file: File) => void;
  className?: string;
  buttonClassName?: string;
  label?: string;
  multiple?: boolean;
}

/** Paperclip toolbar button wired to a hidden <input type="file">. */
export function AttachButton({ onChange, className, buttonClassName, label, multiple }: AttachButtonProps) {
  return (
    <span className={className}>
      <label
        role="button"
        aria-label={label ?? "Attach a file"}
        title={label ?? "Attach a file"}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const input = (e.currentTarget as HTMLElement).querySelector("input[type=file]") as HTMLInputElement | null;
            input?.click();
          }
        }}
        className={cn(
          "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border/80 bg-surface text-text-2 transition-colors duration-150 hover:bg-surface-3 hover:text-text shadow-2xs",
          buttonClassName,
        )}
      >
        <Icon name="paperclip" size={15} />
        <input
          type="file"
          multiple={multiple}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const files = e.target.files;
            if (files) {
              for (const f of Array.from(files)) onChange(f);
            }
            e.currentTarget.value = "";
          }}
        />
      </label>
    </span>
  );
}
