"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import { ticketNumberFor } from "@/lib/utils";

export interface AiToolExecutionStep {
  name: string;
  status: "success" | "requires_approval" | "rejected" | "failed";
  input: string;
  output: string;
  timestamp: string;
}

export interface AiDecisionTrailProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  /** Human-facing ticket number (e.g. "NAI20260815561159") from the ticket
   *  DTO. Falls back to a derived id when absent (mock/optimistic). */
  ticketNumber?: string;
  customerName: string;
  userPrompt: string;
  confidence: number;
  model: string;
  tokensUsed: number;
  steps: AiToolExecutionStep[];
  onApproveStep?: (stepName: string) => void;
}

export function AiDecisionTrail({
  open,
  onClose,
  ticketId,
  ticketNumber,
  customerName,
  userPrompt,
  confidence,
  model,
  tokensUsed,
  steps,
  onApproveStep,
}: AiDecisionTrailProps) {
  const isHighConfidence = confidence >= 80;
  const displayNumber = ticketNumberFor({ id: ticketId, ticketNumber });

  return (
    <Modal open={open} onClose={onClose} title="AI Action & Decision Audit Trail" size="lg">
      <div className="flex flex-col gap-4 text-text">
        {/* Header Summary Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3 text-[12.5px]">
          <div>
            <span className="text-text-3">Customer: </span>
            <span className="font-semibold text-text">{customerName}</span>
            <span className="mx-2 text-text-3">|</span>
            <span className="text-text-3">Ticket: </span>
            <span className="font-mono font-semibold text-text">{displayNumber}</span>
            <Link
              href={`/dashboard/tickets/${displayNumber}`}
              className="ml-2 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10.5px] font-medium text-primary transition-colors duration-150 hover:bg-primary/10"
            >
              <Icon name="link" size={11} />
              View ticket
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-micro font-bold uppercase tracking-wider text-text-3">Confidence:</span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                isHighConfidence ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
              }`}
            >
              {confidence}% {isHighConfidence ? "✓ Autonomous" : "⚠ Low Confidence"}
            </span>
          </div>
        </div>

        {/* Model & Token Info */}
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div className="rounded border border-border px-3 py-2">
            <p className="text-micro font-bold uppercase tracking-wider text-text-3">Model Used</p>
            <p className="mt-0.5 font-medium text-text">{model || "GPT-4o / Claude 3.5 Sonnet"}</p>
          </div>
          <div className="rounded border border-border px-3 py-2">
            <p className="text-micro font-bold uppercase tracking-wider text-text-3">Tokens Metered</p>
            <p className="mt-0.5 font-medium text-text">{tokensUsed || 420} tokens</p>
          </div>
        </div>

        {/* Request Prompt */}
        <div className="rounded-lg border border-border bg-surface p-3 text-[12.5px]">
          <p className="text-micro font-bold uppercase tracking-wider text-text-3">Customer Prompt</p>
          <p className="mt-1 font-mono text-[12px] text-text-2">"{userPrompt}"</p>
        </div>

        {/* Tool Step Execution Chain */}
        <div>
          <h4 className="text-micro font-bold uppercase tracking-wider text-text-3 mb-2">
            Executed Tool Chain ({steps.length} steps)
          </h4>

          <div className="flex flex-col gap-2.5">
            {steps.length === 0 ? (
              <div className="rounded border border-border p-4 text-center text-[12.5px] text-text-3">
                No external tool invocations were required for this response.
              </div>
            ) : (
              steps.map((step, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3 text-[12px]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="font-mono font-semibold text-text">{step.name}</span>
                    </div>

                    <span
                      className={`rounded px-2 py-0.5 text-[10.5px] font-bold uppercase ${
                        step.status === "success"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : step.status === "requires_approval"
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-red-500/10 text-red-600"
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 border-t border-border/60 pt-2 font-mono text-[11px]">
                    <div>
                      <span className="text-text-3">Input: </span>
                      <span className="text-text-2">{step.input}</span>
                    </div>
                    <div>
                      <span className="text-text-3">Output: </span>
                      <span className="text-text">{step.output}</span>
                    </div>
                  </div>

                  {step.status === "requires_approval" && onApproveStep && (
                    <div className="mt-1 flex items-center justify-end gap-2 border-t border-border/60 pt-2">
                      <button
                        type="button"
                        onClick={() => onApproveStep(step.name)}
                        className="rounded bg-emerald-600 px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-emerald-700"
                      >
                        Approve & Execute Action
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
