"use client";

import { useEffect, useState } from "react";
import { getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Member {
  id: string;
  email: string;
  name: string;
  role: "admin" | "tester";
  projectRole: "OWNER" | "MEMBER" | null;
  isMember: boolean;
}

export default function MembersTab({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState<string | null>(null);
  const [acting, setActing]    = useState<string | null>(null); // userId being actioned

  async function fetchMembers() {
    const token = getStoredToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/admin/projects/${projectId}/members-full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load members (${res.status})`);
      setMembers(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchMembers(); }, [projectId]);

  async function addMember(userId: string) {
    const token = getStoredToken();
    if (!token) return;
    setActing(userId);
    try {
      const res = await fetch(`${BASE_URL}/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, role: "MEMBER" }),
      });
      if (!res.ok) throw new Error(`Failed to add member (${res.status})`);
      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  }

  async function removeMember(userId: string) {
    const token = getStoredToken();
    if (!token) return;
    setActing(userId);
    try {
      const res = await fetch(`${BASE_URL}/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to remove member (${res.status})`);
      await fetchMembers();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActing(null);
    }
  }

  if (loading) return <p style={{ color: "#666", fontSize: 14 }}>Loading members…</p>;
  if (error)   return <div style={styles.errorBox}>{error}</div>;

  return (
    <div>
      <div style={styles.sectionLabel}>All users — {members.length}</div>
      <table style={styles.table}>
        <thead>
          <tr>
            {["User", "System Role", "Project Access", "Action"].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} style={styles.row}>
              {/* User */}
              <td style={styles.td}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={styles.avatar}>
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#eee", fontWeight: 500 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{m.email}</div>
                  </div>
                </div>
              </td>

              {/* System Role */}
              <td style={styles.td}>
                <span style={{
                  ...styles.badge,
                  background: m.role === "admin" ? "#1e3a5f" : "#1a1a1a",
                  color:      m.role === "admin" ? "#60a5fa" : "#888",
                  border:     m.role === "admin" ? "1px solid #2563eb44" : "1px solid #333",
                }}>
                  {m.role}
                </span>
              </td>

              {/* Project Access */}
              <td style={styles.td}>
                {m.isMember && m.projectRole === "OWNER" && (
                  <span style={{ ...styles.badge, background: "#1e3a5f", color: "#60a5fa", border: "1px solid #2563eb44" }}>
                    Owner
                  </span>
                )}
                {m.isMember && m.projectRole === "MEMBER" && (
                  <span style={{ ...styles.badge, background: "#1a2a1a", color: "#4ade80", border: "1px solid #16a34a44" }}>
                    Member
                  </span>
                )}
                {!m.isMember && (
                  <span style={{ ...styles.badge, background: "#1a1a1a", color: "#555", border: "1px solid #2a2a2a" }}>
                    No access
                  </span>
                )}
              </td>

              {/* Action */}
              <td style={styles.td}>
                {m.isMember && m.projectRole === "OWNER" && (
                  <button disabled style={{ ...styles.actionBtn, color: "#444", borderColor: "#2a2a2a", cursor: "default" }}>
                    Cannot remove
                  </button>
                )}
                {m.isMember && m.projectRole === "MEMBER" && (
                  <button
                    onClick={() => removeMember(m.id)}
                    disabled={acting === m.id}
                    style={{ ...styles.actionBtn, color: "#f87171", borderColor: "#5c2020" }}
                  >
                    {acting === m.id ? "…" : "Remove"}
                  </button>
                )}
                {!m.isMember && (
                  <button
                    onClick={() => addMember(m.id)}
                    disabled={acting === m.id}
                    style={{ ...styles.actionBtn, color: "#60a5fa", borderColor: "#2563eb44" }}
                  >
                    {acting === m.id ? "…" : "Add to project"}
                  </button>
                )}
              </td>
            </tr>
          ))}
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
    padding: "8px 12px",
    borderBottom: "1px solid #2a2a2a",
  },
  td: {
    padding: "12px 12px",
    borderBottom: "1px solid #1e1e1e",
    verticalAlign: "middle",
  },
  row: {
    background: "transparent",
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
  badge: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 4,
    padding: "2px 8px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  actionBtn: {
    background: "transparent",
    border: "1px solid",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
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
