"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  getRunStats,
  getRunTrend,
  getAllRuns,
  getTestCases,
  getSuites,
  getActiveProjectId,
  type RunStats,
  type TrendPoint,
  type RunSummary,
} from "@/lib/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  type TooltipProps,
} from "recharts";
import {
  CheckCircle2,
  PlayCircle,
  FolderTree,
  FileText,
  Loader2,
} from "lucide-react";
import EnvFilter from "@/components/EnvFilter";
import RerunNeededClient from "./RerunNeededClient";
import ProtectedRoute from "@/components/ProtectedRoute";

// ── Shared primitives ─────────────────────────────────────────────────────────

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm p-6",
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

type Accent = "purple" | "teal" | "amber" | "slate";

const ACCENT: Record<Accent, {
  glow: string; badge: string; text: string; border: string; icon: string;
}> = {
  purple: {
    glow:   "shadow-[0_0_32px_-4px_rgba(139,92,246,0.22)]",
    badge:  "bg-violet-500/10 border-violet-500/20",
    text:   "text-violet-400",
    border: "border-violet-500/10",
    icon:   "text-violet-400",
  },
  teal: {
    glow:   "shadow-[0_0_32px_-4px_rgba(20,184,166,0.18)]",
    badge:  "bg-teal-500/10 border-teal-500/20",
    text:   "text-teal-400",
    border: "border-teal-500/10",
    icon:   "text-teal-400",
  },
  amber: {
    glow:   "shadow-[0_0_32px_-4px_rgba(245,158,11,0.18)]",
    badge:  "bg-amber-500/10 border-amber-500/20",
    text:   "text-amber-400",
    border: "border-amber-500/10",
    icon:   "text-amber-400",
  },
  slate: {
    glow:   "shadow-[0_0_32px_-4px_rgba(100,116,139,0.15)]",
    badge:  "bg-slate-700/30 border-slate-600/20",
    text:   "text-slate-300",
    border: "border-slate-700/20",
    icon:   "text-slate-400",
  },
};

