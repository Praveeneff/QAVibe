"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RunSummary } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { usePermission } from "@/context/PermissionsContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function PassRateCell({ rate, total }: { rate: number; total: number }) {
  if (total === 0) return <span style={{ color: "#555" }}>—</span>;
  const color = rate >= 80 ? "#4caf50" : rate >= 50 ? "#ff9800" : "#f44336";
  return <span style={{ color, fontWeight: 600 }}>{rate}%</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    done:    { bg: "#0a3d0a",  fg: "#4caf50" },
    running: { bg: "#1a2a3d",  fg: "#64b5f6" },
    pending: { bg: "#2a2a2a",  fg: "#aaa" },
  };
  const { bg, fg } = colors[status] ?? { bg: "#2a2a2a", fg: "#aaa" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, background: bg, color: fg }}>
      {status}
    </span>
  );
}

const ENV_COLORS: Record<string, { bg: string; fg: string }> = {
  staging:    { bg: "#1a2a3d", fg: "#64b5f6" },
  production: { bg: "#3d1a0a", fg: "#ff7043" },
  dev:        { bg: "#2a1a3d", fg: "#ab47bc" },
  qa:         { bg: "#0a3d2a", fg: "#26a69a" },
};

function EnvBadge({ env }: { env: string }) {
  const { bg, fg } = ENV_COLORS[env] ?? { bg: "#222", fg: "#aaa" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, background: bg, color: fg }}>
      {env}
    </span>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RunRow({ run, canDelete }: { run: RunSummary; canDelete: boolean }) {
  const router = useRouter();
  const [rerunning,  setRerunning]  = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [rowError,   setRowError]   = useState("");

  const canRerun =
    run.status === "done" &&
    ((run.resultCounts.fail ?? 0) + (run.resultCounts.blocked ?? 0)) > 0;

  async function handleRerun() {
    setRerunning(true);
    setRowError("");
    try {
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${BASE_URL}/test-runs/${run.id}/rerun`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? "Failed to create rerun");
      }
      const newRun = await res.json();
      router.push(`/runs/${newRun.id}`);
    } catch (err: any) {
      setRowError(err?.message ?? "Failed to create rerun");
      setRerunning(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete run "${run.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setRowError("");
    try {
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${BASE_URL}/test-runs/${run.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete run (${res.status})`);
      router.refresh();
    } catch (err: any) {
      setRowError(err?.message ?? "Failed to delete run");
      setDeleting(false);
    }
  }

  return (
    <tr key={run.id} style={{ borderBottom: "1px solid #222" }}>
      {/* Run name + metadata */}
      <td style={td}>
        <div>{run.name}</div>
        {run.sourceRunName && (
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
            Rerun of: {run.sourceRunName}
          </div>
        )}
        {run.createdBy && (
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
            Started by {run.createdBy}
          </div>
        )}
        {rowError && (
          <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>{rowError}</div>
        )}
        {(run.browser || run.buildVersion || run.device) && (
          <div style={{ marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {run.browser && (
              <span style={{ fontSize: 11, color: "#666" }}>{run.browser}</span>
            )}
            {run.device && (
              <span style={{ fontSize: 11, color: "#555" }}>{run.device}</span>
            )}
            {run.buildVersion && (
              <span style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>
                {run.buildVersion}
              </span>
            )}
          </div>
        )}
      </td>

      <td style={td}><EnvBadge env={run.environment} /></td>
      <td style={td}><StatusBadge status={run.status} /></td>
      <td style={td}><PassRateCell rate={run.passRate} total={run.total} /></td>

      {/* Result counts */}
      <td style={{ ...td, fontSize: 13, color: "#aaa" }}>
        {run.total > 0 ? (
          <>
            <span style={{ color: "#4caf50" }}>✓ {run.resultCounts.pass}</span>
            {"  "}
            <span style={{ color: "#f44336" }}>✗ {run.resultCounts.fail}</span>
            {"  "}
            <span style={{ color: "#ff9800" }}>⊘ {run.resultCounts.blocked}</span>
            {"  "}
            <span style={{ color: "#888" }}>— {run.resultCounts.skip}</span>
          </>
        ) : (
          <span style={{ color: "#555" }}>no results</span>
        )}
      </td>

      <td style={{ ...td, color: "#666", fontSize: 13 }}>{timeAgo(run.createdAt)}</td>

      {/* Actions */}
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canRerun && (
            <button
              onClick={handleRerun}
              disabled={rerunning}
              style={{
                background: "transparent",
                border: "1px solid #78350f",
                color: rerunning ? "#666" : "#f59e0b",
                borderRadius: 4,
                padding: "3px 10px",
                fontSize: 12,
                cursor: rerunning ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {rerunning ? "…" : "↺ Rerun"}
            </button>
          )}
          <Link href={`/runs/${run.id}`} style={{ color: "#0070f3", textDecoration: "none", fontSize: 14 }}>
            View
          </Link>
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                background: "transparent",
                border: "1px solid #5c2020",
                color: deleting ? "#555" : "#f87171",
                borderRadius: 4,
                padding: "3px 10px",
                fontSize: 12,
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              {deleting ? "…" : "Delete"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

export default function RunsClient({ runs }: { runs: RunSummary[] }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { can } = usePermission();
  const router = useRouter();

  const visibleRuns = useMemo(() => {
    if (can("view_all", "test_run")) {
      return runs; // Admin or tester with view_all
    }
    // Tester with view_own only
    const userId = user?.id;
    return runs.filter(run => run.assignedTo === userId);
  }, [runs, can, user?.id]);

  if (visibleRuns.length === 0) return null;

  return (
    <>
      {can("create", "test_run") && (
        <div style={{ marginBottom: 16, textAlign: "right" }}>
          <button
            onClick={() => router.push("/test-cases")}
            style={{
              padding: "8px 16px",
              background: "#0070f3",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            + New Run
          </button>
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #333", textAlign: "left", color: "#aaa" }}>
            <th style={th}>Run Name</th>
            <th style={th}>Env</th>
            <th style={th}>Status</th>
            <th style={th}>Pass Rate</th>
            <th style={th}>Results</th>
            <th style={th}>When</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {visibleRuns.map((run) => (
            <RunRow key={run.id} run={run} canDelete={can("delete", "test_run")} />
          ))}
        </tbody>
      </table>
    </>
  );
}

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px 12px" };
