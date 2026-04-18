"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth, getStoredToken } from "@/context/AuthContext";
import { getActiveProjectId, updateTestResult } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeUserId(token: string): string | null {
  try {
    return JSON.parse(atob(token.split(".")[1])).sub ?? null;
  } catch {
    return null;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pass:    "#22c55e",
  fail:    "#ef4444",
  blocked: "#f59e0b",
  skip:    "#6b7280",
  pending: "#374151",
};

// ── Badges ────────────────────────────────────────────────────────────────────

const RUN_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:  { bg: "#1a1a1a", color: "#888" },
  active:   { bg: "#0a1f3d", color: "#60a5fa" },
  complete: { bg: "#0a3d0a", color: "#4ade80" },
  done:     { bg: "#0a3d0a", color: "#4ade80" },
  failed:   { bg: "#2d1414", color: "#f87171" },
};

function RunStatusBadge({ status }: { status: string }) {
  const { bg, color } = RUN_STATUS_COLORS[status] ?? { bg: "#1a1a1a", color: "#888" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color }}>
      {status}
    </span>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  P1: "#ef4444",
  P2: "#f59e0b",
  P3: "#60a5fa",
  P4: "#888",
};

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? "#888";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: "#1a1a1a", color, border: `1px solid ${color}33`,
    }}>
      {priority}
    </span>
  );
}

const CASE_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active:   { bg: "#0a3d0a", color: "#4ade80" },
  draft:    { bg: "#1a1a1a", color: "#888" },
  inactive: { bg: "#2d1a00", color: "#f59e0b" },
};

