"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export function WidgetBuilderTab() {
  const [title, setTitle] = useState("Customer Support");
  const [welcomeMsg, setWelcomeMsg] = useState("Hi there! How can we help you today?");
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [aiName, setAiName] = useState("Prestige AI Assistant");
  const [preChatForm, setPreChatForm] = useState(true);
  const [copied, setCopied] = useState(false);

  const embedScript = `<script src="https://prestige.com/widget.js" data-widget-id="w123"></script>`;

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 text-text">
      <div>
        <h2 className="text-h2 font-semibold">Website AI Chat Widget Builder</h2>
        <p className="mt-1 text-[13px] text-text-3">
          Configure and customize your website AI chat launcher with live preview (§12 Website Chat Widget).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Config Form */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[12.5px] font-semibold text-text">Widget Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] text-text focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[12.5px] font-semibold text-text">AI Assistant Name</label>
            <input
              type="text"
              value={aiName}
              onChange={(e) => setAiName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] text-text focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[12.5px] font-semibold text-text">Welcome Message</label>
            <textarea
              value={welcomeMsg}
              onChange={(e) => setWelcomeMsg(e.target.value)}
              className="mt-1 w-full h-20 rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[12.5px] font-semibold text-text">Brand Theme Color</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-9 cursor-pointer rounded border border-border bg-transparent p-0"
              />
              <span className="font-mono text-[13px] font-bold text-text">{brandColor}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="prechat"
              checked={preChatForm}
              onChange={(e) => setPreChatForm(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-0"
            />
            <label htmlFor="prechat" className="text-[13px] text-text font-medium">
              Require Pre-Chat Form (Name & Email)
            </label>
          </div>

          {/* Embed Script Code */}
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-micro font-bold uppercase tracking-wider text-text-3">HTML Embed Snippet</span>
              <button
                type="button"
                onClick={copyEmbed}
                className="flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
              >
                <Icon name={copied ? "check" : "copy"} size={13} />
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>
            <pre className="mt-2 overflow-x-auto rounded bg-surface p-2.5 font-mono text-[11.5px] text-text-2">
              {embedScript}
            </pre>
          </div>
        </div>

        {/* Live Interactive Preview */}
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-2 p-6">
          <p className="text-micro font-bold uppercase tracking-wider text-text-3 mb-4">Live Widget Preview</p>

          <div className="w-[320px] rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3.5 text-white" style={{ backgroundColor: brandColor }}>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 font-bold text-[12px]">
                  ✨
                </div>
                <div>
                  <p className="font-bold text-[13px]">{title}</p>
                  <p className="text-[10.5px] opacity-90">{aiName}</p>
                </div>
              </div>
              <Icon name="x" size={16} className="cursor-pointer opacity-80 hover:opacity-100" />
            </div>

            {/* Chat Body */}
            <div className="flex flex-col gap-3 p-3.5 bg-surface min-h-[200px] text-[12px]">
              <div className="self-start max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 p-2.5 text-text">
                {welcomeMsg}
              </div>

              {preChatForm && (
                <div className="rounded-lg border border-border bg-surface-2 p-3 text-[11.5px]">
                  <p className="font-bold text-text mb-2">Introduce yourself:</p>
                  <input placeholder="Your Name" className="w-full rounded border border-border bg-surface px-2 py-1 mb-1.5" />
                  <input placeholder="Your Email" className="w-full rounded border border-border bg-surface px-2 py-1 mb-2" />
                  <button className="w-full rounded py-1 font-semibold text-white text-[11px]" style={{ backgroundColor: brandColor }}>
                    Start Chat
                  </button>
                </div>
              )}
            </div>

            {/* Footer Composer */}
            <div className="border-t border-border p-2.5 bg-surface flex items-center gap-2">
              <input placeholder="Type a message…" className="flex-1 rounded border border-border bg-surface-2 px-2.5 py-1 text-[12px]" />
              <button className="rounded p-1.5 text-white" style={{ backgroundColor: brandColor }}>
                <Icon name="send" size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
