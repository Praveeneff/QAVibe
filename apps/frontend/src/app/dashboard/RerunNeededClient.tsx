"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { handle401Redirect, type RunSummary } from "@/lib/api";

export default function RerunNeededClient({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();
  const [rerunning, setRerunning] = useState<Record<string, boolean>>({});
  const [errors,    setErrors]    = useState<Record<string, string>>({});

  async function handleRerun(run: RunSummary) {
    setRerunning((prev) => ({ ...prev, [run.id]: true }));
    setErrors((prev) => ({ ...prev, [run.id]: "" }));
    try {
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${BASE_URL}/test-runs/${run.id}/rerun`, { method: "POST" });
      if (!res.ok) {
        if (res.status === 401) { handle401Redirect(); return; }
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
      <div className="flex items-center gap-2 py-1 text-sm text-teal-500">
        <span className="text-base">✓</span>
        All completed runs passed
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {runs.slice(0, 5).map((run) => {
        const failCount    = run.resultCounts.fail    ?? 0;
        const blockedCount = run.resultCounts.blocked ?? 0;
        const busy = rerunning[run.id] ?? false;
        const err  = errors[run.id] ?? "";

        return (
          <div
            key={run.id}
            className="flex items-center justify-between px-3 py-3 rounded-lg border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.02] transition-colors gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap mb-1">
                {run.name}
              </div>
              <div className="flex gap-3 text-[11px]">
                {failCount > 0 && (
                  <span className="text-rose-400">✗ {failCount} failed</span>
                )}
                {blockedCount > 0 && (
                  <span className="text-amber-400">⊘ {blockedCount} blocked</span>
                )}
                {err && (
                  <span className="text-rose-400">{err}</span>
                )}
              </div>
            </div>

            <button
              onClick={() => handleRerun(run)}
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold border transition-colors shrink-0",
                busy
                  ? "border-slate-700 text-slate-600 cursor-not-allowed"
                  : "border-amber-500/30 text-amber-400 cursor-pointer hover:bg-amber-500/10 hover:border-amber-500/50",
              )}
            >
              {busy
                ? <><Loader2 className="h-3 w-3 animate-spin" />Creating…</>
                : "↺ Rerun"
              }
            </button>
          </div>
        );
      })}
    </div>
  );
}
