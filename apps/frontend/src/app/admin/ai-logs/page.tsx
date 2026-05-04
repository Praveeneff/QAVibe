"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getAiLogSummary,
  getAiLogTrend,
  getAiRecentLogs,
  type AiLogSummary,
  type AiLogTrendPoint,
  type AiRecentLog,
} from "@/lib/api";
import InsightCard from "./InsightCard";
import ProtectedRoute from "@/components/ProtectedRoute";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function latencyColor(ms: number): string {
  if (ms < 1000) return "text-teal-400";
  if (ms <= 3000) return "text-amber-400";
  return "text-rose-400";
}

// SVG / dynamic hex — must stay inline for SVG fill/stroke
const PROVIDER_COLORS: Record<string, string> = {
  gemini:     "#8b5cf6",
  groq:       "#14b8a6",
  openai:     "#22c55e",
  claude:     "#f59e0b",
};
function providerColor(provider: string): string {
  const key = provider.toLowerCase().split("/")[0];
  return PROVIDER_COLORS[key] ?? "#64748b";
}

// ── Shared panel components ───────────────────────────────────────────────────

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm p-6 mb-5",
      className,
    )}>
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-0 mb-5 text-[11px] font-semibold text-slate-400 uppercase tracking-[0.07em] flex items-center gap-2">
      <span className="w-1 h-4 rounded-full bg-gradient-to-b from-violet-500 to-teal-500 inline-block shrink-0" />
      {children}
    </h2>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-white/[0.04] animate-pulse", className)} />;
}

// ── Metric card ───────────────────────────────────────────────────────────────

interface MetricCardProps { label: string; value: string | number; unit?: string; accent: "purple" | "teal" | "amber" | "rose" }
const ACCENT = {
  purple: { glow: "shadow-[0_0_32px_-4px_rgba(139,92,246,0.2)]", text: "text-violet-400", border: "border-violet-500/10" },
  teal:   { glow: "shadow-[0_0_32px_-4px_rgba(20,184,166,0.18)]", text: "text-teal-400",   border: "border-teal-500/10"   },
  amber:  { glow: "shadow-[0_0_32px_-4px_rgba(245,158,11,0.18)]",  text: "text-amber-400",  border: "border-amber-500/10"  },
  rose:   { glow: "shadow-[0_0_32px_-4px_rgba(244,63,94,0.18)]",   text: "text-rose-400",   border: "border-rose-500/10"   },
};

function MetricCard({ label, value, unit, accent }: MetricCardProps) {
  const a = ACCENT[accent];
  return (
    <div className={cn(
      "flex-1 min-w-[150px] rounded-xl p-5 border",
      "bg-[rgba(15,15,20,0.7)] backdrop-blur-sm",
      a.border, a.glow,
    )}>
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-[0.08em] mb-1">{label}</div>
      <div className={cn("text-[30px] font-bold leading-none", a.text)}>
        {value}{unit && <span className="text-sm text-slate-500 ml-1 font-normal">{unit}</span>}
      </div>
    </div>
  );
}

// ── Provider breakdown table ──────────────────────────────────────────────────

