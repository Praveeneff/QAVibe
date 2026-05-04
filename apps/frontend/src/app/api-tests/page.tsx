"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  listApiTests,
  deleteApiTest,
  executeApiTest,
  getActiveProjectId,
  type ApiTest,
  type ApiTestMethod,
} from "@/lib/api";
import { Loader2, Plus, Play, Pencil, Trash2, Zap, CheckCircle2, XCircle, AlertCircle, Clock, History } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<ApiTestMethod, string> = {
  GET:    "text-teal-400    bg-teal-950   border-teal-800",
  POST:   "text-violet-400  bg-violet-950 border-violet-800",
  PUT:    "text-amber-400   bg-amber-950  border-amber-800",
  PATCH:  "text-sky-400     bg-sky-950    border-sky-800",
  DELETE: "text-rose-400    bg-rose-950   border-rose-800",
};

function MethodBadge({ method }: { method: ApiTestMethod }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border",
      METHOD_COLORS[method] ?? "text-slate-400 bg-slate-900 border-slate-700",
    )}>
      {method}
    </span>
  );
}

function StatusIcon({ status }: { status: "pass" | "fail" | "error" | null }) {
  if (!status) return <span className="text-slate-600 text-xs">—</span>;
  if (status === "pass")  return <CheckCircle2  className="h-4 w-4 text-teal-400"   />;
  if (status === "fail")  return <XCircle       className="h-4 w-4 text-rose-400"   />;
  return                         <AlertCircle   className="h-4 w-4 text-amber-400"  />;
}

