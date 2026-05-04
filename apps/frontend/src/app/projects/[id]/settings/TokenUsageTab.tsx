"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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

function barColorClass(pct: number): string {
  if (pct > 80) return "bg-red-500";
  if (pct > 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function barTextClass(pct: number): string {
  if (pct > 80) return "text-destructive";
  if (pct > 50) return "text-amber-500";
  return "text-emerald-400";
}

export default function TokenUsageTab({ projectId }: { projectId: string }) {
  const [rows, setRows]           = useState<UsageRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
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

  if (loading) return <p className="text-slate-500 text-sm">Loading token usage…</p>;
  if (error)   return <div className={errorBoxClass}>{error}</div>;

  return (
    <div>
      <div className={sectionLabelClass}>Token usage — {rows.length} users</div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["User", "Used", "Limit", "Progress", "Last Reset", "Action"].map((h) => (
              <th key={h} className={thClass}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = Math.min(100, r.percentUsed);
            return (
              <tr key={r.id}>
                <td className={tdClass}>
                  <div className="flex items-center gap-2.5">
                    <div className={avatarClass}>{r.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div className="text-[13px] text-foreground font-medium">{r.name}</div>
                      <div className="text-xs text-slate-500">{r.email}</div>
                    </div>
                  </div>
                </td>
                <td className={tdClass}>
                  <span className="text-[13px] text-foreground">{r.tokenUsed.toLocaleString()}</span>
                </td>
                <td className={tdClass}>
                  <span className="text-[13px] text-slate-400">{r.globalLimit.toLocaleString()}</span>
                </td>
                <td className={cn(tdClass, "min-w-[140px]")}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden min-w-[80px]">
                      <div
                        className={cn("h-full rounded transition-[width]", barColorClass(pct))}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={cn("text-xs min-w-[36px]", barTextClass(pct))}>{pct}%</span>
                  </div>
                </td>
                <td className={tdClass}>
                  {r.tokenResetAt ? (
                    <span className="text-xs text-slate-500">{daysSince(r.tokenResetAt)}d ago</span>
                  ) : (
                    <span className="text-xs text-slate-700">—</span>
                  )}
                </td>
                <td className={tdClass}>
                  <button
                    onClick={() => resetUsage(r.id)}
                    disabled={resetting === r.id}
                    className="bg-transparent border border-slate-800 rounded-md px-3 py-1 text-xs font-medium text-slate-400 cursor-pointer hover:border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

const sectionLabelClass = "text-[11px] font-medium text-slate-500 uppercase tracking-[0.07em] mb-3";
const thClass = "text-left text-[11px] font-semibold text-slate-500 uppercase tracking-[0.06em] px-3 py-2 border-b border-slate-800";
const tdClass = "px-3 py-3 border-b border-slate-900 align-middle";
const avatarClass = "w-8 h-8 rounded-full bg-blue-950/40 text-blue-400 flex items-center justify-center text-xs font-semibold border border-blue-900 shrink-0";
const errorBoxClass = "bg-destructive/10 border border-red-900 rounded-md px-4 py-3 text-red-400 text-[13px]";
