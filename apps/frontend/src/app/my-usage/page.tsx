"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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
      <div className="min-h-screen bg-background px-8 py-12">
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background px-8 py-12">
        <div className={errorBoxClass}>{error}</div>
      </div>
    );
  }

  const pct = Math.min(100, usage?.percentUsed ?? 0);

  return (
    <div className="min-h-screen bg-background px-8 py-12">
      <div className="w-full max-w-[900px] mx-auto">

        {/* Page title */}
        <div className="mb-8">
          <h1 className="m-0 text-[26px] font-bold text-foreground">My Usage</h1>
          <p className="mt-1.5 mb-0 text-[13px] text-slate-500">Your AI token consumption and generation history</p>
        </div>

        {/* Token Usage Card */}
        <div className="bg-card border border-slate-800 rounded-xl p-6">
          <div className="text-sm font-semibold text-slate-400 uppercase tracking-[0.06em]">My Token Usage</div>

          <div className="flex items-baseline gap-2.5 mt-4 mb-1">
            <span className="text-[40px] font-bold text-foreground leading-none">
              {(usage?.tokenUsed ?? 0).toLocaleString()}
            </span>
            <span className="text-sm text-slate-500">
              of {(usage?.globalLimit ?? 50000).toLocaleString()} tokens used
            </span>
          </div>

          <div className="my-3.5">
            <div className="w-full h-1.5 bg-slate-800 rounded overflow-hidden">
              <div
                className={cn("h-full rounded transition-[width]", barColorClass(pct))}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className={cn("text-[13px] font-semibold", barTextClass(pct))}>{pct}% used</span>
            {usage?.tokenResetAt && (
              <span className="text-xs text-slate-500">
                Last reset:{" "}
                {new Date(usage.tokenResetAt).toLocaleDateString(undefined, {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </span>
            )}
          </div>

          {pct >= 80 && (
            <div className="mt-4 bg-amber-950/20 border border-amber-800 rounded-md px-4 py-3 text-amber-400 text-[13px]">
              You are approaching your token limit. Contact your admin to increase it.
            </div>
          )}
        </div>

        {/* Generation History */}
        <div className="mt-9">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em] mb-3.5">
            My Generation History
          </div>

          {logs.length === 0 ? (
            <div className="bg-card border border-slate-800 rounded-xl px-8 py-10 text-center">
              <div className="text-[13px] text-slate-500">
                No AI generations yet — generate test cases from BRD or codebase to see logs here.
              </div>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Time", "Provider", "Latency", "Cases", "Tokens", "Fallback from"].map((h) => (
                    <th key={h} className={thClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-900">
                    <td className={tdClass}>
                      <span className="text-[13px] text-slate-400">{timeAgo(log.createdAt)}</span>
                    </td>
                    <td className={tdClass}>
                      <span className="font-mono text-xs text-muted-foreground bg-[#111] border border-slate-800 rounded px-1.5 py-px inline-block max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {log.provider}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={cn("text-[13px] font-medium", log.latencyMs > 10000 ? "text-destructive" : "text-emerald-400")}>
                        {(log.latencyMs / 1000).toFixed(1)}s
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className="text-[13px] text-foreground">{log.caseCount}</span>
                    </td>
                    <td className={tdClass}>
                      <span className={cn("text-[13px]", log.promptTokens ? "text-foreground" : "text-slate-700")}>
                        {log.promptTokens ? log.promptTokens.toLocaleString() : "—"}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {log.fallbackFrom ? (
                        <span className="font-mono text-[11px] text-amber-400 bg-amber-950/20 border border-amber-900 rounded px-1.5 py-px inline-block max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {log.fallbackFrom}
                        </span>
                      ) : (
                        <span className="text-[13px] text-slate-700">—</span>
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

const thClass = "text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.06em] px-3 py-2 border-b border-slate-800";
const tdClass = "px-3 py-[11px] align-middle";
const errorBoxClass = "bg-destructive/10 border border-red-900 rounded-md px-4 py-3 text-red-400 text-[13px]";