function ProviderTable({ rows }: { rows: AiLogSummary["providerBreakdown"] }) {
  if (rows.length === 0) {
    return <p className="text-slate-600 text-[13px]">No generation data yet.</p>;
  }

  const minLatencyRow = rows.reduce((a, b) => a.avgLatencyMs <= b.avgLatencyMs ? a : b);
  const maxFailureRow = rows.reduce((a, b) => a.failureCount >= b.failureCount ? a : b);

  return (
    <>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={thClass}>Provider</th>
            <th className={thClass}>Runs</th>
            <th className={thClass}>Avg latency</th>
            <th className={thClass}>Avg cases</th>
            <th className={thClass}>Failures</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const isBest  = rows.length > 1 && p.provider === minLatencyRow.provider;
            const isWorst = maxFailureRow.failureCount > 0 && p.provider === maxFailureRow.provider;
            return (
              <tr
                key={p.provider}
                className={cn(
                  "border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors border-l-2",
                  isWorst ? "border-l-rose-500" : isBest ? "border-l-teal-500" : "border-l-transparent",
                )}
              >
                <td className={tdClass}>
                  <span className="inline-flex items-center gap-2">
                    {/* Dynamic provider color — stays inline */}
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: providerColor(p.provider), flexShrink: 0 }} />
                    <span className="text-slate-300">{p.provider}</span>
                  </span>
                </td>
                <td className={tdClass}>{p.count}</td>
                <td className={cn(tdClass, latencyColor(p.avgLatencyMs), "tabular-nums font-medium")}>
                  {p.avgLatencyMs} ms
                </td>
                <td className={tdClass}>{p.avgCaseCount}</td>
                <td className={tdClass}>
                  <span className={cn(
                    "inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                    p.failureCount > 0
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : "bg-white/[0.03] text-slate-600 border-white/[0.05]",
                  )}>
                    {p.failureCount}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-600 mt-3 mb-0">
        Failures = times this provider triggered fallback to the next
      </p>
    </>
  );
}

// ── Latency trend chart ───────────────────────────────────────────────────────

function LatencyTrendChart({ data }: { data: AiLogTrendPoint[] }) {
  if (data.length < 2) {
    return <div className="py-10 text-slate-600 text-center text-sm">Not enough data yet</div>;
  }

  const W = 700, H = 220;
  const PAD = { top: 20, right: 24, bottom: 35, left: 60 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxY = Math.max(...data.map((d) => d.latencyMs), 1);
  const n = data.length;
  const toX = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const toY = (ms: number) => PAD.top + innerH * (1 - ms / maxY);
  const providers = [...new Set(data.map((d) => d.provider))];
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxY));
  const step = Math.max(1, Math.floor((n - 1) / 5));
  const xTicks = Array.from({ length: Math.floor((n - 1) / step) + 1 }, (_, k) => k * step);
  if (xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, display: "block" }} aria-label="AI generation latency trend">
        {yTicks.map((ms) => {
          const y = toY(ms);
          return (
            <g key={ms}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="#475569" fontSize={10}>{ms}</text>
            </g>
          );
        })}
        {xTicks.map((i) => (
          <text key={i} x={toX(i)} y={H - PAD.bottom + 14} textAnchor="middle" fill="#475569" fontSize={10}>{i}</text>
        ))}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        {providers.map((provider) => {
          const pts = data
            .map((d, i) => d.provider === provider ? { x: toX(i), y: toY(d.latencyMs) } : null)
            .filter((pt): pt is { x: number; y: number } => pt !== null);
          if (pts.length < 2) return null;
          return (
            <polyline
              key={provider}
              points={pts.map((pt) => `${pt.x},${pt.y}`).join(" ")}
              fill="none"
              stroke={providerColor(provider)}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          );
        })}
        {data.map((d, i) => (
          <g key={i}>
            <title>{d.provider} — {d.latencyMs}ms — {new Date(d.createdAt).toLocaleString()}</title>
            <circle cx={toX(i)} cy={toY(d.latencyMs)} r={4} fill={providerColor(d.provider)} stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} />
          </g>
        ))}
      </svg>
      <div className="flex gap-5 flex-wrap mt-3">
        {providers.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
            {/* Dynamic color stays inline */}
            <span style={{ width: 12, height: 3, background: providerColor(p), borderRadius: 2, display: "inline-block" }} />
            {p}
          </span>
        ))}
      </div>
    </>
  );
}

// ── Recent logs table ─────────────────────────────────────────────────────────

