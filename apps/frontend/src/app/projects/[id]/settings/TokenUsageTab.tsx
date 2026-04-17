"use client";

import { useEffect, useState } from "react";
import { getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface UsageRow {
  id: string;
  email: string;
  name: string;
  tokenUsed: number;
  tokenResetAt: string | null;
  globalLimit: number;
  percentUsed: number;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function barColor(pct: number): string {
  if (pct > 80) return "#ef4444";
  if (pct > 50) return "#f59e0b";
  return "#22c55e";
}

export default function TokenUsageTab({ projectId }: { projectId: string }) {
  const [rows, setRows]       = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  async function fetchUsage() {
    const token = getStoredToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/admin/token-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load token usage (${res.status})`);
      setRows(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsage(); }, [projectId]);

  async function resetUsage(userId: string) {
    const token = getStoredToken();
    if (!token) return;
    setResetting(userId);
    try {
      const res = await fetch(`${BASE_URL}/admin/token-usage/${userId}/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to reset (${res.status})`);
      await fetchUsage();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResetting(null);
    }
  }

  if (loading) return <p style={{ color: "#666", fontSize: 14 }}>Loading token usage…</p>;
  if (error)   return <div style={styles.errorBox}>{error}</div>;

  return (
    <div>
      <div style={styles.sectionLabel}>Token usage — {rows.length} users</div>
      <table style={styles.table}>
        <thead>
          <tr>
            {["User", "Used", "Limit", "Progress", "Last Reset", "Action"].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct   = Math.min(100, r.percentUsed);
            const color = barColor(pct);
            return (
              <tr key={r.id}>
                {/* User */}
                <td style={styles.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={styles.avatar}>{r.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: 13, color: "#eee", fontWeight: 500 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: "#555" }}>{r.email}</div>
                    </div>
                  </div>
                </td>

                {/* Used */}
                <td style={styles.td}>
                  <span style={{ fontSize: 13, color: "#eee" }}>
                    {r.tokenUsed.toLocaleString()}
                  </span>
                </td>

                {/* Limit */}
                <td style={styles.td}>
                  <span style={{ fontSize: 13, color: "#888" }}>
                    {r.globalLimit.toLocaleString()}
                  </span>
                </td>

                {/* Progress bar */}
                <td style={{ ...styles.td, minWidth: 140 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={styles.barTrack}>
                      <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
                    </div>
                    <span style={{ fontSize: 12, color, minWidth: 36 }}>{pct}%</span>
                  </div>
                </td>

                {/* Last Reset */}
                <td style={styles.td}>
                  {r.tokenResetAt ? (
                    <span style={{ fontSize: 12, color: "#555" }}>
                      {daysSince(r.tokenResetAt)}d ago
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "#333" }}>—</span>
                  )}
                </td>

                {/* Reset button */}
                <td style={styles.td}>
                  <button
                    onClick={() => resetUsage(r.id)}
                    disabled={resetting === r.id}
                    style={styles.resetBtn}
                  >
                    {resetting === r.id ? "…" : "Reset"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sectionLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    marginBottom: 12,
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "8px 12px",
    borderBottom: "1px solid #2a2a2a",
  },
  td: {
    padding: "12px 12px",
    borderBottom: "1px solid #1e1e1e",
    verticalAlign: "middle",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#1a1a2e",
    color: "#60a5fa",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid #1e3a5f",
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: 6,
    background: "#2a2a2a",
    borderRadius: 3,
    overflow: "hidden",
    minWidth: 80,
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
  resetBtn: {
    background: "transparent",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 500,
    color: "#888",
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