function MetricCard({
  label, value, unit, subtext, accent, Icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  accent: Accent;
  Icon: React.ElementType;
}) {
  const a = ACCENT[accent];
  return (
    <div className={cn(
      "rounded-xl border p-5 bg-[rgba(15,15,20,0.7)] backdrop-blur-sm",
      a.border, a.glow,
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-[0.08em] mb-2">{label}</div>
          <div className={cn("text-[30px] font-bold leading-none", a.text)}>
            {value}
            {unit && <span className="text-sm text-slate-500 ml-1 font-normal">{unit}</span>}
          </div>
          {subtext && <div className="text-[11px] text-slate-600 mt-2">{subtext}</div>}
        </div>
        <div className={cn("w-10 h-10 rounded-lg border flex items-center justify-center shrink-0", a.badge)}>
          <Icon className={cn("w-5 h-5", a.icon)} />
        </div>
      </div>
    </div>
  );
}

// ── Trend chart ───────────────────────────────────────────────────────────────

function TrendTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const { name, passRate } = payload[0].payload as TrendPoint;
  return (
    <div className="rounded-lg px-3 py-2.5 text-[13px] shadow-xl border border-white/10 bg-[rgba(20,20,30,0.95)] backdrop-blur-md">
      <p className="font-medium mb-1 truncate max-w-[180px] text-slate-200">{name}</p>
      <p className="font-bold text-teal-400">{passRate}% pass rate</p>
    </div>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="py-12 text-slate-600 text-center text-sm">
        No completed runs yet — trend will appear here.
      </div>
    );
  }

  const chartData = points.map((p) => ({
    ...p,
    label: p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#475569", fontSize: 11 }}
          axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: "#475569", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={<TrendTooltip />} cursor={{ stroke: "rgba(139,92,246,0.15)", strokeWidth: 1 }} />
        <ReferenceLine
          y={80}
          stroke="#8b5cf6"
          strokeDasharray="5 3"
          strokeOpacity={0.3}
          label={{ value: "80%", position: "right", fill: "#475569", fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="passRate"
          stroke="url(#trendGrad)"
          strokeWidth={2.5}
          dot={{ fill: "#14b8a6", r: 3.5, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#14b8a6", stroke: "rgba(20,184,166,0.3)", strokeWidth: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Distribution donut ────────────────────────────────────────────────────────

const DONUT_COLORS = ["#14b8a6", "#8b5cf6", "#475569"];

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-[13px] shadow-xl border border-white/10 bg-[rgba(20,20,30,0.95)] backdrop-blur-md">
      <p className="text-slate-200 font-medium">{payload[0].name}</p>
      <p className="font-bold" style={{ color: payload[0].payload.fill }}>{payload[0].value}</p>
    </div>
  );
}

function DistributionChart({ active, archived, total }: { active: number; archived: number; total: number }) {
  const draft = Math.max(0, total - active - archived);
  const data = [
    { name: "Active",   value: active,   fill: DONUT_COLORS[0] },
    { name: "Draft",    value: draft,    fill: DONUT_COLORS[1] },
    { name: "Archived", value: archived, fill: DONUT_COLORS[2] },
  ].filter((d) => d.value > 0);

  if (total === 0) {
    return (
      <div className="py-12 text-slate-600 text-center text-sm">
        No test cases yet.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={42}
            outerRadius={62}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex flex-col gap-2.5 flex-1">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
              <span className="text-[13px] text-slate-400">{d.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-200">{d.value}</span>
              <span className="text-[11px] text-slate-600">
                {Math.round((d.value / total) * 100)}%
              </span>
            </div>
          </div>
        ))}
        <div className="mt-1 pt-2.5 border-t border-white/[0.05] flex justify-between">
          <span className="text-[11px] text-slate-600">Total</span>
          <span className="text-[13px] font-bold text-slate-300">{total}</span>
        </div>
      </div>
    </div>
  );
}

// ── Recent runs table ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "done") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-teal-500/10 text-teal-400 border-teal-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />Done
    </span>
  );
  if (s === "in_progress") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-amber-500/10 text-amber-400 border-amber-500/20">
      <Loader2 className="w-2.5 h-2.5 animate-spin" />Running
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-slate-700/40 text-slate-400 border-slate-600/30">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />{status}
    </span>
  );
}

function PassBar({ passRate, resultCounts }: { passRate: number; resultCounts: RunSummary["resultCounts"] }) {
  const total = Object.values(resultCounts).reduce((a, b) => a + (b ?? 0), 0);
  if (total === 0) return <span className="text-slate-600 text-[12px]">—</span>;

  const pass    = resultCounts.pass    ?? 0;
  const fail    = resultCounts.fail    ?? 0;
  const blocked = resultCounts.blocked ?? 0;
  const pPass    = Math.round((pass    / total) * 100);
  const pFail    = Math.round((fail    / total) * 100);
  const pBlocked = Math.round((blocked / total) * 100);

  return (
    <div className="flex items-center gap-2.5 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/[0.06] flex">
        {pPass    > 0 && <div className="h-full bg-teal-500"    style={{ width: `${pPass}%`    }} />}
        {pBlocked > 0 && <div className="h-full bg-amber-500"   style={{ width: `${pBlocked}%` }} />}
        {pFail    > 0 && <div className="h-full bg-rose-500"    style={{ width: `${pFail}%`    }} />}
      </div>
      <span className="text-[12px] font-medium text-slate-400 tabular-nums w-8 shrink-0">
        {Math.round(passRate)}%
      </span>
    </div>
  );
}

function RecentRunsTable({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) {
    return (
      <div className="py-8 text-center text-slate-600 text-sm">
        No runs yet — start your first test run from the Test Cases page.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className={thClass}>Run</th>
          <th className={thClass}>Status</th>
          <th className={thClass}>Progress</th>
          <th className={thClass}>Cases</th>
          <th className={cn(thClass, "text-right")}>Date</th>
        </tr>
      </thead>
      <tbody>
        {runs.slice(0, 5).map((run) => (
          <tr key={run.id} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
            <td className="px-3 py-3">
              <Link
                href={`/runs/${run.id}`}
                className="text-slate-200 hover:text-violet-400 transition-colors font-medium overflow-hidden text-ellipsis whitespace-nowrap block max-w-[220px]"
              >
                {run.name}
              </Link>
              {run.environment && (
                <span className="text-[11px] text-slate-600">{run.environment}</span>
              )}
            </td>
            <td className="px-3 py-3"><StatusPill status={run.status} /></td>
            <td className="px-3 py-3">
              <PassBar passRate={run.passRate} resultCounts={run.resultCounts} />
            </td>
            <td className="px-3 py-3 text-slate-500 tabular-nums">{run.total}</td>
            <td className="px-3 py-3 text-slate-600 text-right tabular-nums whitespace-nowrap">
              {new Date(run.createdAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Flaky tests ───────────────────────────────────────────────────────────────

function FlakyTable({ flakyTests }: { flakyTests: RunStats["flakyTests"] }) {
  if (flakyTests.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1 text-sm text-teal-500">
        <CheckCircle2 className="w-4 h-4" />
        No flaky tests detected — great signal quality.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className={thClass}>Test Case</th>
          <th className={thClass}>Pass</th>
          <th className={thClass}>Fail</th>
          <th className={thClass}>Score</th>
        </tr>
      </thead>
      <tbody>
        {flakyTests.map((t) => {
          const total = t.passCount + t.failCount;
          const score = Math.round((t.failCount / total) * 100);
          return (
            <tr key={t.testCaseId} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <td className="px-3 py-3 text-slate-300">{t.title}</td>
              <td className="px-3 py-3 text-teal-400 font-medium">{t.passCount}</td>
              <td className="px-3 py-3 text-rose-400 font-medium">{t.failCount}</td>
              <td className="px-3 py-3">
                <span className={cn(
                  "inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                  score >= 50
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20",
                )}>
                  {score}%
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <main className="px-8 py-8 min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </main>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats,            setStats]            = useState<RunStats | null>(null);
  const [trend,            setTrend]            = useState<TrendPoint[]>([]);
  const [allRuns,          setAllRuns]          = useState<RunSummary[]>([]);
  const [runsNeedingRerun, setRunsNeedingRerun] = useState<RunSummary[]>([]);
  const [totalCases,       setTotalCases]       = useState(0);
  const [activeCases,      setActiveCases]      = useState(0);
  const [archivedCases,    setArchivedCases]    = useState(0);
  const [suiteCount,       setSuiteCount]       = useState(0);
  const [fetchError,       setFetchError]       = useState("");
  const [loading,          setLoading]          = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const projectId = getActiveProjectId() ?? undefined;
        const pid = projectId;
        const [statsResult, trendResult, runsResult, allCases, activeCasesResult, archivedCasesResult, suitesResult] = await Promise.all([
          getRunStats(undefined, pid),
          getRunTrend(undefined, pid),
          getAllRuns(pid),
          getTestCases({ limit: 1, ...(pid ? { projectId: pid } : {}) }),
          getTestCases({ limit: 1, status: "active",   ...(pid ? { projectId: pid } : {}) }),
          getTestCases({ limit: 1, status: "archived", ...(pid ? { projectId: pid } : {}) }),
          getSuites(pid),
        ]);
        setStats(statsResult);
        setTrend(trendResult);
        setAllRuns(runsResult);
        setTotalCases(allCases.total);
        setActiveCases(activeCasesResult.total);
        setArchivedCases(archivedCasesResult.total);
        setSuiteCount(suitesResult.length);
        setRunsNeedingRerun(
          runsResult.filter(
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

  const activeRunsCount = allRuns.filter((r) => r.status === "in_progress").length;

  if (loading) return <DashboardSkeleton />;

  return (
    <ProtectedRoute>
      {/* Ambient background glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 right-0 w-[600px] h-[600px] rounded-full bg-violet-600/5 blur-[120px]" />
        <div className="absolute bottom-0 -left-40 w-[500px] h-[500px] rounded-full bg-teal-500/5 blur-[100px]" />
      </div>

      <main className="px-8 py-8 min-h-screen">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-0.5 w-16 bg-gradient-to-r from-violet-500 to-teal-500 rounded-full mb-2" />
            <h1 className="m-0 text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="mt-1 mb-0 text-[13px] text-slate-500">Quality metrics at a glance</p>
          </div>
          <Suspense>
            <EnvFilter current="" />
          </Suspense>
        </div>

        {fetchError && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 text-sm">
            {fetchError}
          </div>
        )}

        {/* ── Metric cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            accent="purple"
            Icon={FileText}
            label="Total Test Cases"
            value={totalCases}
            subtext={suiteCount > 0 ? `across ${suiteCount} suite${suiteCount !== 1 ? "s" : ""}` : "no suites yet"}
          />
          <MetricCard
            accent="teal"
            Icon={CheckCircle2}
            label="Avg Pass Rate"
            value={stats?.avgPassRate ?? 0}
            unit="%"
            subtext={`over ${stats?.totalRuns ?? 0} run${stats?.totalRuns !== 1 ? "s" : ""}`}
          />
          <MetricCard
            accent="amber"
            Icon={PlayCircle}
            label="Active Runs"
            value={activeRunsCount}
            subtext={activeRunsCount === 1 ? "in progress" : activeRunsCount > 0 ? "in progress" : "none running"}
          />
          <MetricCard
            accent="slate"
            Icon={FolderTree}
            label="Test Suites"
            value={suiteCount}
            subtext={`${stats?.totalCasesExecuted ?? 0} cases executed`}
          />
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <Panel>
            <PanelTitle>
              Pass Rate Trend
              <span className="ml-auto text-[11px] text-slate-600 font-normal normal-case tracking-normal">
                last {trend.length} run{trend.length !== 1 ? "s" : ""}
              </span>
            </PanelTitle>
            <TrendChart points={trend} />
          </Panel>

          <Panel>
            <PanelTitle>Test Case Distribution</PanelTitle>
            <DistributionChart
              total={totalCases}
              active={activeCases}
              archived={archivedCases}
            />
          </Panel>
        </div>

        {/* ── Recent runs + flaky tests row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          <Panel>
            <PanelTitle>Recent Test Runs</PanelTitle>
            <RecentRunsTable runs={allRuns} />
            {allRuns.length > 5 && (
              <div className="mt-4 pt-3 border-t border-white/[0.04]">
                <Link
                  href="/runs"
                  className="text-[13px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                  View all {allRuns.length} runs →
                </Link>
              </div>
            )}
          </Panel>

          {stats && (
            <Panel>
              <PanelTitle>Flaky Tests</PanelTitle>
              <FlakyTable flakyTests={stats.flakyTests} />
            </Panel>
          )}
        </div>

        {/* ── Runs needing rerun ── */}
        <Panel>
          <PanelTitle>Runs Needing Rerun</PanelTitle>
          <p className="mt-0 mb-4 text-[13px] text-slate-600">
            Completed runs with at least one failure or blocked case
          </p>
          <RerunNeededClient runs={runsNeedingRerun} />
        </Panel>

      </main>
    </ProtectedRoute>
  );
}

const thClass = "px-3 py-2.5 text-[11px] font-semibold text-slate-600 uppercase tracking-[0.06em] text-left";