function RecentLogsTable({ logs }: { logs: AiRecentLog[] }) {
  if (logs.length === 0) {
    return <p className="text-slate-600 text-[13px]">No logs yet.</p>;
  }
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className={thClass}>Time</th>
          <th className={thClass}>Provider</th>
          <th className={thClass}>Latency</th>
          <th className={thClass}>Cases</th>
          <th className={thClass}>Tokens</th>
          <th className={thClass}>Fallback from</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => (
          <tr key={log.id} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
            <td className={cn(tdClass, "text-slate-600 whitespace-nowrap tabular-nums")}>{relativeTime(log.createdAt)}</td>
            <td className={tdClass}>
              <span className="inline-flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: providerColor(log.provider), flexShrink: 0 }} />
                <span className="text-slate-300 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">{log.provider}</span>
              </span>
            </td>
            <td className={cn(tdClass, latencyColor(log.latencyMs), "tabular-nums font-medium")}>
              {log.latencyMs} ms
            </td>
            <td className={cn(tdClass, "text-slate-300")}>{log.caseCount}</td>
            <td className={cn(tdClass, "text-slate-600 tabular-nums")}>{log.promptTokens ?? "—"}</td>
            <td className={tdClass}>
              {log.fallbackFrom ? (
                <span className="inline-block max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-amber-400 text-[11px]">
                  {log.fallbackFrom}
                </span>
              ) : (
                <span className="text-slate-700">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AiLogsPage() {
  const [summary, setSummary] = useState<AiLogSummary | null>(null);
  const [trend, setTrend] = useState<AiLogTrendPoint[]>([]);
  const [recentLogs, setRecentLogs] = useState<AiRecentLog[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [summaryResult, trendResult, logsResult] = await Promise.all([
          getAiLogSummary(),
          getAiLogTrend(),
          getAiRecentLogs(),
        ]);
        setSummary(summaryResult);
        setTrend(trendResult);
        setRecentLogs(logsResult);
      } catch {
        setFetchError("Could not reach backend. Make sure it is running on port 3001.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <ProtectedRoute>
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/5 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-[400px] h-[400px] rounded-full bg-teal-500/4 blur-[100px]" />
      </div>

      <main className="px-8 py-8 min-h-screen">
        <h1 className="m-0 mb-1 text-2xl font-bold text-foreground">AI Generation Logs</h1>
        <p className="mt-0 mb-8 text-[13px] text-slate-500">Provider performance and generation history</p>

        {fetchError && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 text-sm">
            {fetchError}
          </div>
        )}

        {loading ? (
          <>
            <div className="flex gap-4 flex-wrap mb-5">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="flex-1 min-w-[150px] h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-64 rounded-xl mb-5" />
            <Skeleton className="h-48 rounded-xl mb-5" />
          </>
        ) : summary && (
          <>
            {/* Metric cards */}
            <div className="flex gap-4 flex-wrap mb-5">
              <MetricCard accent="purple" label="Total Generations"     value={summary.totalGenerations} />
              <MetricCard accent="teal"   label="Cases Generated"       value={summary.totalCasesGenerated} />
              <MetricCard accent="amber"  label="Avg Latency"           value={summary.avgLatencyMs} unit="ms" />
              <MetricCard accent="rose"   label="Fallback Rate"         value={summary.fallbackRate} unit="%" />
            </div>

            {/* Provider breakdown */}
            <Panel>
              <PanelTitle>Provider Breakdown</PanelTitle>
              <ProviderTable rows={summary.providerBreakdown} />
              <InsightCard
                ranked={[...summary.providerBreakdown]
                  .sort((a, b) => a.avgLatencyMs - b.avgLatencyMs || a.failureCount - b.failureCount)
                  .map((p) => p.provider)}
              />
            </Panel>

            {/* Latency trend */}
            <Panel>
              <PanelTitle>
                Latency Trend
                <span className="ml-auto text-[11px] text-slate-600 font-normal normal-case tracking-normal">
                  last {trend.length} generation{trend.length !== 1 ? "s" : ""}
                </span>
              </PanelTitle>
              <LatencyTrendChart data={trend} />
            </Panel>

            {/* Recent logs */}
            <Panel>
              <PanelTitle>Recent Logs</PanelTitle>
              <RecentLogsTable logs={recentLogs} />
            </Panel>
          </>
        )}
      </main>
    </ProtectedRoute>
  );
}

const thClass = "px-3 py-2.5 text-[11px] font-semibold text-slate-600 uppercase tracking-[0.06em] text-left";
const tdClass = "px-3 py-3";
