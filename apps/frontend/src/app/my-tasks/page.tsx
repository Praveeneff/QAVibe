"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth, getStoredToken } from "@/context/AuthContext";
import { getTestCases, getActiveProjectId, type TestCase } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeUserId(token: string): string | null {
  try {
    return JSON.parse(atob(token.split(".")[1])).sub ?? null;
  } catch {
    return null;
  }
}

// ── Badges ────────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  critical: { bg: "#3d0a0a", fg: "#f44336" },
  high:     { bg: "#3d2a0a", fg: "#ff9800" },
  medium:   { bg: "#0a1f3d", fg: "#64b5f6" },
  low:      { bg: "#222",    fg: "#888" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const { bg, fg } = SEVERITY_COLORS[severity] ?? { bg: "#222", fg: "#888" };
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      background: bg,
      color: fg,
      fontWeight: 600,
    }}>
      {severity}
    </span>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  P1: "#f44336",
  P2: "#ff9800",
  P3: "#64b5f6",
  P4: "#888",
};

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? "#888";
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      background: "#1a1a1a",
      color,
      border: `1px solid ${color}33`,
      fontWeight: 600,
    }}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 12,
      fontSize: 12,
      background: isActive ? "#0a3d0a" : "#3d1a0a",
      color: isActive ? "#4caf50" : "#ff8a50",
    }}>
      {status}
    </span>
  );
}

function LastRunBadge({
  results,
}: {
  results?: { status: string; createdAt: string; testRunId: string }[];
}) {
  const last = results?.[0];
  if (!last) return <span style={{ fontSize: 12, color: "#444" }}>Never run</span>;

  const statusColors: Record<string, string> = {
    pass:    "#22c55e",
    fail:    "#ef4444",
    blocked: "#f59e0b",
    skip:    "#6b7280",
    pending: "#555",
  };
  const color = statusColors[last.status] ?? "#555";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color, fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
      {last.status}
    </span>
  );
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

  const [tasks,     setTasks]     = useState<TestCase[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    const userId = decodeUserId(token);
    if (!userId) return;

    const pid = getActiveProjectId();
    setProjectId(pid);

    setLoading(true);
    setError("");

    getTestCases({
      assignedTo: userId,
      ...(pid ? { projectId: pid } : {}),
      limit: 100,
    })
      .then((result) => setTasks(result.data))
      .catch(() => setError("Could not load tasks. Make sure the backend is running."))
      .finally(() => setLoading(false));
  }, []);

  // ── Group by status ────────────────────────────────────────────────────────

  const groups: Record<string, TestCase[]> = {};
  for (const tc of tasks) {
    (groups[tc.status] ??= []).push(tc);
  }
  const STATUS_ORDER = ["active", "draft", "inactive"];
  const orderedGroups = [
    ...STATUS_ORDER.filter((s) => groups[s]),
    ...Object.keys(groups).filter((s) => !STATUS_ORDER.includes(s)),
  ];

  return (
    <main style={{ padding: 32, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>My Tasks</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
          {user?.email && (
            <>Assigned to <span style={{ color: "#aaa" }}>{user.email}</span></>
          )}
          {projectId
            ? null
            : <> &mdash; <span style={{ color: "#f59e0b" }}>No active project selected</span></>
          }
        </p>
      </div>

      {/* No project banner */}
      {!projectId && (
        <div style={{
          marginBottom: 24,
          padding: "14px 18px",
          background: "#1c1208",
          border: "1px solid #78350f",
          borderRadius: 6,
          color: "#f59e0b",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <span>Select a project to filter tasks by project membership.</span>
          <Link href="/projects" style={{
            color: "#f59e0b",
            textDecoration: "underline",
            fontSize: 13,
            whiteSpace: "nowrap",
          }}>
            Select project →
          </Link>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ color: "#f44336", marginBottom: 16 }}>{error}</p>
      )}

      {/* Loading */}
      {loading && (
        <p style={{ color: "#666" }}>Loading…</p>
      )}

      {/* Empty */}
      {!loading && !error && tasks.length === 0 && (
        <div style={{
          padding: "48px 32px",
          textAlign: "center",
          background: "#111",
          border: "1px solid #1e1e1e",
          borderRadius: 8,
          color: "#555",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#666", marginBottom: 6 }}>
            No tasks assigned to you
          </div>
          <div style={{ fontSize: 14 }}>
            Tasks are assigned from the{" "}
            <Link href="/test-cases" style={{ color: "#0070f3", textDecoration: "none" }}>
              Test Cases
            </Link>{" "}
            edit page.
          </div>
        </div>
      )}

      {/* Summary pills */}
      {!loading && !error && tasks.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          <SummaryPill label="Total" count={tasks.length} color="#64b5f6" />
          {orderedGroups.map((s) => (
            <SummaryPill
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              count={groups[s].length}
              color={s === "active" ? "#4caf50" : s === "inactive" ? "#ff8a50" : "#888"}
            />
          ))}
        </div>
      )}

      {/* Task table — grouped by status */}
      {!loading && !error && tasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {orderedGroups.map((status) => (
            <section key={status}>
              <div style={{
                fontSize: 11,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: "1px solid #1e1e1e",
              }}>
                {status} &mdash; {groups[status].length} case{groups[status].length !== 1 ? "s" : ""}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2a2a2a", textAlign: "left", color: "#777" }}>
                    <th style={th}>ID</th>
                    <th style={th}>Title</th>
                    <th style={th}>Category</th>
                    <th style={th}>Priority</th>
                    <th style={th}>Severity</th>
                    <th style={th}>Status</th>
                    <th style={th}>Last Run</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {groups[status].map((tc) => (
                    <tr
                      key={tc.id}
                      style={{ borderBottom: "1px solid #1a1a1a" }}
                    >
                      <td style={td}>
                        <span style={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#555",
                          background: "#1a1a1a",
                          border: "1px solid #2a2a2a",
                          borderRadius: 3,
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}>
                          {tc.tcId || "—"}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 500, color: "#eee" }}>{tc.title}</div>
                        {tc.suite?.name && (
                          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                            {tc.suite.name}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, color: "#aaa" }}>{tc.category}</td>
                      <td style={td}><PriorityBadge priority={tc.priority} /></td>
                      <td style={td}><SeverityBadge severity={tc.severity} /></td>
                      <td style={td}><StatusBadge status={tc.status} /></td>
                      <td style={td}><LastRunBadge results={tc.results} /></td>
                      <td style={td}>
                        <Link
                          href={`/test-cases/${tc.id}`}
                          style={{ color: "#0070f3", textDecoration: "none", fontSize: 13 }}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}  // end MyTasksContent

// ── Summary pill ──────────────────────────────────────────────────────────────

function SummaryPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 14px",
      background: "#111",
      border: "1px solid #1e1e1e",
      borderRadius: 20,
      fontSize: 13,
    }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ fontWeight: 700, color }}>{count}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 500, fontSize: 12 };
const td: React.CSSProperties = { padding: "10px 12px" };
