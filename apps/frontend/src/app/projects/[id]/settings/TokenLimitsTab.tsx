"use client";

import { useEffect, useState } from "react";
import { getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface UserRow {
  id: string;
  email: string;
  name: string;
  currentLimit: number | null; // null = using default
}

interface TokenLimit {
  userId: string;
  projectId: string | null;
  limitTokens: number;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
}

export default function TokenLimitsTab({ projectId }: { projectId: string }) {
  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [defaultLimit, setDefaultLimit] = useState("50000");
  const [savingDefault, setSavingDefault] = useState(false);
  const [perUserInputs, setPerUserInputs] = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState<string | null>(null);
  const [saved, setSaved]           = useState<string | null>(null);

  async function fetchData() {
    const token = getStoredToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [limitsRes, usersRes] = await Promise.all([
        fetch(`${BASE_URL}/admin/token-limits`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BASE_URL}/admin/users`,        { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!limitsRes.ok) throw new Error(`Failed to load token limits (${limitsRes.status})`);
      if (!usersRes.ok)  throw new Error(`Failed to load users (${usersRes.status})`);

      const limits: TokenLimit[]  = await limitsRes.json();
      const allUsers: AdminUser[] = await usersRes.json();

      // Build per-user limit map (global limits: projectId === null)
      const globalMap = new Map<string, number>();
      for (const l of limits) {
        if (l.projectId === null) globalMap.set(l.userId, l.limitTokens);
      }

      setUsers(allUsers.map((u) => ({
        id:           u.id,
        email:        u.email,
        name:         u.name,
        currentLimit: globalMap.get(u.id) ?? null,
      })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [projectId]);

  async function saveDefault() {
    const token = getStoredToken();
    if (!token) return;
    const n = parseInt(defaultLimit, 10);
    if (!n || n < 1) return;
    setSavingDefault(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/token-limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: "global", limitTokens: n }),
      });
      if (!res.ok) throw new Error(`Failed to save (${res.status})`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingDefault(false);
    }
  }

  async function saveUserLimit(userId: string) {
    const token = getStoredToken();
    if (!token) return;
    const raw = perUserInputs[userId];
    if (!raw?.trim()) return;
    const n = parseInt(raw, 10);
    if (!n || n < 1) return;
    setSaving(userId);
    try {
      const res = await fetch(`${BASE_URL}/admin/token-limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, limitTokens: n }),
      });
      if (!res.ok) throw new Error(`Failed to save (${res.status})`);
      setSaved(userId);
      setTimeout(() => setSaved(null), 2000);
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <p style={{ color: "#666", fontSize: 14 }}>Loading token limits…</p>;
  if (error)   return <div style={styles.errorBox}>{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* Global default */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Global Default Limit</div>
        <p style={{ fontSize: 13, color: "#888", margin: "0 0 16px" }}>
          Applied to users who don't have a per-user override.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="number"
            value={defaultLimit}
            onChange={(e) => setDefaultLimit(e.target.value)}
            style={styles.input}
            placeholder="50000"
            min={1}
          />
          <span style={{ fontSize: 13, color: "#555" }}>tokens</span>
          <button
            onClick={saveDefault}
            disabled={savingDefault}
            style={styles.primaryBtn}
          >
            {savingDefault ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Per-user overrides */}
      <div>
        <div style={styles.sectionLabel}>Per-user overrides — {users.length} users</div>
        <table style={styles.table}>
          <thead>
            <tr>
              {["User", "Current Limit", "New Limit", ""].map((h, i) => (
                <th key={i} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={styles.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={styles.avatar}>{u.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: 13, color: "#eee", fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: "#555" }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={styles.td}>
                  <span style={{ fontSize: 13, color: u.currentLimit ? "#eee" : "#555" }}>
                    {u.currentLimit ? u.currentLimit.toLocaleString() : "default"}
                  </span>
                </td>
                <td style={styles.td}>
                  <input
                    type="number"
                    value={perUserInputs[u.id] ?? ""}
                    onChange={(e) => setPerUserInputs((p) => ({ ...p, [u.id]: e.target.value }))}
                    placeholder="default"
                    min={1}
                    style={{ ...styles.input, width: 120 }}
                  />
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => saveUserLimit(u.id)}
                    disabled={saving === u.id || !perUserInputs[u.id]?.trim()}
                    style={{
                      ...styles.primaryBtn,
                      background: saved === u.id ? "#166534" : "#2563eb",
                      opacity: !perUserInputs[u.id]?.trim() ? 0.4 : 1,
                    }}
                  >
                    {saving === u.id ? "…" : saved === u.id ? "Saved" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: 20,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#eee",
    marginBottom: 6,
  },
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
  input: {
    background: "#111",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    padding: "7px 10px",
    fontSize: 13,
    color: "#eee",
    width: 140,
    outline: "none",
  },
  primaryBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "7px 16px",
    fontSize: 13,
    fontWeight: 500,
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
