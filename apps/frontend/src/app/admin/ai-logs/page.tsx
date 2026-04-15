"use client";

import { useEffect, useState } from "react";
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
  if (ms < 1000) return "#4caf50";
  if (ms <= 3000) return "#f59e0b";
  return "#f44336";
}

const PROVIDER_COLORS: Record<string, string> = {
  gemini:      "#a855f7",
  openai:      "#22c55e",
  claude:      "#f59e0b",
  openrouter:  "#3b82f6",
};
function providerColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? "#6b7280";
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, unit,
}: {
  label: string; value: string | number; unit?: string;
}) {
  return (
    <div style={{
      background: "#1a1a1a",
      border: "1px solid #2a2a2a",
      borderRadius: 8,
      padding: "20px 24px",
      flex: 1,
      minWidth: 160,
    }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#eee" }}>
        {value}
        {unit && <span style={{ fontSize: 16, color: "#888", marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── Provider breakdown table ──────────────────────────────────────────────────

function ProviderTable({ rows }: { rows: AiLogSummary["providerBreakdown"] }) {
  if (rows.length === 0) {
    return <p style={{ color: "#555", fontSize: 14 }}>No generation data yet.</p>;
  }

  const minLatencyRow = rows.reduce((a, b) => a.avgLatencyMs <= b.avgLatencyMs ? a : b);
  const maxFailureRow = rows.reduce((a, b) => a.failureCount >= b.failureCount ? a : b);

  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a2a", textAlign: "left", color: "#777" }}>
            <th style={th}>Provider</th>
            <th style={th}>Runs</th>
            <th style={th}>Avg latency (ms)</th>
            <th style={th}>Avg cases returned</th>
            <th style={th}>Failures triggered</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const isBest    = rows.length > 1 && p.provider === minLatencyRow.provider;
            const isWorst   = maxFailureRow.failureCount > 0 && p.provider === maxFailureRow.provider;
            const highlight = isWorst ? "#f44336" : isBest ? "#4caf50" : "transparent";
            return (
              <tr
                key={p.provider}
                style={{
                  borderBottom: "1px solid #1e1e1e",
                  borderLeft: `3px solid ${highlight}`,
                }}
              >
                <td style={td}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: providerColor(p.provider), flexShrink: 0,
                    }} />
                    {p.provider}
                  </span>
                </td>
                <td style={td}>{p.count}</td>
                <td style={{ ...td, color: latencyColor(p.avgLatencyMs) }}>{p.avgLatencyMs}</td>
                <td style={td}>{p.avgCaseCount}</td>
                <td style={{ ...td, color: p.failureCount > 0 ? "#f44336" : "#555" }}>
                  {p.failureCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "#555", marginTop: 10, marginBottom: 0 }}>
        Failures = times this provider caused a fallback to the next
      </p>
    </>
  );
}

// ── Latency trend chart ───────────────────────────────────────────────────────

function LatencyTrendChart({ data }: { data: AiLogTrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div style={{ padding: "40px 0", color: "#555", textAlign: "center", fontSize: 14 }}>
        Not enough data yet
      </div>
    );
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

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxY));

  // X-axis ticks: show ~6 evenly spaced indices
  const step = Math.max(1, Math.floor((n - 1) / 5));
  const xTicks = Array.from({ length: Math.floor((n - 1) / step) + 1 }, (_, k) => k * step);
  if (xTicks[xTicks.length - 1] !== n - 1) xTicks.push(n - 1);

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", maxWidth: W, display: "block" }}
        aria-label="AI generation latency trend"
      >
        {/* Y grid + labels */}
        {yTicks.map((ms) => {
          const y = toY(ms);
          return (
            <g key={ms}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#2a2a2a" strokeWidth={1} />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="#555" fontSize={10}>{ms}</text>
            </g>
          );
        })}

        {/* X ticks */}
        {xTicks.map((i) => (
          <text key={i} x={toX(i)} y={H - PAD.bottom + 14} textAnchor="middle" fill="#555" fontSize={10}>
            {i}
          </text>
        ))}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="#333" strokeWidth={1} />
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="#333" strokeWidth={1} />

        {/* Polylines per provider (rendered before dots so dots appear on top) */}
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

        {/* Dots with tooltips */}
        {data.map((d, i) => (
          <g key={i}>
            <title>{d.provider} — {d.latencyMs}ms — {new Date(d.createdAt).toLocaleString()}</title>
            <circle
              cx={toX(i)} cy={toY(d.latencyMs)}
              r={4}
              fill={providerColor(d.provider)}
              stroke="#111" strokeWidth={1.5}
            />
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
        {providers.map((p) => (
          <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#aaa" }}>
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
    return <p style={{ color: "#555", fontSize: 14 }}>No logs yet.</p>;
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #2a2a2a", textAlign: "left", color: "#777" }}>
          <th style={th}>Time</th>
          <th style={th}>Provider</th>
          <th style={th}>Latency</th>
          <th style={th}>Cases</th>
          <th style={th}>Tokens</th>
          <th style={th}>Fallback from</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => (
          <tr key={log.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
            <td style={{ ...td, color: "#666", whiteSpace: "nowrap" }}>{relativeTime(log.createdAt)}</td>
            <td style={td}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: providerColor(log.provider), flexShrink: 0,
                }} />
                {log.provider}
              </span>
            </td>
            <td style={{ ...td, color: latencyColor(log.latencyMs), fontVariantNumeric: "tabular-nums" }}>
              {log.latencyMs} ms
            </td>
            <td style={td}>{log.caseCount}</td>
            <td style={{ ...td, color: "#666" }}>{log.promptTokens ?? "—"}</td>
            <td style={{ ...td, color: log.fallbackFrom ? "#f59e0b" : "#444" }}>
              {log.fallbackFrom ?? "—"}
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

  if (loading) return <p style={{ padding: 32 }}>Loading...</p>;

  return (
    <ProtectedRoute>
    <main style={{ padding: 32, minHeight: "100vh" }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 24 }}>AI Generation Logs</h1>
      <p style={{ margin: "0 0 28px", color: "#666", fontSize: 14 }}>
        Provider performance and generation history
      </p>

      {fetchError && <p style={{ color: "#f44336" }}>{fetchError}</p>}

      {summary && (
        <>
          {/* Section 1 — Metric cards */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
            <MetricCard label="Total Generations"    value={summary.totalGenerations} />
            <MetricCard label="Total Cases Generated" value={summary.totalCasesGenerated} />
            <MetricCard label="Avg Latency"          value={summary.avgLatencyMs} unit="ms" />
            <MetricCard label="Fallback Rate"        value={summary.fallbackRate} unit="%" />
          </div>

          {/* Section 2 — Provider breakdown + insight */}
          <div style={card}>
            <h2 style={sectionHeading}>Provider Breakdown</h2>
            <ProviderTable rows={summary.providerBreakdown} />
            <InsightCard
              ranked={[...summary.providerBreakdown]
                .sort(
                  (a, b) =>
                    a.avgLatencyMs - b.avgLatencyMs ||
                    a.failureCount - b.failureCount,
                )
                .map((p) => p.provider)}
            />
          </div>

          {/* Section 3 — Latency trend chart */}
          <div style={card}>
            <h2 style={sectionHeading}>
              Latency Trend — last {trend.length} generation{trend.length !== 1 ? "s" : ""}
            </h2>
            <LatencyTrendChart data={trend} />
          </div>

          {/* Section 4 — Recent logs */}
          <div style={card}>
            <h2 style={sectionHeading}>Recent Logs</h2>
            <RecentLogsTable logs={recentLogs} />
          </div>
        </>
      )}
    </main>
    </ProtectedRoute>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "9px 12px" };
const card: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #2a2a2a",
  borderRadius: 8,
  padding: 24,
  marginBottom: 28,
};
const sectionHeading: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: 16,
  fontWeight: 600,
  color: "#eee",
};
