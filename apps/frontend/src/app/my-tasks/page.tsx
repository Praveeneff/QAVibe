"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth, getStoredToken } from "@/context/AuthContext";
import { usePermission } from "@/context/PermissionsContext";
import { getActiveProjectId, updateTestResult } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeUserId(token: string): string | null {
  try { return JSON.parse(atob(token.split(".")[1])).sub ?? null; }
  catch { return null; }
}

// ── Badges ────────────────────────────────────────────────────────────────────

const RUN_STATUS_CLASSES: Record<string, string> = {
  pending:  "bg-card text-slate-400",
  active:   "bg-blue-950 text-blue-400",
  complete: "bg-emerald-950 text-emerald-400",
  done:     "bg-emerald-950 text-emerald-400",
  failed:   "bg-red-950 text-red-400",
};

function RunStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold", RUN_STATUS_CLASSES[status] ?? "bg-card text-slate-400")}>
      {status}
    </span>
  );
}

const PRIORITY_TEXT_CLASSES: Record<string, string> = {
  P1: "text-red-500 border-red-500/20",
  P2: "text-amber-400 border-amber-400/20",
  P3: "text-blue-400 border-blue-400/20",
  P4: "text-slate-400 border-slate-400/20",
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold bg-card border", PRIORITY_TEXT_CLASSES[priority] ?? "text-slate-400 border-slate-400/20")}>
      {priority}
    </span>
  );
}

const CASE_STATUS_CLASSES: Record<string, string> = {
  active:   "bg-emerald-950 text-emerald-400",
  draft:    "bg-card text-slate-400",
  inactive: "bg-amber-950/30 text-amber-400",
};

function CaseStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold", CASE_STATUS_CLASSES[status] ?? "bg-card text-slate-400")}>
      {status}
    </span>
  );
}

// Result status uses dynamic bg tint — keeping computed style for the transparent background
const RESULT_STATUS_COLORS: Record<string, string> = {
  pass:    "#22c55e",
  fail:    "#ef4444",
  blocked: "#f59e0b",
  skip:    "#6b7280",
  pending: "#374151",
};

