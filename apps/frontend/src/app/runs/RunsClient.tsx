"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RunSummary } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePermission } from "@/context/PermissionsContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function PassRateCell({ rate, total }: { rate: number; total: number }) {
  if (total === 0) return <span className="text-slate-500">—</span>;
  return (
    <span className={cn("font-semibold", rate >= 80 ? "text-emerald-400" : rate >= 50 ? "text-amber-500" : "text-destructive")}>
      {rate}%
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    done:    "bg-emerald-950 text-emerald-400",
    running: "bg-blue-950 text-blue-400",
    pending: "bg-slate-800 text-muted-foreground",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs", variants[status] ?? "bg-slate-800 text-muted-foreground")}>
      {status}
    </span>
  );
}

function EnvBadge({ env }: { env: string }) {
  const variants: Record<string, string> = {
    staging:    "bg-blue-950 text-blue-400",
    production: "bg-orange-950 text-orange-400",
    dev:        "bg-purple-950 text-purple-400",
    qa:         "bg-teal-950 text-teal-400",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-xs", variants[env] ?? "bg-slate-800 text-muted-foreground")}>
      {env}
    </span>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RunRow({ run, canDelete }: { run: RunSummary; canDelete: boolean }) {
  const router = useRouter();
  const [rerunning,  setRerunning]  = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [rowError,   setRowError]   = useState("");

  const canRerun =
    run.status === "done" &&
    ((run.resultCounts.fail ?? 0) + (run.resultCounts.blocked ?? 0)) > 0;

  async function handleRerun() {
    setRerunning(true);
    setRowError("");
    try {
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${BASE_URL}/test-runs/${run.id}/rerun`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? "Failed to create rerun");
      }
      const newRun = await res.json();
      router.push(`/runs/${newRun.id}`);
    } catch (err: any) {
      setRowError(err?.message ?? "Failed to create rerun");
      setRerunning(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete run "${run.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setRowError("");
    try {
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${BASE_URL}/test-runs/${run.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete run (${res.status})`);
      router.refresh();
    } catch (err: any) {
      setRowError(err?.message ?? "Failed to delete run");
      setDeleting(false);
    }
  }

  return (
    <tr className="border-b border-slate-800">
      {/* Run name + metadata */}
      <td className={tdClass}>
        <div>{run.name}</div>
        {run.sourceRunName && (
          <div className="text-[11px] text-slate-500 mt-0.5">
            Rerun of: {run.sourceRunName}
          </div>
        )}
        {run.creator && (
          <div className="text-[11px] text-slate-500 mt-0.5">
            Started by {run.creator.name}
          </div>
        )}
        {rowError && (
          <div className="text-[11px] text-red-400 mt-1">{rowError}</div>
        )}
        {(run.browser || run.buildVersion || run.device) && (
          <div className="mt-1 flex gap-1.5 flex-wrap">
            {run.browser && (
              <span className="text-[11px] text-slate-400">{run.browser}</span>
            )}
            {run.device && (
              <span className="text-[11px] text-slate-500">{run.device}</span>
            )}
            {run.buildVersion && (
              <span className="text-[11px] text-slate-500 font-mono">
                {run.buildVersion}
              </span>
            )}
          </div>
        )}
      </td>

      <td className={tdClass}><EnvBadge env={run.environment} /></td>
      <td className={tdClass}><StatusBadge status={run.status} /></td>
      <td className={tdClass}><PassRateCell rate={run.passRate} total={run.total} /></td>

      {/* Result counts */}
      <td className={cn(tdClass, "text-[13px] text-muted-foreground")}>
        {run.total > 0 ? (
          <>
            <span className="text-emerald-400">✓ {run.resultCounts.pass}</span>
            {"  "}
            <span className="text-destructive">✗ {run.resultCounts.fail}</span>
            {"  "}
            <span className="text-amber-500">⊘ {run.resultCounts.blocked}</span>
            {"  "}
            <span className="text-slate-400">— {run.resultCounts.skip}</span>
          </>
        ) : (
          <span className="text-slate-500">no results</span>
        )}
      </td>

      <td className={cn(tdClass, "text-slate-400 text-[13px]")}>{timeAgo(run.createdAt)}</td>

      {/* Actions */}
      <td className={cn(tdClass, "whitespace-nowrap")}>
        <div className="flex gap-2 items-center">
          {canRerun && (
            <button
              onClick={handleRerun}
              disabled={rerunning}
              className={cn(
                "border border-amber-900 rounded px-2.5 py-0.5 text-xs font-semibold transition-colors",
                rerunning ? "text-slate-500 cursor-not-allowed" : "text-amber-400 hover:bg-amber-950 cursor-pointer"
              )}
            >
              {rerunning ? "…" : "↺ Rerun"}
            </button>
          )}
          <Link href={`/runs/${run.id}`} className="text-primary hover:underline text-sm no-underline">
            View
          </Link>
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                "border border-red-900 rounded px-2.5 py-0.5 text-xs transition-colors",
                deleting ? "text-slate-500 cursor-not-allowed" : "text-red-400 hover:bg-red-950 cursor-pointer"
              )}
            >
              {deleting ? "…" : "Delete"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export default function RunsClient({ runs }: { runs: RunSummary[] }) {
  const { user } = useAuth();
  const { can } = usePermission();
  const router = useRouter();

  const visibleRuns = useMemo(() => {
    if (can("view_all", "test_run")) {
      return runs;
    }
    const userId = user?.id;
    return runs.filter(run => run.assignedTo === userId);
  }, [runs, can, user?.id]);

  if (visibleRuns.length === 0) return null;

  return (
    <>
      {can("create", "test_run") && (
        <div className="mb-4 text-right">
          <button
            onClick={() => router.push("/test-cases")}
            className="px-4 py-2 bg-primary text-primary-foreground border-none rounded text-sm cursor-pointer hover:bg-primary/90 transition-colors"
          >
            + New Run
          </button>
        </div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className={thClass}>Run Name</th>
            <th className={thClass}>Env</th>
            <th className={thClass}>Status</th>
            <th className={thClass}>Pass Rate</th>
            <th className={thClass}>Results</th>
            <th className={thClass}>When</th>
            <th className={thClass}></th>
          </tr>
        </thead>
        <tbody>
          {visibleRuns.map((run) => (
            <RunRow key={run.id} run={run} canDelete={can("delete", "test_run")} />
          ))}
        </tbody>
      </table>
    </>
  );
}

const thClass = "px-3 py-2 font-medium";
const tdClass = "px-3 py-2.5";