function CaseStatusBadge({ status }: { status: string }) {
  const { bg, color } = CASE_STATUS_COLORS[status] ?? { bg: "#1a1a1a", color: "#888" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color }}>
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
  const router = useRouter();
  const token = getStoredToken() ?? "";

  const [runs, setRuns]       = useState<TestRun[]>([]);
  const [cases, setCases]     = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Inline execution state
  const [expandedRunId, setExpandedRunId]   = useState<string | null>(null);
  const [runDetails, setRunDetails]         = useState<Record<string, any>>({});
  const [savingResult, setSavingResult]     = useState<string | null>(null);
  const [notes, setNotes]                   = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;

    const userId = decodeUserId(token);
    const pid = getActiveProjectId();
    setProjectId(pid);

    if (!pid || !userId) {
      setLoading(false);
      return;
    }

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
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (runDetails[runId]) return; // already loaded

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
      await updateTestResult(runId, resultId, status, noteText, token);
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

  // ── No project banner ──────────────────────────────────────────────────────
  if (!projectId && !loading) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>My Tasks</h1>
        </div>
        <div style={styles.warningBanner}>
          <span>Select a project to view your tasks.</span>
          <Link href="/projects" style={{ color: "#f59e0b", textDecoration: "underline", fontSize: 13 }}>
            Select project →
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <p style={{ color: "#666", fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>My Tasks</h1>
          {user?.email && (
            <p style={styles.subtitle}>Assigned to <span style={{ color: "#aaa" }}>{user.email}</span></p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <SummaryPill label="Runs"  count={runs.length}  color="#60a5fa" />
          <SummaryPill label="Cases" count={cases.length} color="#4ade80" />
        </div>
      </div>

      {/* ── SECTION 1: My Runs ──────────────────────────────────────────────── */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>My Runs</div>
        {runs.length === 0 ? (
          <p style={styles.emptyText}>No runs assigned to you yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {["Run Name", "Environment", "Status", "Cases", "Created", "Actions"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <>
                  <tr key={run.id} style={{ borderBottom: expandedRunId === run.id ? "none" : "1px solid #1a1a1a" }}>
                    <td style={styles.td}>
                      <span style={{ fontSize: 13, color: "#eee", fontWeight: 500 }}>{run.name}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontSize: 13, color: "#888" }}>{run.environment}</span>
                    </td>
                    <td style={styles.td}>
                      <RunStatusBadge status={run.status} />
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontSize: 13, color: "#888" }}>{run.results?.length ?? 0}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontSize: 12, color: "#555" }}>
                        {new Date(run.createdAt).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </span>
                    </td>
                    <td style={{ ...styles.td, display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleExpandRun(run.id)}
                        style={{
                          ...styles.actionBtn,
                          background: expandedRunId === run.id ? "#1e3a5f" : "transparent",
                          color:      expandedRunId === run.id ? "#60a5fa" : "#eee",
                          border:     expandedRunId === run.id ? "1px solid #2563eb44" : "1px solid #333",
                        }}
                      >
                        {expandedRunId === run.id ? "Collapse" : "Execute"}
                      </button>
                      <button
                        onClick={() => router.push(`/runs/${run.id}`)}
                        style={styles.actionBtn}
                      >
                        Open Run
                      </button>
                    </td>
                  </tr>

                  {/* Inline execution panel */}
                  {expandedRunId === run.id && (
                    <tr key={`${run.id}-panel`}>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div style={{
                          background: "#111", border: "1px solid #2a2a2a",
                          borderRadius: 8, margin: "0 12px 16px", padding: 20,
                        }}>
                          {!runDetails[run.id] ? (
                            <p style={{ color: "#666", fontSize: 13 }}>Loading…</p>
                          ) : (
                            <>
                              {/* Progress bar */}
                              {(() => {
                                const results = runDetails[run.id]?.results ?? [];
                                const done = results.filter((r: any) => r.status !== "pending").length;
                                const pct = results.length ? Math.round((done / results.length) * 100) : 0;
                                return (
                                  <div style={{ marginBottom: 16 }}>
                                    <div style={{
                                      display: "flex", justifyContent: "space-between",
                                      marginBottom: 6, fontSize: 12, color: "#666",
                                    }}>
                                      <span>Progress</span>
                                      <span>{done} of {results.length} executed</span>
                                    </div>
                                    <div style={{ height: 4, background: "#2a2a2a", borderRadius: 2 }}>
                                      <div style={{
                                        height: "100%", borderRadius: 2,
                                        background: pct === 100 ? "#22c55e" : "#2563eb",
                                        width: `${pct}%`, transition: "width 0.3s",
                                      }} />
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Results table */}
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                                    {["tcId", "Title", "Status", "Result", "Notes"].map((h) => (
                                      <th key={h} style={{
                                        textAlign: "left", padding: "6px 10px",
                                        fontSize: 11, color: "#555", textTransform: "uppercase",
                                      }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(runDetails[run.id]?.results ?? []).map((result: any) => (
                                    <tr key={result.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                                      <td style={{ padding: "10px", color: "#555", fontFamily: "monospace", fontSize: 11 }}>
                                        {result.testCase?.tcId ?? "—"}
                                      </td>
                                      <td style={{ padding: "10px", color: "#eee", fontWeight: 500 }}>
                                        {result.testCase?.title ?? "—"}
                                      </td>
                                      <td style={{ padding: "10px" }}>
                                        <ResultStatusBadge status={result.status} />
                                      </td>
                                      <td style={{ padding: "10px" }}>
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                          {["pass", "fail", "blocked", "skip"].map((s) => (
                                            <button
                                              key={s}
                                              disabled={savingResult === result.id}
                                              onClick={() => handleSetResult(run.id, result.id, s)}
                                              style={{
                                                padding: "3px 10px", borderRadius: 4, fontSize: 11,
                                                fontWeight: 600, cursor: "pointer", border: "none",
                                                background: result.status === s ? STATUS_COLORS[s] : "#2a2a2a",
                                                color:      result.status === s ? "#fff" : "#888",
                                                opacity:    savingResult === result.id ? 0.5 : 1,
                                              }}
                                            >
                                              {s.charAt(0).toUpperCase() + s.slice(1)}
                                            </button>
                                          ))}
                                        </div>
                                      </td>
                                      <td style={{ padding: "10px" }}>
                                        {(result.status === "fail" || result.status === "blocked") && (
                                          <textarea
                                            value={notes[result.id] ?? result.notes ?? ""}
                                            onChange={(e) => setNotes((prev) => ({ ...prev, [result.id]: e.target.value }))}
                                            onBlur={() => handleSetResult(run.id, result.id, result.status)}
                                            placeholder="Add notes…"
                                            rows={2}
                                            style={{
                                              background: "#1a1a1a", border: "1px solid #333",
                                              borderRadius: 4, color: "#eee", fontSize: 12,
                                              padding: "6px 8px", width: "100%",
                                              resize: "vertical", fontFamily: "inherit",
                                            }}
                                          />
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {/* Full view link */}
                              <div style={{ marginTop: 12, textAlign: "right" }}>
                                <button
                                  onClick={() => router.push(`/runs/${run.id}/execute`)}
                                  style={{
                                    background: "transparent", border: "none",
                                    color: "#60a5fa", fontSize: 12, cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
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

      {/* ── SECTION 2: My Cases ─────────────────────────────────────────────── */}
      <div style={styles.card}>
        <div style={styles.sectionTitle}>My Cases</div>
        {cases.length === 0 ? (
          <p style={styles.emptyText}>No test cases assigned to you yet.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {["tcId", "Title", "Suite", "Priority", "Status", "Action"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((tc) => (
                <tr key={tc.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <td style={styles.td}>
                    <span style={{
                      fontFamily: "monospace", fontSize: 11, color: "#555",
                      background: "#1a1a1a", border: "1px solid #2a2a2a",
                      borderRadius: 3, padding: "2px 6px",
                    }}>
                      {tc.tcId || "—"}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 13, color: "#eee", fontWeight: 500 }}>{tc.title}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 12, color: "#555" }}>{tc.suite?.name ?? "—"}</span>
                  </td>
                  <td style={styles.td}>
                    <PriorityBadge priority={tc.priority} />
                  </td>
                  <td style={styles.td}>
                    <CaseStatusBadge status={tc.status} />
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => router.push(`/test-cases/${tc.id}`)}
                      style={styles.actionBtn}
                    >
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

function SummaryPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 14px", background: "#1a1a1a",
      border: "1px solid #2a2a2a", borderRadius: 20, fontSize: 13,
    }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{count}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#111",
    padding: "48px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: "#fff",
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#666",
  },
  card: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    padding: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#eee",
    marginBottom: 16,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "8px 12px",
    borderBottom: "1px solid #2a2a2a",
  },
  td: {
    padding: "11px 12px",
    verticalAlign: "middle",
  },
  actionBtn: {
    background: "transparent",
    border: "1px solid #333",
    color: "#eee",
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  emptyText: {
    fontSize: 13,
    color: "#555",
    margin: 0,
  },
  warningBanner: {
    background: "#1c1208",
    border: "1px solid #78350f",
    borderRadius: 6,
    padding: "14px 18px",
    color: "#f59e0b",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  errorBox: {
    background: "#2d1414",
    border: "1px solid #5c2020",
    borderRadius: 6,
    padding: "12px 16px",
    color: "#f87171",
    fontSize: 13,
  },
};
