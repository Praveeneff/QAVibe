"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [acting, setActing]   = useState<string | null>(null);

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

  if (loading) return <p className="text-slate-500 text-sm">Loading members…</p>;
  if (error)   return <div className={errorBoxClass}>{error}</div>;

  return (
    <div>
      <div className={sectionLabelClass}>All users — {members.length}</div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["User", "System Role", "Project Access", "Action"].map((h) => (
              <th key={h} className={thClass}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              {/* User */}
              <td className={tdClass}>
                <div className="flex items-center gap-2.5">
                  <div className={avatarClass}>{m.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="text-[13px] text-foreground font-medium">{m.name}</div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </div>
                </div>
              </td>

              {/* System Role */}
              <td className={tdClass}>
                <span className={cn(
                  badgeClass,
                  m.role === "admin"
                    ? "bg-blue-950/40 text-blue-400 border border-blue-800/40"
                    : "bg-card text-slate-400 border border-slate-800",
                )}>
                  {m.role}
                </span>
              </td>

              {/* Project Access */}
              <td className={tdClass}>
                {m.isMember && m.projectRole === "OWNER" && (
                  <span className={cn(badgeClass, "bg-blue-950/40 text-blue-400 border border-blue-800/40")}>Owner</span>
                )}
                {m.isMember && m.projectRole === "MEMBER" && (
                  <span className={cn(badgeClass, "bg-emerald-950/30 text-emerald-400 border border-emerald-800/40")}>Member</span>
                )}
                {!m.isMember && (
                  <span className={cn(badgeClass, "bg-card text-slate-500 border border-slate-800")}>No access</span>
                )}
              </td>

              {/* Action */}
              <td className={tdClass}>
                {m.isMember && m.projectRole === "OWNER" && (
                  <button disabled className={cn(actionBtnClass, "text-slate-700 border-slate-800 cursor-default")}>
                    Cannot remove
                  </button>
                )}
                {m.isMember && m.projectRole === "MEMBER" && (
                  <button
                    onClick={() => removeMember(m.id)}
                    disabled={acting === m.id}
                    className={cn(actionBtnClass, "text-red-400 border-red-900 hover:bg-red-950/20", acting === m.id && "opacity-50 cursor-not-allowed")}
                  >
                    {acting === m.id ? "…" : "Remove"}
                  </button>
                )}
                {!m.isMember && (
                  <button
                    onClick={() => addMember(m.id)}
                    disabled={acting === m.id}
                    className={cn(actionBtnClass, "text-blue-400 border-blue-900 hover:bg-blue-950/20", acting === m.id && "opacity-50 cursor-not-allowed")}
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

const sectionLabelClass = "text-[11px] font-medium text-slate-500 uppercase tracking-[0.07em] mb-3";
const thClass = "text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.06em] px-3 py-2 border-b border-slate-800";
const tdClass = "px-3 py-3 border-b border-slate-900 align-middle";
const avatarClass = "w-8 h-8 rounded-full bg-blue-950/40 text-blue-400 flex items-center justify-center text-xs font-semibold border border-blue-900 shrink-0";
const badgeClass = "inline-block text-[11px] font-semibold rounded px-2 py-px tracking-[0.05em] uppercase";
const actionBtnClass = "bg-transparent border rounded-md px-3 py-1 text-xs font-medium cursor-pointer transition-colors";
const errorBoxClass = "bg-destructive/10 border border-red-900 rounded-md px-4 py-3 text-red-400 text-[13px]";
