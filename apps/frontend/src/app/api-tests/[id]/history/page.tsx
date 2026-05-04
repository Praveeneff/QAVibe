"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  getApiTest,
  getApiExecutions,
  type ApiTest,
  type ApiExecution,
  type AssertionResult,
} from "@/lib/api";
import {
  ArrowLeft, CheckCircle2, XCircle, AlertCircle, Clock, Download,
  ChevronDown, ChevronRight, GitCompare, Filter, RefreshCw,
  TrendingUp, TrendingDown, Minus, Eye, EyeOff,
} from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

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

function fmtBody(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  try { return JSON.stringify(body, null, 2); } catch { return String(body); }
}

type StatusFilter = "all" | "pass" | "fail" | "error";

// ── Status primitives ─────────────────────────────────────────────────────────

const STATUS_META = {
  pass:  { icon: CheckCircle2, color: "text-teal-400",  bg: "bg-teal-950/40",  border: "border-teal-800/50",  pill: "bg-teal-950 text-teal-400 border-teal-800"  },
  fail:  { icon: XCircle,      color: "text-rose-400",  bg: "bg-rose-950/40",  border: "border-rose-800/50",  pill: "bg-rose-950 text-rose-400 border-rose-800"  },
  error: { icon: AlertCircle,  color: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-800/50", pill: "bg-amber-950 text-amber-400 border-amber-800" },
} as const;

function StatusPill({ status }: { status: "pass" | "fail" | "error" }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", m.pill)}>
      <Icon className="h-3 w-3" />{status}
    </span>
  );
}

// ── Assertion detail row ──────────────────────────────────────────────────────

