"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RunSummary } from "@/lib/api";

export default function RerunNeededClient({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();

  // Per-run rerunning + error state keyed by run id
  const [rerunning, setRerunning] = useState<Record<string, boolean>>({});
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  async function handleRerun(run: RunSummary) {
    setRerunning((prev) => ({ ...prev, [run.id]: true }));
    setErrors((prev) => ({ ...prev, [run.id]: "" }));
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
      setErrors((prev) => ({ ...prev, [run.id]: err?.message ?? "Failed to create rerun" }));
      setRerunning((prev) => ({ ...prev, [run.id]: false }));
    }
  }

  if (runs.length === 0) {
    return (
      <p style={{ color: "#4caf50", fontSize: 14, margin: 0 }}>
        All completed runs passed ✓
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {runs.slice(0, 5).map((run) => {
        const failCount    = run.resultCounts.fail    ?? 0;
        const blockedCount = run.resultCounts.blocked ?? 0;
        const busy = rerunning[run.id] ?? false;
        const err  = errors[run.id] ?? "";

        return (
          <div
            key={run.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: "1px solid #222",
              gap: 12,
            }}
          >
            {/* Left: name + counts */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14,
                color: "#eee",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {run.name}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 12 }}>
                {failCount > 0 && (
                  <span style={{ color: "#f44336" }}>✗ {failCount} failed</span>
                )}
                {blockedCount > 0 && (
                  <span style={{ color: "#ff9800" }}>⊘ {blockedCount} blocked</span>
                )}
                {err && (
                  <span style={{ color: "#f87171" }}>{err}</span>
                )}
              </div>
            </div>

            {/* Right: rerun button */}
            <button
              onClick={() => handleRerun(run)}
              disabled={busy}
              style={{
                background: "transparent",
                border: "1px solid #78350f",
                color: busy ? "#666" : "#f59e0b",
                borderRadius: 4,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {busy ? "Creating…" : "↺ Rerun"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
