"use client";

import { useEffect, useState, Suspense } from "react";
import { getRunStats, getRunTrend, getAllRuns, getActiveProjectId, type RunStats, type TrendPoint } from "@/lib/api";
import EnvFilter from "@/components/EnvFilter";
import RerunNeededClient from "./RerunNeededClient";
import ProtectedRoute from "@/components/ProtectedRoute";

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
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
        {value}{unit && <span style={{ fontSize: 16, color: "#888", marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── SVG trend chart ───────────────────────────────────────────────────────────

function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div style={{ padding: "40px 0", color: "#555", textAlign: "center", fontSize: 14 }}>
        No completed runs yet — trend will appear here.
      </div>
    );
  }

  const W = 600;
  const H = 200;
  const PAD = { top: 16, right: 24, bottom: 40, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xStep = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const toX = (i: number) => PAD.left + (points.length > 1 ? i * xStep : innerW / 2);
  const toY = (rate: number) => PAD.top + innerH - (rate / 100) * innerH;

  const latest = points[points.length - 1]?.passRate ?? 0;
  const lineColor = latest >= 80 ? "#4caf50" : latest >= 50 ? "#ff9800" : "#f44336";

  const polyline = points.map((p, i) => `${toX(i)},${toY(p.passRate)}`).join(" ");
  const threshold80Y = toY(80);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxWidth: W, display: "block" }}
      aria-label="Pass rate trend chart"
    >
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map((pct) => {
        const y = toY(pct);
        return (
          <g key={pct}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
              stroke="#2a2a2a" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end"
              fill="#555" fontSize={10}>{pct}%</text>
          </g>
        );
      })}

      {/* 80% threshold dashed line */}
      <line
        x1={PAD.left} y1={threshold80Y}
        x2={W - PAD.right} y2={threshold80Y}
        stroke="#444" strokeWidth={1} strokeDasharray="6 3"
      />
      <text x={W - PAD.right + 4} y={threshold80Y + 4} fill="#555" fontSize={10}>80%</text>

      {/* Trend polyline */}
      <polyline
        points={polyline}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Dots + tooltips */}
      {points.map((p, i) => {
        const cx = toX(i);
        const cy = toY(p.passRate);
        const label = `${p.name.slice(0, 20)}${p.name.length > 20 ? "…" : ""}: ${p.passRate}%`;
        return (
          <g key={p.runId}>
            <title>{label}</title>
            <circle cx={cx} cy={cy} r={5} fill={lineColor} stroke="#111" strokeWidth={2} />
            {/* X-axis label */}
            <text
              x={cx} y={H - PAD.bottom + 14}
              textAnchor="middle" fill="#666" fontSize={10}
              style={{ maxWidth: xStep }}
            >
              {p.name.slice(0, 12)}{p.name.length > 12 ? "…" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Flaky tests table ─────────────────────────────────────────────────────────

function FlakyTable({ flakyTests }: { flakyTests: RunStats["flakyTests"] }) {
  if (flakyTests.length === 0) {
    return (
      <p style={{ color: "#4caf50", fontSize: 14 }}>
        No flaky tests detected — great signal quality.
      </p>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #333", textAlign: "left", color: "#aaa" }}>
          <th style={th}>Test Case</th>
          <th style={th}>Pass</th>
          <th style={th}>Fail</th>
          <th style={th}>Flaky Score</th>
        </tr>
      </thead>
      <tbody>
        {flakyTests.map((t) => {
          const total = t.passCount + t.failCount;
          const score = Math.round((t.failCount / total) * 100);
          const scoreColor = score >= 50 ? "#f44336" : "#ff9800";
          return (
            <tr key={t.testCaseId} style={{ borderBottom: "1px solid #222" }}>
              <td style={td}>{t.title}</td>
              <td style={{ ...td, color: "#4caf50" }}>{t.passCount}</td>
              <td style={{ ...td, color: "#f44336" }}>{t.failCount}</td>
              <td style={{ ...td, color: scoreColor, fontWeight: 600 }}>{score}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<RunStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [runsNeedingRerun, setRunsNeedingRerun] = useState<Awaited<ReturnType<typeof getAllRuns>>>([]);
  const [fetchError, setFetchError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const projectId = getActiveProjectId() ?? undefined;
        const [statsResult, trendResult, allRuns] = await Promise.all([
          getRunStats(undefined, projectId),
          getRunTrend(undefined, projectId),
          getAllRuns(projectId),
        ]);
        setStats(statsResult);
        setTrend(trendResult);
        setRunsNeedingRerun(
          allRuns.filter(
            (r) =>
              r.status === "done" &&
              !r.sourceRunId &&
              (r.resultCounts.fail ?? 0) + (r.resultCounts.blocked ?? 0) > 0,
          ),
        );
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <Suspense>
          <EnvFilter current="" />
        </Suspense>
      </div>

      {fetchError && <p style={{ color: "red" }}>{fetchError}</p>}

      {stats && (
        <>
          {/* Metric cards */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
            <MetricCard label="Runs Completed"      value={stats.totalRuns} />
            <MetricCard label="Avg Pass Rate"       value={stats.avgPassRate} unit="%" />
            <MetricCard label="Cases Executed"      value={stats.totalCasesExecuted} />
            <MetricCard label="Flaky Tests"         value={stats.flakyTests.length} />
          </div>

          {/* Trend chart */}
          <div style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: 24,
            marginBottom: 32,
          }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 16, color: "#eee" }}>
              Pass Rate Trend — last {trend.length} completed run{trend.length !== 1 ? "s" : ""}
            </h2>
            <TrendChart points={trend} />
          </div>

          {/* Flaky tests */}
          <div style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: 24,
            marginBottom: 32,
          }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: "#eee" }}>Flaky Tests</h2>
            <FlakyTable flakyTests={stats.flakyTests} />
          </div>

          {/* Runs needing rerun */}
          <div style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: 24,
          }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16, color: "#eee" }}>
              Runs needing rerun
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#555" }}>
              Completed original runs with at least one failure — max 5 shown
            </p>
            <RerunNeededClient runs={runsNeedingRerun} />
          </div>
        </>
      )}
    </main>
    </ProtectedRoute>
  );
}

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px 12px" };
