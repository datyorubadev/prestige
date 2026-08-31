"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

export interface JobRow {
  id: string;
  type: string;
  tenant: string;
  status: "completed" | "failed" | "running" | "pending" | "cancelled";
  attempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function JobsInspector() {
  const toast = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  const fetchJobs = () => {
    const qs = filter ? `?status=${filter}` : "";
    api.get<JobRow[]>(`/platform/jobs${qs}`).then((data) => {
      setJobs(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchJobs(); }, [filter]);

  const retryJob = async (id: string) => {
    setRetryingId(id);
    try {
      const updated = await api.post<JobRow>(`/platform/jobs/${id}/retry`);
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
      toast("Job retry initiated");
    } catch {
      toast("Could not retry job", "danger");
    } finally {
      setRetryingId(null);
    }
  };

  const cancelJob = async (id: string) => {
    try {
      const updated = await api.post<JobRow>(`/platform/jobs/${id}/cancel`);
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
      toast("Job cancelled");
    } catch {
      toast("Could not cancel job", "danger");
    }
  };

  const statusColor = (s: string) =>
    s === "completed" ? "bg-emerald-500/10 text-emerald-600"
      : s === "failed" ? "bg-red-500/10 text-red-600"
        : s === "cancelled" ? "bg-gray-100 text-gray-500"
          : "bg-amber-500/10 text-amber-600";

  const timeAgo = (iso: string) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-text">
      <header>
        <h1 className="text-h1 font-bold text-text">Background Jobs & Queue Inspector</h1>
        <p className="mt-1 text-[13px] text-text-3">
          Inspect background workers, failed tasks, and trigger retries.
        </p>
      </header>

      <div className="flex items-center gap-2">
        {["", "completed", "failed", "running", "cancelled"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors ${
              filter === f ? "bg-primary text-white" : "bg-surface-2 text-text-2 hover:bg-surface-3"
            }`}
          >
            {f || "All"}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="text-micro font-bold uppercase tracking-wider text-text-3 mb-3">Recent Background Jobs</h3>
        <div className="flex flex-col gap-2">
          {jobs.length === 0 && (
            <p className="py-8 text-center text-[13px] text-text-3">No jobs found.</p>
          )}
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
                <span className="font-medium text-text">{job.tenant}</span>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-text-3 font-mono text-[11.5px]">{timeAgo(job.createdAt)}</span>
                <span className={`rounded px-2 py-0.5 text-[10.5px] font-bold uppercase ${statusColor(job.status)}`}>
                  {job.status} ({job.attempts})
                </span>

                {job.status === "failed" && (
                  <button
                    type="button"
                    disabled={retryingId === job.id}
                    onClick={() => void retryJob(job.id)}
                    className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    <Icon name="refresh-cw" size={12} className={retryingId === job.id ? "animate-spin" : ""} />
                    {retryingId === job.id ? "Retrying…" : "Retry"}
                  </button>
                )}
                {(job.status === "running" || job.status === "pending") && (
                  <button
                    type="button"
                    onClick={() => void cancelJob(job.id)}
                    className="rounded bg-red-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-red-600 hover:bg-red-500/20"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