function LastRunCell({ test }: { test: ApiTest }) {
  const exec = test.lastExecution;
  if (!exec) {
    return <span className="text-slate-600 text-xs italic">Never run</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <StatusIcon status={exec.status} />
      <span className={cn(
        "text-xs font-medium",
        exec.status === "pass"  ? "text-teal-400"  :
        exec.status === "fail"  ? "text-rose-400"  : "text-amber-400",
      )}>
        {exec.status}
      </span>
      {exec.responseStatus != null && (
        <span className="text-xs text-slate-500">{exec.responseStatus}</span>
      )}
      {exec.responseTime != null && (
        <span className="flex items-center gap-0.5 text-xs text-slate-500">
          <Clock className="h-3 w-3" />{exec.responseTime}ms
        </span>
      )}
      <span className="text-xs text-slate-600">{timeAgo(exec.executedAt)}</span>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ApiTestRow({
  test,
  onDelete,
  onRun,
}: {
  test:     ApiTest;
  onDelete: (id: string) => void;
  onRun:    (id: string) => Promise<void>;
}) {
  const [running,  setRunning]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleRun() {
    setRunning(true);
    try { await onRun(test.id); }
    finally { setRunning(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${test.name}"? This also removes all execution history.`)) return;
    setDeleting(true);
    try { onDelete(test.id); }
    finally { setDeleting(false); }
  }

  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group">
      {/* Name */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground group-hover:text-violet-300 transition-colors">
            {test.name}
          </span>
          {test.description && (
            <span className="text-xs text-slate-500 truncate max-w-[220px]">{test.description}</span>
          )}
          {test.suite && (
            <span className="text-[10px] text-slate-600">{test.suite.name}</span>
          )}
        </div>
      </td>

      {/* Method */}
      <td className="px-4 py-3">
        <MethodBadge method={test.method} />
      </td>

      {/* URL */}
      <td className="px-4 py-3 max-w-[260px]">
        <span className="text-xs text-slate-400 font-mono truncate block" title={test.url}>
          {test.url}
        </span>
      </td>

      {/* Last Run */}
      <td className="px-4 py-3">
        <LastRunCell test={test} />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleRun}
            disabled={running}
            title="Run test"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-teal-950 hover:bg-teal-900 text-teal-400 border border-teal-800/60 hover:border-teal-700 transition-all disabled:opacity-50"
          >
            {running
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Play    className="h-3 w-3" />}
            {running ? "Running…" : "Run"}
          </button>

          <Link
            href={`/api-tests/${test.id}/history`}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06] hover:border-white/[0.12] transition-all"
            title="View history"
          >
            <History className="h-3 w-3" />
          </Link>

          <Link
            href={`/api-tests/${test.id}/edit`}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06] hover:border-white/[0.12] transition-all"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Link>

          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete test"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-rose-950/40 hover:bg-rose-950 text-rose-400 border border-rose-900/40 hover:border-rose-800 transition-all disabled:opacity-50"
          >
            {deleting
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Trash2  className="h-3 w-3" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-1 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg bg-white/[0.03]" />
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ projectId }: { projectId: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-violet-950/60 border border-violet-800/40 flex items-center justify-center">
        <Zap className="h-7 w-7 text-violet-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">No API tests yet</p>
        <p className="text-xs text-slate-500 mt-1">
          {projectId
            ? "Create your first API test to start verifying your endpoints."
            : "Select a project to view API tests."}
        </p>
      </div>
      {projectId && (
        <Link
          href="/api-tests/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          New API Test
        </Link>
      )}
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ tests }: { tests: ApiTest[] }) {
  const total   = tests.length;
  const ran     = tests.filter((t) => t.lastExecution).length;
  const passing = tests.filter((t) => t.lastExecution?.status === "pass").length;
  const failing = tests.filter((t) => t.lastExecution?.status === "fail" || t.lastExecution?.status === "error").length;

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-5 text-xs text-slate-500">
      <span><span className="text-foreground font-medium">{total}</span> tests</span>
      {ran > 0 && (
        <>
          <span><span className="text-teal-400 font-medium">{passing}</span> passing</span>
          {failing > 0 && <span><span className="text-rose-400 font-medium">{failing}</span> failing</span>}
          <span><span className="text-slate-400 font-medium">{total - ran}</span> never run</span>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApiTestsPage() {
  const [tests,   setTests]   = useState<ApiTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const projectId = getActiveProjectId();

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const data = await listApiTests(projectId);
      setTests(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load API tests");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleRun = useCallback(async (id: string) => {
    const result = await executeApiTest(id, { environment: "staging" });
    setTests((prev) =>
      prev.map((t) =>
        t.id !== id ? t : {
          ...t,
          lastExecution: {
            id:             result.executionId,
            status:         result.status,
            responseStatus: result.responseStatus ?? null,
            responseTime:   result.responseTime   ?? null,
            executedAt:     new Date().toISOString(),
          },
        },
      ),
    );
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteApiTest(id);
    setTests((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="h-0.5 w-12 bg-gradient-to-r from-violet-500 to-teal-500 rounded-full mb-2" />
              <h1 className="text-xl font-semibold tracking-tight">API Tests</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Define and execute HTTP requests with automated assertions
              </p>
            </div>
            {projectId && (
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/api-tests/collections"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-300 border border-white/[0.08] hover:border-violet-700/50 hover:text-violet-300 transition-colors"
                >
                  Collections
                </Link>
                <Link
                  href="/api-tests/new"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New API Test
                </Link>
              </div>
            )}
          </div>

          {/* ── Stats bar ── */}
          {!loading && <StatsBar tests={tests} />}

          {/* ── Main panel ── */}
          <div className="rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm overflow-hidden">

            {loading ? (
              <div className="p-6">
                <Skeleton />
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 p-6 text-sm text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
                <button onClick={load} className="ml-2 underline underline-offset-2 text-rose-300 hover:text-rose-200">
                  Retry
                </button>
              </div>
            ) : tests.length === 0 ? (
              <EmptyState projectId={projectId} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Method
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        URL
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Last Run
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tests.map((test) => (
                      <ApiTestRow
                        key={test.id}
                        test={test}
                        onDelete={handleDelete}
                        onRun={handleRun}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