function ResultStatusBadge({ status }: { status: string }) {
  const color = RESULT_STATUS_COLORS[status] ?? "#555";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {status}
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestRun {
  id: string;
  name: string;
  environment: string;
  status: string;
  createdAt: string;
  results?: { id: string }[];
}

interface TestCase {
  id: string;
  tcId: string;
  title: string;
  priority: string;
  status: string;
  suite?: { name: string } | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyTasksPage() {
  return (
    <ProtectedRoute>
      <MyTasksContent />
    </ProtectedRoute>
  );
}

function MyTasksContent() {
  const { user } = useAuth();
  const { can } = usePermission();
  const router = useRouter();
  const token = getStoredToken() ?? "";

  const [runs, setRuns]       = useState<TestRun[]>([]);
  const [cases, setCases]     = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const [expandedRunId, setExpandedRunId]   = useState<string | null>(null);
  const [runDetails, setRunDetails]         = useState<Record<string, any>>({});
  const [savingResult, setSavingResult]     = useState<string | null>(null);
  const [notes, setNotes]                   = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    const userId = decodeUserId(token);
    const pid = getActiveProjectId();
    setProjectId(pid);
    if (!pid || !userId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${BASE_URL}/test-runs?assignedTo=${userId}&projectId=${pid}`, { headers }),
      fetch(`${BASE_URL}/test-cases?assignedTo=${userId}&projectId=${pid}`, { headers }),
    ])
      .then(async ([runsRes, casesRes]) => {
        if (!runsRes.ok)  throw new Error(`Failed to load runs (${runsRes.status})`);
        if (!casesRes.ok) throw new Error(`Failed to load cases (${casesRes.status})`);
        const [runsData, casesData] = await Promise.all([runsRes.json(), casesRes.json()]);
        setRuns(runsData?.data ?? runsData ?? []);
        setCases(casesData?.data ?? casesData ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleExpandRun(runId: string) {
    if (expandedRunId === runId) { setExpandedRunId(null); return; }
    setExpandedRunId(runId);
    if (runDetails[runId]) return;
    const res = await fetch(`${BASE_URL}/test-runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setRunDetails((prev) => ({ ...prev, [runId]: data }));
  }

  async function handleSetResult(runId: string, resultId: string, status: string) {
    const noteText = notes[resultId];
    setSavingResult(resultId);
    try {
      await updateTestResult(runId, resultId, status, noteText, token, projectId ?? undefined);
      setRunDetails((prev) => ({
        ...prev,
        [runId]: {
          ...prev[runId],
          results: prev[runId].results.map((r: any) =>
            r.id === resultId ? { ...r, status, notes: noteText ?? r.notes } : r,
          ),
        },
      }));
    } finally {
      setSavingResult(null);
    }
  }

  if (!projectId && !loading) {
    return (
      <div className="min-h-screen bg-background px-8 py-12 flex flex-col gap-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <h1 className="m-0 text-[26px] font-bold text-foreground">My Tasks</h1>
        </div>
        <div className="bg-amber-950/20 border border-amber-700 rounded-md px-4 py-3.5 text-amber-400 text-sm flex items-center justify-between gap-4">
          <span>Select a project to view your tasks.</span>
          <Link href="/projects" className="text-amber-400 underline text-[13px]">
            Select project →
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-8 py-12">
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background px-8 py-12">
        <div className="bg-destructive/10 border border-red-900 rounded-md px-4 py-3 text-red-400 text-[13px]">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-8 py-12 flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-bold text-foreground">My Tasks</h1>
          {user?.email && (
            <p className="mt-1.5 mb-0 text-[13px] text-slate-500">
              Assigned to <span className="text-muted-foreground">{user.email}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2.5">
          <SummaryPill label="Runs"  count={runs.length}  colorClass="text-blue-400" />
          <SummaryPill label="Cases" count={cases.length} colorClass="text-emerald-400" />
        </div>
      </div>

      {/* ── SECTION 1: My Runs ────────────────────────────────────────────── */}
      <div className="bg-card border border-slate-800 rounded-xl p-6">
        <div className="text-sm font-semibold text-foreground mb-4">My Runs</div>
        {runs.length === 0 ? (
          <p className="text-[13px] text-slate-500 m-0">No runs assigned to you yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Run Name", "Environment", "Status", "Cases", "Created", "Actions"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.06em] px-3 py-2 border-b border-slate-800">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <>
                  <tr key={run.id} className={expandedRunId === run.id ? "" : "border-b border-slate-900"}>
                    <td className={tdClass}>
                      <span className="text-[13px] text-foreground font-medium">{run.name}</span>
                    </td>
                    <td className={tdClass}>
                      <span className="text-[13px] text-slate-400">{run.environment}</span>
                    </td>
                    <td className={tdClass}><RunStatusBadge status={run.status} /></td>
                    <td className={tdClass}>
                      <span className="text-[13px] text-slate-400">{run.results?.length ?? 0}</span>
                    </td>
                    <td className={tdClass}>
                      <span className="text-xs text-slate-500">
                        {new Date(run.createdAt).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </span>
                    </td>
                    <td className={cn(tdClass, "flex gap-2")}>
                      {can("execute", "test_run") && (
                        <button
                          onClick={() => handleExpandRun(run.id)}
                          className={cn(
                            actionBtnClass,
                            expandedRunId === run.id
                              ? "bg-blue-950/40 text-blue-400 border-blue-800/30"
                              : "bg-transparent text-foreground border-border"
                          )}
                        >
                          {expandedRunId === run.id ? "Collapse" : "Execute"}
                        </button>
                      )}
                      <button onClick={() => router.push(`/runs/${run.id}`)} className={actionBtnClass}>
                        Open Run
                      </button>
                    </td>
                  </tr>

                  {/* Inline execution panel */}
                  {expandedRunId === run.id && can("execute", "test_run") && (
                    <tr key={`${run.id}-panel`}>
                      <td colSpan={6} className="p-0">
                        <div className="bg-background border border-slate-800 rounded-lg mx-3 mb-4 p-5">
                          {!runDetails[run.id] ? (
                            <p className="text-slate-500 text-[13px]">Loading…</p>
                          ) : (
                            <>
                              {/* Progress bar */}
                              {(() => {
                                const results = runDetails[run.id]?.results ?? [];
                                const done = results.filter((r: any) => r.status !== "pending").length;
                                const pct = results.length ? Math.round((done / results.length) * 100) : 0;
                                return (
                                  <div className="mb-4">
                                    <div className="flex justify-between mb-1.5 text-xs text-slate-500">
                                      <span>Progress</span>
                                      <span>{done} of {results.length} executed</span>
                                    </div>
                                    <div className="h-1 bg-slate-800 rounded-sm">
                                      <div
                                        className={cn("h-full rounded-sm transition-[width] duration-300", pct === 100 ? "bg-emerald-500" : "bg-blue-500")}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Results table */}
                              <table className="w-full border-collapse text-[13px]">
                                <thead>
                                  <tr className="border-b border-slate-800">
                                    {["tcId", "Title", "Status", "Result", "Notes"].map((h) => (
                                      <th key={h} className="text-left px-2.5 py-1.5 text-[11px] text-slate-500 uppercase">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(runDetails[run.id]?.results ?? []).map((result: any) => (
                                    <tr key={result.id} className="border-b border-slate-900">
                                      <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                                        {result.testCase?.tcId ?? "—"}
                                      </td>
                                      <td className="p-2.5 text-foreground font-medium">
                                        {result.testCase?.title ?? "—"}
                                      </td>
                                      <td className="p-2.5">
                                        <ResultStatusBadge status={result.status} />
                                      </td>
                                      <td className="p-2.5">
                                        <div className="flex gap-1.5 flex-wrap">
                                          {["pass", "fail", "blocked", "skip"].map((s) => {
                                            const isActive = result.status === s;
                                            const color = RESULT_STATUS_COLORS[s] ?? "#555";
                                            return (
                                              <button
                                                key={s}
                                                disabled={savingResult === result.id}
                                                onClick={() => handleSetResult(run.id, result.id, s)}
                                                style={isActive ? { background: color, border: `1px solid ${color}` } : undefined}
                                                className={cn(
                                                  "px-2.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer border transition-colors disabled:opacity-50",
                                                  isActive ? "text-white" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-foreground"
                                                )}
                                              >
                                                {s.charAt(0).toUpperCase() + s.slice(1)}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </td>
                                      <td className="p-2.5">
                                        {(result.status === "fail" || result.status === "blocked") && (
                                          <textarea
                                            value={notes[result.id] ?? result.notes ?? ""}
                                            onChange={(e) => setNotes((prev) => ({ ...prev, [result.id]: e.target.value }))}
                                            onBlur={() => handleSetResult(run.id, result.id, result.status)}
                                            placeholder="Add notes…"
                                            rows={2}
                                            className="bg-card border border-border rounded text-foreground text-xs px-2 py-1.5 w-full resize-y font-[inherit] focus:outline-none focus:border-primary transition-colors"
                                          />
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              <div className="mt-3 text-right">
                                <button
                                  onClick={() => router.push(`/runs/${run.id}/execute`)}
                                  className="bg-transparent border-none text-blue-400 text-xs cursor-pointer underline hover:text-blue-300 transition-colors"
                                >
                                  Open full execution view →
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── SECTION 2: My Cases ───────────────────────────────────────────── */}
      <div className="bg-card border border-slate-800 rounded-xl p-6">
        <div className="text-sm font-semibold text-foreground mb-4">My Cases</div>
        {cases.length === 0 ? (
          <p className="text-[13px] text-slate-500 m-0">No test cases assigned to you yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["tcId", "Title", "Suite", "Priority", "Status", "Action"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.06em] px-3 py-2 border-b border-slate-800">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((tc) => (
                <tr key={tc.id} className="border-b border-slate-900">
                  <td className={tdClass}>
                    <span className="font-mono text-[11px] text-slate-500 bg-card border border-slate-800 rounded px-1.5 py-0.5">
                      {tc.tcId || "—"}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <span className="text-[13px] text-foreground font-medium">{tc.title}</span>
                  </td>
                  <td className={tdClass}>
                    <span className="text-xs text-slate-500">{tc.suite?.name ?? "—"}</span>
                  </td>
                  <td className={tdClass}><PriorityBadge priority={tc.priority} /></td>
                  <td className={tdClass}><CaseStatusBadge status={tc.status} /></td>
                  <td className={tdClass}>
                    <button onClick={() => router.push(`/test-cases/${tc.id}`)} className={actionBtnClass}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Summary Pill ──────────────────────────────────────────────────────────────

function SummaryPill({ label, count, colorClass }: { label: string; count: number; colorClass: string }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-1.5 bg-card border border-slate-800 rounded-full text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-bold", colorClass)}>{count}</span>
    </div>
  );
}

// ── Class constants ────────────────────────────────────────────────────────────

const tdClass = "px-3 py-[11px] align-middle";
const actionBtnClass = "bg-transparent border border-border text-foreground px-3 py-1 rounded-md text-xs cursor-pointer hover:bg-slate-700/40 transition-colors";
