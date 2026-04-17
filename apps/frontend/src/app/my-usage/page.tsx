"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageData {
  tokenUsed: number;
  globalLimit: number;
  percentUsed: number;
  tokenResetAt: string | null;
}

interface LogEntry {
  id: string;
  provider: string;
  latencyMs: number;
  caseCount: number;
  promptTokens: number | null;
  fallbackFrom: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function barColor(pct: number): string {
  if (pct > 80) return "#ef4444";
  if (pct > 50) return "#f59e0b";
  return "#22c55e";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyUsagePage() {
  return (
    <ProtectedRoute>
      <MyUsageContent />
    </ProtectedRoute>
  );
}

function MyUsageContent() {
  const [usage, setUsage]     = useState<UsageData | null>(null);
  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${BASE_URL}/auth/me/usage`,   { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${BASE_URL}/ai-logs/my-logs`, { headers: { Authorization: `Bearer ${token}` } }),
    ])
      .then(async ([usageRes, logsRes]) => {
        if (!usageRes.ok) throw new Error(`Failed to load usage (${usageRes.status})`);
        if (!logsRes.ok)  throw new Error(`Failed to load logs (${logsRes.status})`);
        const [usageData, logsData] = await Promise.all([usageRes.json(), logsRes.json()]);
        setUsage(usageData);
        setLogs(logsData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  const pct   = Math.min(100, usage?.percentUsed ?? 0);
  const color = barColor(pct);

  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Page title */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={styles.title}>My Usage</h1>
          <p style={styles.subtitle}>Your AI token consumption and generation history</p>
        </div>

        {/* ── SECTION 1: Token Usage Card ─────────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>My Token Usage</div>

          {/* Large token count */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "16px 0 4px" }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: "#fff", lineHeight: 1 }}>
              {(usage?.tokenUsed ?? 0).toLocaleString()}
            </span>
            <span style={{ fontSize: 14, color: "#555" }}>
              of {(usage?.globalLimit ?? 50000).toLocaleString()} tokens used
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ margin: "14px 0 6px" }}>
            <div style={styles.barTrack}>
              <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
            </div>
          </div>

          {/* Percentage + last reset row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color, fontWeight: 600 }}>{pct}% used</span>
            {usage?.tokenResetAt && (
              <span style={{ fontSize: 12, color: "#555" }}>
                Last reset:{" "}
                {new Date(usage.tokenResetAt).toLocaleDateString(undefined, {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </span>
            )}
          </div>

          {/* Warning banner */}
          {pct >= 80 && (
            <div style={styles.warningBanner}>
              You are approaching your token limit. Contact your admin to increase it.
            </div>
          )}
        </div>

        {/* ── SECTION 2: Generation History ───────────────────────────────── */}
        <div style={{ marginTop: 36 }}>
          <div style={styles.sectionLabel}>My Generation History</div>

          {logs.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 13, color: "#555" }}>
                No AI generations yet — generate test cases from BRD or codebase to see logs here.
              </div>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Time", "Provider", "Latency", "Cases", "Tokens", "Fallback from"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                    {/* Time */}
                    <td style={styles.td}>
                      <span style={{ fontSize: 13, color: "#888" }}>{timeAgo(log.createdAt)}</span>
                    </td>

                    {/* Provider */}
                    <td style={styles.td}>
                      <span style={{
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#aaa",
                        background: "#111",
                        border: "1px solid #2a2a2a",
                        borderRadius: 4,
                        padding: "2px 6px",
                        display: "inline-block",
                        maxWidth: 260,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {log.provider}
                      </span>
                    </td>

                    {/* Latency */}
                    <td style={styles.td}>
                      <span style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: log.latencyMs > 10000 ? "#ef4444" : "#22c55e",
                      }}>
                        {(log.latencyMs / 1000).toFixed(1)}s
                      </span>
                    </td>

                    {/* Cases */}
                    <td style={styles.td}>
                      <span style={{ fontSize: 13, color: "#eee" }}>{log.caseCount}</span>
                    </td>

                    {/* Tokens */}
                    <td style={styles.td}>
                      <span style={{ fontSize: 13, color: log.promptTokens ? "#eee" : "#444" }}>
                        {log.promptTokens ? log.promptTokens.toLocaleString() : "—"}
                      </span>
                    </td>

                    {/* Fallback from */}
                    <td style={styles.td}>
                      {log.fallbackFrom ? (
                        <span style={{
                          fontFamily: "monospace",
                          fontSize: 11,
                          color: "#f59e0b",
                          background: "#1c1208",
                          border: "1px solid #78350f",
                          borderRadius: 4,
                          padding: "2px 6px",
                          display: "inline-block",
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {log.fallbackFrom}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: "#333" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

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
    maxWidth: 900,
    margin: "0 auto",
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
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  barTrack: {
    width: "100%",
    height: 6,
    background: "#2a2a2a",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.4s ease",
  },
  warningBanner: {
    marginTop: 16,
    background: "#2d1a00",
    border: "1px solid #78350f",
    borderRadius: 6,
    padding: "12px 16px",
    color: "#f59e0b",
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    marginBottom: 14,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left" as const,
    fontSize: 12,
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    padding: "8px 12px",
    borderBottom: "1px solid #2a2a2a",
  },
  td: {
    padding: "11px 12px",
    verticalAlign: "middle" as const,
  },
  emptyState: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: "40px 32px",
    textAlign: "center" as const,
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
