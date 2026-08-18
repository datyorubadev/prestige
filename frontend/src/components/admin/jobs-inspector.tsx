"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export interface JobRow {
  id: string;
  type: string;
  tenantName: string;
  status: "completed" | "failed" | "processing" | "pending";
  attempts: number;
  error?: string;
  createdAt: string;
}

const MOCK_JOBS: JobRow[] = [
  {
    id: "job-101",
    type: "rag_ingest",
    tenantName: "Acme Corp",
    status: "completed",
    attempts: 1,
    createdAt: "2 mins ago",
  },
  {
    id: "job-102",
    type: "webhook_delivery",
    tenantName: "Globex",
    status: "failed",
    attempts: 3,
    error: "HTTP 504 Gateway Timeout from endpoint https://api.globex.com/webhooks",
    createdAt: "10 mins ago",
  },
  {
    id: "job-103",
    type: "email_send",
    tenantName: "Stark Tech",
    status: "completed",
    attempts: 1,
    createdAt: "15 mins ago",
  },
  {
    id: "job-104",
    type: "sla_check",
    tenantName: "Acme Corp",
    status: "completed",
    attempts: 1,
    createdAt: "22 mins ago",
  },
];

export function JobsInspector() {
  const [jobs, setJobs] = useState<JobRow[]>(MOCK_JOBS);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const retryJob = (id: string) => {
    setRetryingId(id);
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: "completed", attempts: j.attempts + 1, error: undefined } : j))
      );
      setRetryingId(null);
    }, 1200);
  };

  return (
    <div className="flex flex-col gap-6 text-text">
      <header>
        <h1 className="text-h1 font-bold text-text">Background Jobs & Queue Inspector</h1>
        <p className="mt-1 text-[13px] text-text-3">
          Inspect background workers, failed tasks, and trigger 1-click retries (§31 Background Jobs).
        </p>
      </header>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-micro font-bold uppercase tracking-wider text-text-3 mb-3">Recent Background Jobs</h3>
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-surface-2 p-3 text-[12.5px]"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-text">#{job.id}</span>
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  {job.type}
                </span>
                <span className="text-text-3">|</span>
                <span className="font-medium text-text">{job.tenantName}</span>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-text-3 font-mono text-[11.5px]">{job.createdAt}</span>
                <span
                  className={`rounded px-2 py-0.5 text-[10.5px] font-bold uppercase ${
                    job.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : job.status === "failed"
                      ? "bg-red-500/10 text-red-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  {job.status} ({job.attempts} retries)
                </span>

                {job.status === "failed" && (
                  <button
                    type="button"
                    disabled={retryingId === job.id}
                    onClick={() => retryJob(job.id)}
                    className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    <Icon name="refresh-cw" size={12} className={retryingId === job.id ? "animate-spin" : ""} />
                    {retryingId === job.id ? "Retrying…" : "Retry Now"}
                  </button>
                )}
              </div>

              {job.error && (
                <div className="w-full border-t border-red-500/20 pt-2 font-mono text-[11px] text-red-500">
                  Error: {job.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
