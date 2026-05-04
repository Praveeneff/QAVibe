"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import ProtectedRoute from "@/components/ProtectedRoute";
import { getStoredToken } from "@/context/AuthContext";
import { updateTestResult } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Tailwind variant maps ─────────────────────────────────────────────────────

const RUN_STATUS_CLASSES: Record<string, string> = {
  pending:  "bg-card text-slate-400",
  active:   "bg-blue-950/40 text-blue-400",
  done:     "bg-emerald-950/40 text-emerald-400",
  complete: "bg-emerald-950/40 text-emerald-400",
  failed:   "bg-destructive/10 text-red-400",
};

// result status uses dynamic opacity — must stay inline
const STATUS_COLORS: Record<string, string> = {
  pass:    "#22c55e",
  fail:    "#ef4444",
  blocked: "#f59e0b",
  skip:    "#6b7280",
  pending: "#374151",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSteps(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* fall through */ }
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

// ── Badges ────────────────────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("px-2.5 py-px rounded text-xs font-semibold", RUN_STATUS_CLASSES[status] ?? "bg-card text-slate-400")}>
      {status}
    </span>
  );
}

function ResultStatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#555";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExecutePage() {
  return (
    <ProtectedRoute>
      <ExecuteContent />
    </ProtectedRoute>
  );
}

