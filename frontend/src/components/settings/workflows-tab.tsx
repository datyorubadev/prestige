"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export interface WorkflowRule {
  id: string;
  name: string;
  trigger: string;
  condition: string;
  action: string;
  active: boolean;
  runCount: number;
}

const DEFAULT_WORKFLOWS: WorkflowRule[] = [
  {
    id: "wf-1",
    name: "High Confidence AI Auto-Responder",
    trigger: "Customer sends message",
    condition: "AI Confidence > 85%",
    action: "Respond automatically & resolve ticket",
    active: true,
    runCount: 142,
  },
  {
    id: "wf-2",
    name: "Urgent Billing Keyword Escalation",
    trigger: "Email or chat contains 'refund' or 'billing'",
    condition: "Priority == High",
    action: "Assign to Billing Team & Notify Agent",
    active: true,
    runCount: 58,
  },
  {
    id: "wf-3",
    name: "VIP Customer Priority Router",
    trigger: "Ticket created",
    condition: "Customer.is_vip == true",
    action: "Set Priority = Urgent & Assign to Owner",
    active: false,
    runCount: 12,
  },
];

export function WorkflowsTab() {
  const [workflows, setWorkflows] = useState<WorkflowRule[]>(DEFAULT_WORKFLOWS);
  const [saved, setSaved] = useState(false);

  const toggleActive = (id: string) => {
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, active: !w.active } : w))
    );
  };

  return (
    <div className="flex flex-col gap-6 text-text">
      <div>
        <h2 className="text-h2 font-semibold">Workflow & Automation Builder</h2>
        <p className="mt-1 text-[13px] text-text-3">
          Configure visual trigger-condition-action pipelines (§19 Workflow Engine) to automate ticket routing, escalations, and AI autonomous responses.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4 text-[13px]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary font-bold">
                  ⚡
                </div>
                <div>
                  <p className="font-bold text-text">{wf.name}</p>
                  <p className="text-[11.5px] text-text-3">Executed {wf.runCount} times</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleActive(wf.id)}
                className={`rounded px-3 py-1 text-[11.5px] font-bold ${
                  wf.active ? "bg-emerald-500/10 text-emerald-600" : "bg-surface-3 text-text-3"
                }`}
              >
                {wf.active ? "✓ Active Pipeline" : "Paused"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-[12px]">
              <div>
                <span className="text-micro font-bold uppercase tracking-wider text-text-3">WHEN (Trigger)</span>
                <p className="mt-0.5 font-medium text-text">{wf.trigger}</p>
              </div>
              <div>
                <span className="text-micro font-bold uppercase tracking-wider text-text-3">IF (Conditions)</span>
                <p className="mt-0.5 font-medium text-text">{wf.condition}</p>
              </div>
              <div>
                <span className="text-micro font-bold uppercase tracking-wider text-text-3">THEN (Actions)</span>
                <p className="mt-0.5 font-medium text-text">{wf.action}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
