"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface UserRow {
  id: string;
  email: string;
  name: string;
  currentLimit: number | null;
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
  const [users, setUsers]               = useState<UserRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [defaultLimit, setDefaultLimit] = useState("50000");
  const [savingDefault, setSavingDefault] = useState(false);
  const [perUserInputs, setPerUserInputs] = useState<Record<string, string>>({});
  const [saving, setSaving]             = useState<string | null>(null);
  const [saved, setSaved]               = useState<string | null>(null);

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

  if (loading) return <p className="text-slate-500 text-sm">Loading token limits…</p>;
  if (error)   return <div className={errorBoxClass}>{error}</div>;

  return (
    <div className="flex flex-col gap-8">

      {/* Global default */}
      <div className="bg-card border border-slate-800 rounded-lg p-5">
        <div className="text-sm font-semibold text-foreground mb-1.5">Global Default Limit</div>
        <p className="text-[13px] text-slate-400 m-0 mb-4">
          Applied to users who don't have a per-user override.
        </p>
        <div className="flex gap-2.5 items-center">
          <input
            type="number"
            value={defaultLimit}
            onChange={(e) => setDefaultLimit(e.target.value)}
            className={inputClass}
            placeholder="50000"
            min={1}
          />
          <span className="text-[13px] text-slate-500">tokens</span>
          <button
            onClick={saveDefault}
            disabled={savingDefault}
            className={cn(primaryBtnClass, savingDefault && "opacity-50 cursor-not-allowed")}
          >
            {savingDefault ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Per-user overrides */}
      <div>
        <div className={sectionLabelClass}>Per-user overrides — {users.length} users</div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["User", "Current Limit", "New Limit", ""].map((h, i) => (
                <th key={i} className={thClass}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className={tdClass}>
                  <div className="flex items-center gap-2.5">
                    <div className={avatarClass}>{u.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div className="text-[13px] text-foreground font-medium">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className={tdClass}>
                  <span className={cn("text-[13px]", u.currentLimit ? "text-foreground" : "text-slate-500")}>
                    {u.currentLimit ? u.currentLimit.toLocaleString() : "default"}
                  </span>
                </td>
                <td className={tdClass}>
                  <input
                    type="number"
                    value={perUserInputs[u.id] ?? ""}
                    onChange={(e) => setPerUserInputs((p) => ({ ...p, [u.id]: e.target.value }))}
                    placeholder="default"
                    min={1}
                    className={cn(inputClass, "w-[120px]")}
                  />
                </td>
                <td className={tdClass}>
                  <button
                    onClick={() => saveUserLimit(u.id)}
                    disabled={saving === u.id || !perUserInputs[u.id]?.trim()}
                    className={cn(
                      primaryBtnClass,
                      saved === u.id ? "bg-emerald-800" : "bg-blue-600",
                      (!perUserInputs[u.id]?.trim() || saving === u.id) && "opacity-40 cursor-not-allowed",
                    )}
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

const sectionLabelClass = "text-[11px] font-medium text-slate-500 uppercase tracking-[0.07em] mb-3";
const thClass = "text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.06em] px-3 py-2 border-b border-slate-800";
const tdClass = "px-3 py-3 border-b border-slate-900 align-middle";
const avatarClass = "w-8 h-8 rounded-full bg-blue-950/40 text-blue-400 flex items-center justify-center text-xs font-semibold border border-blue-900 shrink-0";
const inputClass = "bg-background border border-slate-800 rounded-md px-2.5 py-[7px] text-[13px] text-foreground w-[140px] outline-none focus:border-primary transition-colors";
const primaryBtnClass = "bg-blue-600 text-white border-none rounded-md px-4 py-[7px] text-[13px] font-medium cursor-pointer hover:bg-blue-500 transition-colors";
const errorBoxClass = "bg-destructive/10 border border-red-900 rounded-md px-4 py-3 text-red-400 text-[13px]";