function ExecuteContent() {
  const { id: runId } = useParams<{ id: string }>();
  const router = useRouter();
  const token = getStoredToken() ?? "";

  const [run, setRun]               = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [savingResult, setSavingResult] = useState<string | null>(null);
  const [notes, setNotes]           = useState<Record<string, string>>({});
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (!token || !runId) return;
    setLoading(true);
    fetch(`${BASE_URL}/test-runs/${runId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load run (${res.status})`);
        setRun(await res.json());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  async function handleSetResult(resultId: string, status: string) {
    const noteText = notes[resultId];
    setSavingResult(resultId);
    try {
      await updateTestResult(runId, resultId, status, noteText, token, run?.projectId);
      setRun((prev: any) => ({
        ...prev,
        results: prev.results.map((r: any) =>
          r.id === resultId ? { ...r, status, notes: noteText ?? r.notes } : r,
        ),
      }));
    } finally {
      setSavingResult(null);
    }
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      const res = await fetch(`${BASE_URL}/test-runs/${runId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Failed to complete run (${res.status})`);
      const updated = await res.json();
      setRun((prev: any) => ({ ...prev, status: updated.status }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-8 py-12">
        <p className="text-slate-500 text-sm">Loading run…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background px-8 py-12">
        <div className={errorBoxClass}>{error}</div>
      </div>
    );
  }

  if (!run) return null;

  const results: any[] = run.results ?? [];
  const done    = results.filter((r) => r.status !== "pending").length;
  const pct     = results.length ? Math.round((done / results.length) * 100) : 0;
  const allDone = done === results.length && results.length > 0;

  return (
    <div className="min-h-screen bg-background px-8 py-12">
      <div className="w-full max-w-[1200px] mx-auto">

        {/* Back */}
        <button
          onClick={() => router.push("/my-tasks")}
          className="bg-transparent border-none text-slate-500 text-[13px] cursor-pointer p-0 pb-6 block hover:text-slate-300"
        >
          ← Back to My Tasks
        </button>

        {/* Header */}
        <div className="mb-7">
          <h1 className="m-0 text-[26px] font-bold text-foreground">{run.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[13px] text-slate-400">{run.environment}</span>
            <RunStatusBadge status={run.status} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-7">
          <div className="flex justify-between mb-2 text-[13px] text-slate-500">
            <span>Execution progress</span>
            <span className={pct === 100 ? "text-emerald-400" : "text-slate-400"}>
              {done} of {results.length} executed ({pct}%)
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded">
            <div
              className={cn("h-full rounded transition-[width]", pct === 100 ? "bg-emerald-500" : "bg-blue-600")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Results table */}
        <div className="bg-card border border-slate-800 rounded-xl overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["tcId", "Title", "Preconditions", "Steps", "Expected", "Status", "Result", "Notes"].map((h) => (
                  <th key={h} className={thClass}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const tc = result.testCase ?? {};
                const steps = parseSteps(tc.steps);
                return (
                  <tr key={result.id} className="border-b border-slate-900 align-top">

                    <td className={cn(tdClass, "whitespace-nowrap")}>
                      <span className="font-mono text-[11px] text-slate-500 bg-[#111] border border-slate-800 rounded-[3px] px-1.5 py-px">
                        {tc.tcId ?? "—"}
                      </span>
                    </td>

                    <td className={cn(tdClass, "min-w-[160px]")}>
                      <span className="text-[13px] text-foreground font-medium">{tc.title ?? "—"}</span>
                    </td>

                    <td className={cn(tdClass, "min-w-[140px]")}>
                      {tc.preconditions ? (
                        <p className="m-0 text-xs text-slate-400 leading-relaxed">{tc.preconditions}</p>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>

                    <td className={cn(tdClass, "min-w-[200px]")}>
                      {steps.length > 0 ? (
                        <ol className="m-0 pl-4 text-xs text-muted-foreground leading-relaxed">
                          {steps.map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>

                    <td className={cn(tdClass, "min-w-[140px]")}>
                      {tc.expectedResult ? (
                        <p className="m-0 text-xs text-slate-400 leading-relaxed">{tc.expectedResult}</p>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>

                    <td className={tdClass}>
                      <ResultStatusBadge status={result.status} />
                    </td>

                    <td className={cn(tdClass, "min-w-[180px]")}>
                      <div className="flex gap-1.5 flex-wrap">
                        {["pass", "fail", "blocked", "skip"].map((s) => {
                          const color = STATUS_COLORS[s] ?? "#555";
                          const isActive = result.status === s;
                          return (
                            <button
                              key={s}
                              disabled={savingResult === result.id}
                              onClick={() => handleSetResult(result.id, s)}
                              style={{
                                padding: "3px 9px", borderRadius: 4, fontSize: 11,
                                fontWeight: 600, cursor: "pointer", border: "none",
                                background: isActive ? color : "#2a2a2a",
                                color: isActive ? "#fff" : "#888",
                                opacity: savingResult === result.id ? 0.5 : 1,
                              }}
                            >
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    <td className={cn(tdClass, "min-w-[180px]")}>
                      {(result.status === "fail" || result.status === "blocked") && (
                        <textarea
                          value={notes[result.id] ?? result.notes ?? ""}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [result.id]: e.target.value }))}
                          onBlur={() => handleSetResult(result.id, result.status)}
                          placeholder="Add notes…"
                          rows={2}
                          className="bg-card border border-border rounded text-foreground text-xs px-2 py-1.5 w-full resize-y font-inherit focus:outline-none focus:border-primary"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {allDone && run.status !== "done" && (
          <div className="mt-6 text-right">
            <button
              onClick={handleComplete}
              disabled={completing}
              className={cn("bg-emerald-600 text-white border-none rounded-lg px-6 py-2.5 text-sm font-semibold cursor-pointer hover:bg-emerald-500 transition-colors", completing && "opacity-50 cursor-not-allowed")}
            >
              {completing ? "Completing…" : "Mark Run Complete"}
            </button>
          </div>
        )}

        {run.status === "done" && (
          <div className="mt-6 text-right">
            <span className="text-[13px] text-emerald-400 font-semibold">✓ Run completed</span>
          </div>
        )}

      </div>
    </div>
  );
}

const thClass = "text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.06em] px-3.5 py-2.5 border-b border-slate-800 whitespace-nowrap";
const tdClass = "px-3.5 py-3 align-top";
const errorBoxClass = "bg-destructive/10 border border-red-900 rounded-md px-4 py-3 text-red-400 text-[13px]";
