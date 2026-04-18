"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { getStoredToken } from "@/context/AuthContext";
import { updateTestResult } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Constants ─────────────────────────────────────────────────────────────────

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
  const colorMap: Record<string, { bg: string; color: string }> = {
    pending:  { bg: "#1a1a1a", color: "#888" },
    active:   { bg: "#0a1f3d", color: "#60a5fa" },
    done:     { bg: "#0a3d0a", color: "#4ade80" },
    complete: { bg: "#0a3d0a", color: "#4ade80" },
    failed:   { bg: "#2d1414", color: "#f87171" },
  };
  const { bg, color } = colorMap[status] ?? { bg: "#1a1a1a", color: "#888" };
  return (
    <span style={{ padding: "2px 10px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: bg, color }}>
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
      await updateTestResult(runId, resultId, status, noteText, token);
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
      <div style={styles.page}>
        <p style={{ color: "#666", fontSize: 14 }}>Loading run…</p>
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

  if (!run) return null;

  const results: any[] = run.results ?? [];
  const done    = results.filter((r) => r.status !== "pending").length;
  const pct     = results.length ? Math.round((done / results.length) * 100) : 0;
  const allDone = done === results.length && results.length > 0;

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Back */}
        <button
          onClick={() => router.push("/my-tasks")}
          style={styles.backBtn}
        >
          ← Back to My Tasks
        </button>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={styles.title}>{run.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <span style={{ fontSize: 13, color: "#888" }}>{run.environment}</span>
            <RunStatusBadge status={run.status} />
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, color: "#666" }}>
            <span>Execution progress</span>
            <span style={{ color: pct === 100 ? "#22c55e" : "#aaa" }}>{done} of {results.length} executed ({pct}%)</span>
          </div>
          <div style={{ height: 6, background: "#2a2a2a", borderRadius: 3 }}>
            <div style={{
              height: "100%", borderRadius: 3,
              background: pct === 100 ? "#22c55e" : "#2563eb",
              width: `${pct}%`, transition: "width 0.3s",
            }} />
          </div>
        </div>

        {/* Results table */}
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                {["tcId", "Title", "Preconditions", "Steps", "Expected", "Status", "Result", "Notes"].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const tc = result.testCase ?? {};
                const steps = parseSteps(tc.steps);
                return (
                  <tr key={result.id} style={{ borderBottom: "1px solid #1a1a1a", verticalAlign: "top" }}>

                    {/* tcId */}
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                      <span style={{
                        fontFamily: "monospace", fontSize: 11, color: "#555",
                        background: "#111", border: "1px solid #2a2a2a",
                        borderRadius: 3, padding: "2px 6px",
                      }}>
                        {tc.tcId ?? "—"}
                      </span>
                    </td>

                    {/* Title */}
                    <td style={{ ...styles.td, minWidth: 160 }}>
                      <span style={{ fontSize: 13, color: "#eee", fontWeight: 500 }}>{tc.title ?? "—"}</span>
                    </td>

                    {/* Preconditions */}
                    <td style={{ ...styles.td, minWidth: 140 }}>
                      {tc.preconditions ? (
                        <p style={{ margin: 0, fontSize: 12, color: "#888", lineHeight: 1.5 }}>{tc.preconditions}</p>
                      ) : (
                        <span style={{ color: "#333", fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Steps */}
                    <td style={{ ...styles.td, minWidth: 200 }}>
                      {steps.length > 0 ? (
                        <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>
                          {steps.map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                      ) : (
                        <span style={{ color: "#333", fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Expected Result */}
                    <td style={{ ...styles.td, minWidth: 140 }}>
                      {tc.expectedResult ? (
                        <p style={{ margin: 0, fontSize: 12, color: "#888", lineHeight: 1.5 }}>{tc.expectedResult}</p>
                      ) : (
                        <span style={{ color: "#333", fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td style={styles.td}>
                      <ResultStatusBadge status={result.status} />
                    </td>

                    {/* Result buttons */}
                    <td style={{ ...styles.td, minWidth: 180 }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {["pass", "fail", "blocked", "skip"].map((s) => (
                          <button
                            key={s}
                            disabled={savingResult === result.id}
                            onClick={() => handleSetResult(result.id, s)}
                            style={{
                              padding: "3px 9px", borderRadius: 4, fontSize: 11,
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

                    {/* Notes */}
                    <td style={{ ...styles.td, minWidth: 180 }}>
                      {(result.status === "fail" || result.status === "blocked") && (
                        <textarea
                          value={notes[result.id] ?? result.notes ?? ""}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [result.id]: e.target.value }))}
                          onBlur={() => handleSetResult(result.id, result.status)}
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
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mark Complete button */}
        {allDone && run.status !== "done" && (
          <div style={{ marginTop: 24, textAlign: "right" }}>
            <button
              onClick={handleComplete}
              disabled={completing}
              style={styles.completeBtn}
            >
              {completing ? "Completing…" : "Mark Run Complete"}
            </button>
          </div>
        )}

        {run.status === "done" && (
          <div style={{ marginTop: 24, textAlign: "right" }}>
            <span style={{ fontSize: 13, color: "#4ade80", fontWeight: 600 }}>
              ✓ Run completed
            </span>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#111",
    padding: "48px 32px",
  },
  container: {
    width: "100%",
    maxWidth: 1200,
    margin: "0 auto",
  },
  backBtn: {
    background: "transparent",
    border: "none",
    color: "#555",
    fontSize: 13,
    cursor: "pointer",
    padding: "0 0 24px",
    display: "block",
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: "#fff",
  },
  card: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    overflow: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "10px 14px",
    borderBottom: "1px solid #2a2a2a",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 14px",
    verticalAlign: "top",
  },
  completeBtn: {
    background: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
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