function AssertionRow({ ar }: { ar: AssertionResult }) {
  const a = ar.assertion as any;
  let label = "";
  if (a.type === "status")       label = `Status = ${a.value}`;
  if (a.type === "responseTime") label = `Response time ≤ ${a.maxMs}ms`;
  if (a.type === "header")       label = `${a.name} ${a.operator}${a.value ? ` "${a.value}"` : ""}`;
  if (a.type === "jsonPath")     label = `${a.path} ${a.operator}${a.value ? ` "${a.value}"` : ""}`;

  return (
    <div className={cn(
      "flex items-start gap-2 px-3 py-2 rounded-lg border text-xs",
      ar.passed ? "bg-teal-950/20 border-teal-900/40" : "bg-rose-950/20 border-rose-900/40",
    )}>
      {ar.passed
        ? <CheckCircle2 className="h-3.5 w-3.5 text-teal-400 mt-0.5 shrink-0" />
        : <XCircle      className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className={cn("font-medium", ar.passed ? "text-teal-300" : "text-rose-300")}>{label}</p>
        <p className="text-slate-500 mt-0.5">{ar.message}</p>
        {!ar.passed && ar.actual !== undefined && (
          <p className="text-slate-600 font-mono mt-0.5">actual: {JSON.stringify(ar.actual)}</p>
        )}
      </div>
    </div>
  );
}

// ── Execution card (timeline item) ────────────────────────────────────────────

function ExecutionCard({
  exec, index, total, selected, onSelect, compareMode,
}: {
  exec:        ApiExecution;
  index:       number;
  total:       number;
  selected:    boolean;
  onSelect:    (id: string) => void;
  compareMode: boolean;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [showBody,    setShowBody]    = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const m = STATUS_META[exec.status];
  const Icon = m.icon;
  const passCount = exec.assertionResults.filter((r) => r.passed).length;
  const failCount = exec.assertionResults.length - passCount;
  const bodyStr   = fmtBody(exec.responseBody);

  return (
    <div className="relative flex gap-4">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0 w-8 pt-1">
        <div className={cn("w-3 h-3 rounded-full border-2 shrink-0 z-10", m.color, m.border.replace("border-", "border-"))}>
          <div className={cn("w-full h-full rounded-full", m.bg)} />
        </div>
        {index < total - 1 && (
          <div className="w-px flex-1 bg-white/[0.04] mt-1" />
        )}
      </div>

      {/* Card */}
      <div className={cn(
        "flex-1 mb-4 rounded-xl border transition-all duration-150",
        "bg-[rgba(15,15,20,0.65)] backdrop-blur-sm",
        selected ? `${m.border} ring-1 ring-inset ${m.color.replace("text-", "ring-")}/20` : "border-white/[0.06]",
        compareMode && "cursor-pointer hover:border-violet-700/60",
      )}
        onClick={compareMode ? () => onSelect(exec.id) : undefined}
      >
        {/* Card header */}
        <div
          className={cn("flex items-center gap-3 px-4 py-3", !compareMode && "cursor-pointer")}
          onClick={!compareMode ? () => setExpanded((v) => !v) : undefined}
        >
          {compareMode && (
            <input
              type="checkbox" checked={selected} readOnly
              className="accent-violet-500 h-4 w-4 rounded shrink-0"
            />
          )}

          <Icon className={cn("h-4 w-4 shrink-0", m.color)} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-sm font-medium", m.color)}>
                {exec.status === "pass" ? "Passed" : exec.status === "fail" ? "Failed" : "Error"}
              </span>
              {exec.responseStatus != null && (
                <span className="text-xs text-slate-500 font-mono">HTTP {exec.responseStatus}</span>
              )}
              {exec.environment && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-slate-500 font-medium uppercase tracking-wider">
                  {exec.environment}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-600">
              <span>{formatTs(exec.executedAt)}</span>
              <span className="text-slate-700">·</span>
              <span>{timeAgo(exec.executedAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {exec.responseTime != null && (
              <span className={cn(
                "flex items-center gap-1 text-xs font-mono",
                exec.responseTime < 500 ? "text-teal-400" : exec.responseTime < 1500 ? "text-amber-400" : "text-rose-400",
              )}>
                <Clock className="h-3 w-3" />{exec.responseTime}ms
              </span>
            )}
            {exec.assertionResults.length > 0 && (
              <span className="text-xs text-slate-500">
                {passCount}/{exec.assertionResults.length} assertions
              </span>
            )}
            {!compareMode && (
              expanded
                ? <ChevronDown  className="h-4 w-4 text-slate-600" />
                : <ChevronRight className="h-4 w-4 text-slate-600" />
            )}
          </div>
        </div>

        {/* Expanded detail */}
        {!compareMode && expanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3">

            {/* Error */}
            {exec.error && (
              <pre className="text-xs font-mono text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded-lg p-3 whitespace-pre-wrap break-all">
                {exec.error}
              </pre>
            )}

            {/* Assertion results */}
            {exec.assertionResults.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Assertions — {passCount} passed, {failCount > 0 ? `${failCount} failed` : "none failed"}
                </p>
                {exec.assertionResults.map((ar, i) => (
                  <AssertionRow key={i} ar={ar} />
                ))}
              </div>
            )}

            {/* Response Headers */}
            {exec.responseHeaders && Object.keys(exec.responseHeaders).length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowHeaders((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                >
                  {showHeaders ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  Response Headers ({Object.keys(exec.responseHeaders).length})
                </button>
                {showHeaders && (
                  <div className="mt-2 rounded-lg bg-white/[0.02] border border-white/[0.04] divide-y divide-white/[0.03]">
                    {Object.entries(exec.responseHeaders).slice(0, 20).map(([k, v]) => (
                      <div key={k} className="flex gap-3 px-3 py-1.5 text-xs font-mono">
                        <span className="text-slate-600 w-44 shrink-0 truncate">{k}</span>
                        <span className="text-slate-400 truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Response Body */}
            {bodyStr && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowBody((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                >
                  {showBody ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  Response Body
                </button>
                {showBody && (
                  <pre className="mt-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs font-mono text-slate-300 max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
                    {bodyStr}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Compare panel ─────────────────────────────────────────────────────────────

function ComparePanel({ a, b, onClose }: { a: ApiExecution; b: ApiExecution; onClose: () => void }) {
  const newer = new Date(a.executedAt) > new Date(b.executedAt) ? a : b;
  const older = newer === a ? b : a;

  const timeDelta = (() => {
    if (newer.responseTime == null || older.responseTime == null) return null;
    const diff = newer.responseTime - older.responseTime;
    return diff;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-xl border border-white/[0.06] bg-[rgba(12,12,18,0.97)] backdrop-blur-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold">Compare Executions</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 transition-colors">
            <XCircle className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          <div className="grid grid-cols-2 gap-4">
            {[older, newer].map((exec, col) => {
              const m = STATUS_META[exec.status];
              const Icon = m.icon;
              const isNewer = exec === newer;
              return (
                <div key={exec.id} className={cn("rounded-xl border p-4 space-y-3", m.border, m.bg)}>
                  {/* Col header */}
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", m.color)} />
                    <span className={cn("text-sm font-semibold", m.color)}>
                      {isNewer ? "Newer" : "Older"}
                    </span>
                    <StatusPill status={exec.status} />
                  </div>
                  <p className="text-xs text-slate-500">{formatTs(exec.executedAt)}</p>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    <MetricBox label="HTTP" value={exec.responseStatus != null ? String(exec.responseStatus) : "—"} />
                    <MetricBox
                      label="Time"
                      value={exec.responseTime != null ? `${exec.responseTime}ms` : "—"}
                      delta={isNewer && timeDelta != null ? timeDelta : undefined}
                    />
                    <MetricBox
                      label="Passed"
                      value={`${exec.assertionResults.filter((r) => r.passed).length}/${exec.assertionResults.length}`}
                    />
                    <MetricBox label="Env" value={exec.environment ?? "—"} />
                  </div>

                  {/* Assertions */}
                  {exec.assertionResults.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600">Assertions</p>
                      {exec.assertionResults.map((ar, i) => {
                        const a2 = ar.assertion as any;
                        let lbl = a2.type;
                        if (a2.type === "status")       lbl = `status = ${a2.value}`;
                        if (a2.type === "responseTime") lbl = `time ≤ ${a2.maxMs}ms`;
                        if (a2.type === "header")       lbl = `${a2.name} ${a2.operator}`;
                        if (a2.type === "jsonPath")     lbl = `${a2.path} ${a2.operator}`;
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            {ar.passed
                              ? <CheckCircle2 className="h-3 w-3 text-teal-400 shrink-0" />
                              : <XCircle      className="h-3 w-3 text-rose-400 shrink-0" />}
                            <span className={cn("truncate", ar.passed ? "text-slate-400" : "text-rose-300")}>{lbl}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Error */}
                  {exec.error && (
                    <pre className="text-[10px] font-mono text-rose-300 bg-rose-950/30 rounded-lg p-2 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                      {exec.error}
                    </pre>
                  )}

                  {/* Body preview */}
                  {exec.responseBody != null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Response Body</p>
                      <pre className="text-[10px] font-mono text-slate-400 bg-white/[0.02] border border-white/[0.04] rounded-lg p-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                        {fmtBody(exec.responseBody)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-600">{label}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-sm font-mono text-foreground">{value}</span>
        {delta != null && (
          <span className={cn(
            "flex items-center gap-0.5 text-[10px] font-medium",
            delta > 0 ? "text-rose-400" : delta < 0 ? "text-teal-400" : "text-slate-500",
          )}>
            {delta > 0 ? <TrendingUp   className="h-3 w-3" /> :
             delta < 0 ? <TrendingDown className="h-3 w-3" /> :
                         <Minus        className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}{delta}ms
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ executions }: { executions: ApiExecution[] }) {
  const total    = executions.length;
  const passing  = executions.filter((e) => e.status === "pass").length;
  const failing  = executions.filter((e) => e.status === "fail").length;
  const erroring = executions.filter((e) => e.status === "error").length;
  const times    = executions.map((e) => e.responseTime).filter((t): t is number => t != null);
  const avgTime  = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null;
  const passRate = total ? Math.round((passing / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {[
        { label: "Total runs",   value: String(total),              color: "text-foreground" },
        { label: "Pass rate",    value: `${passRate}%`,             color: passRate >= 80 ? "text-teal-400" : passRate >= 50 ? "text-amber-400" : "text-rose-400" },
        { label: "Passed",       value: String(passing),            color: "text-teal-400"  },
        { label: "Failed",       value: String(failing + erroring), color: failing + erroring > 0 ? "text-rose-400" : "text-slate-500" },
        { label: "Avg response", value: avgTime != null ? `${avgTime}ms` : "—", color: avgTime != null && avgTime < 500 ? "text-teal-400" : "text-amber-400" },
      ].map(({ label, value, color }) => (
        <div key={label} className="rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] px-4 py-3">
          <p className="text-xs text-slate-500">{label}</p>
          <p className={cn("text-xl font-semibold mt-1", color)}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function exportCsv(test: ApiTest, executions: ApiExecution[]) {
  const header = ["#", "Status", "HTTP Status", "Response Time (ms)", "Assertions Passed", "Assertions Total", "Environment", "Executed At", "Error"];
  const rows   = executions.map((e, i) => [
    String(executions.length - i),
    e.status,
    e.responseStatus ?? "",
    e.responseTime   ?? "",
    e.assertionResults.filter((r) => r.passed).length,
    e.assertionResults.length,
    e.environment ?? "",
    e.executedAt,
    (e.error ?? "").replace(/,/g, ";").replace(/\n/g, " "),
  ]);
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${test.name.replace(/\s+/g, "_")}_executions.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson(test: ApiTest, executions: ApiExecution[]) {
  const data = { test: { id: test.id, name: test.name, method: test.method, url: test.url }, executions };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${test.name.replace(/\s+/g, "_")}_executions.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApiTestHistoryPage() {
  const params = useParams();
  const id     = params?.id as string;

  const [test,       setTest]       = useState<ApiTest | null>(null);
  const [executions, setExecutions] = useState<ApiExecution[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [filter,     setFilter]     = useState<StatusFilter>("all");
  const [compareMode,setCompareMode]= useState(false);
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [comparing,  setComparing]  = useState<[ApiExecution, ApiExecution] | null>(null);
  const [showExport, setShowExport] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [testData, execData] = await Promise.all([
        getApiTest(id),
        getApiExecutions(id, 200),
      ]);
      setTest(testData as ApiTest);
      setExecutions(execData);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    filter === "all" ? executions : executions.filter((e) => e.status === filter),
    [executions, filter],
  );

  function toggleSelect(eid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) {
        next.delete(eid);
      } else if (next.size < 2) {
        next.add(eid);
      } else {
        // Replace oldest selected with new
        const [first] = next;
        next.delete(first);
        next.add(eid);
      }
      return next;
    });
  }

  function openCompare() {
    const ids   = [...selected];
    const a     = executions.find((e) => e.id === ids[0]);
    const b     = executions.find((e) => e.id === ids[1]);
    if (a && b) setComparing([a, b]);
  }

  const counts = useMemo(() => ({
    all:   executions.length,
    pass:  executions.filter((e) => e.status === "pass").length,
    fail:  executions.filter((e) => e.status === "fail").length,
    error: executions.filter((e) => e.status === "error").length,
  }), [executions]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

          {/* ── Header ── */}
          <div>
            <Link
              href="/api-tests"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to API Tests
            </Link>
            <div className="h-0.5 w-12 bg-gradient-to-r from-violet-500 to-teal-500 rounded-full mb-2" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  {test ? test.name : "Execution History"}
                </h1>
                {test && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border text-teal-400 bg-teal-950 border-teal-800">
                      {test.method}
                    </span>
                    <span className="text-xs text-slate-500 font-mono truncate max-w-sm">{test.url}</span>
                  </div>
                )}
              </div>
              {test && (
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/api-tests/${id}/edit`}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-white/[0.06] hover:border-white/[0.12] hover:text-foreground transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={load}
                    className="p-1.5 rounded-lg text-slate-500 border border-white/[0.06] hover:border-white/[0.12] hover:text-foreground transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-slate-500 text-sm">
              <span className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              Loading history…
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-5 rounded-xl border border-rose-800/40 bg-rose-950/30 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          ) : (
            <>
              {/* ── Stats ── */}
              {executions.length > 0 && <StatsBar executions={executions} />}

              {/* ── Toolbar ── */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Status filter */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <Filter className="h-3.5 w-3.5 text-slate-600 ml-1.5" />
                  {(["all","pass","fail","error"] as StatusFilter[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className={cn(
                        "px-3 py-1 rounded text-xs font-medium transition-colors capitalize",
                        filter === s
                          ? s === "all"   ? "bg-white/[0.08] text-foreground"
                          : s === "pass"  ? "bg-teal-950  text-teal-400"
                          : s === "fail"  ? "bg-rose-950  text-rose-400"
                          :                 "bg-amber-950 text-amber-400"
                          : "text-slate-500 hover:text-slate-300",
                      )}
                    >
                      {s} {counts[s] > 0 && <span className="opacity-60">({counts[s]})</span>}
                    </button>
                  ))}
                </div>

                <div className="flex-1" />

                {/* Compare mode */}
                {executions.length >= 2 && (
                  <button
                    onClick={() => { setCompareMode((v) => !v); setSelected(new Set()); }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                      compareMode
                        ? "bg-violet-950 text-violet-300 border-violet-800"
                        : "text-slate-400 border-white/[0.06] hover:border-white/[0.12] hover:text-foreground",
                    )}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    {compareMode ? "Cancel Compare" : "Compare"}
                  </button>
                )}

                {compareMode && selected.size === 2 && (
                  <button
                    onClick={openCompare}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white border border-violet-500 transition-colors"
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    Compare Selected
                  </button>
                )}

                {/* Export dropdown */}
                {executions.length > 0 && test && (
                  <div className="relative">
                    <button
                      onClick={() => setShowExport((v) => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-white/[0.06] hover:border-white/[0.12] hover:text-foreground transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    {showExport && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
                        <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-white/[0.08] bg-[rgba(15,15,25,0.97)] backdrop-blur-sm shadow-xl py-1">
                          <button
                            onClick={() => { exportCsv(test, filtered); setShowExport(false); }}
                            className="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06] transition-colors"
                          >
                            Export as CSV
                          </button>
                          <button
                            onClick={() => { exportJson(test, filtered); setShowExport(false); }}
                            className="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06] transition-colors"
                          >
                            Export as JSON
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Compare hint ── */}
              {compareMode && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-950/30 border border-violet-800/40 text-xs text-violet-300">
                  <GitCompare className="h-3.5 w-3.5 shrink-0" />
                  {selected.size === 0 && "Select 2 executions to compare them side by side."}
                  {selected.size === 1 && "Select 1 more execution."}
                  {selected.size === 2 && `2 selected — click "Compare Selected" to view diff.`}
                </div>
              )}

              {/* ── Timeline ── */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <Clock className="h-8 w-8 text-slate-700" />
                  <p className="text-sm text-slate-500">
                    {executions.length === 0
                      ? "No executions yet. Run the test to see history here."
                      : `No ${filter} executions.`}
                  </p>
                </div>
              ) : (
                <div className="pt-2">
                  {filtered.map((exec, i) => (
                    <ExecutionCard
                      key={exec.id}
                      exec={exec}
                      index={i}
                      total={filtered.length}
                      selected={selected.has(exec.id)}
                      onSelect={toggleSelect}
                      compareMode={compareMode}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Compare modal ── */}
      {comparing && (
        <ComparePanel
          a={comparing[0]}
          b={comparing[1]}
          onClose={() => setComparing(null)}
        />
      )}
    </ProtectedRoute>
  );
}
