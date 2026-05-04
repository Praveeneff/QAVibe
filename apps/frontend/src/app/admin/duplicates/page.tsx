"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getSuites, getActiveProjectId, type TestSuite } from "@/lib/api";
import { getStoredToken } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";

interface ScanMatch {
  idA: string; titleA: string;
  idB: string; titleB: string;
  score: number;
  level: "high" | "medium";
}

interface ScanResult {
  total: number;
  matches: ScanMatch[];
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function runScan(suiteId?: string): Promise<ScanResult> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/test-cases/scan-duplicates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(suiteId ? { suiteId } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function ScoreBadge({ level, score }: { level: "high" | "medium"; score: number }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
      level === "high"
        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
        : "bg-amber-500/10 text-amber-400 border-amber-500/20",
    )}>
      <span className={cn(
        "w-1.5 h-1.5 rounded-full",
        level === "high" ? "bg-rose-400" : "bg-amber-400",
      )} />
      {score}% match
    </span>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-white/[0.04] animate-pulse", className)} />;
}

export default function DuplicateScannerPage() {
  const [suites,   setSuites]   = useState<TestSuite[]>([]);
  const [suiteId,  setSuiteId]  = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [result,   setResult]   = useState<ScanResult | null>(null);
  const [error,    setError]    = useState("");

  useEffect(() => {
    getSuites(getActiveProjectId() ?? undefined).then(setSuites).catch(() => {});
  }, []);

  async function handleScan() {
    setScanning(true);
    setError("");
    setResult(null);
    try {
      setResult(await runScan(suiteId || undefined));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <ProtectedRoute>
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/5 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-teal-500/4 blur-[100px]" />
      </div>

      <main className="px-8 py-8 min-h-screen">
        <div className="max-w-[820px]">
          <h1 className="m-0 mb-1 text-2xl font-bold text-foreground">Duplicate Scanner</h1>
          <p className="mt-0 mb-8 text-[13px] text-slate-500">
            Finds potentially duplicate test cases using word-overlap analysis. Pairs with Jaccard similarity ≥ 40% are flagged.
          </p>

          {/* Controls */}
          <div className="flex gap-3 items-center mb-8">
            <select
              value={suiteId}
              onChange={(e) => setSuiteId(e.target.value)}
              className="px-3 py-2 text-[13px] bg-[rgba(15,15,20,0.7)] text-foreground border border-white/[0.08] rounded-lg min-w-[200px] cursor-pointer focus:outline-none focus:border-violet-500/50 transition-colors"
            >
              <option value="">All suites</option>
              {suites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <button
              onClick={handleScan}
              disabled={scanning}
              className={cn(
                "inline-flex items-center gap-2 px-5 py-2 text-[13px] font-semibold text-white border-none rounded-lg transition-colors",
                scanning
                  ? "bg-slate-700 cursor-not-allowed"
                  : "bg-primary cursor-pointer hover:bg-primary/90",
              )}
            >
              {scanning && <Loader2 className="h-4 w-4 animate-spin" />}
              {scanning ? "Scanning…" : "Run Scan"}
            </button>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 text-sm">
              {error}
            </div>
          )}

          {scanning && (
            <div className="flex flex-col gap-2.5">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          )}

          {!scanning && result !== null && (
            <>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg border mb-5 text-[13px]",
                result.total === 0
                  ? "border-teal-500/20 bg-teal-500/5 text-teal-400"
                  : "border-amber-500/20 bg-amber-500/5 text-amber-300",
              )}>
                <span className="text-base">{result.total === 0 ? "✓" : "⚠"}</span>
                {result.total === 0
                  ? "No duplicate pairs found — your test suite looks clean."
                  : `Found ${result.total} potential duplicate pair${result.total === 1 ? "" : "s"}${result.matches.length < result.total ? ` (showing top ${result.matches.length})` : ""}.`
                }
              </div>

              {result.matches.length > 0 && (
                <div className="flex flex-col gap-3">
                  {result.matches.map((m, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm px-4 py-4"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <ScoreBadge level={m.level} score={m.score} />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
                          <div className="text-[10px] text-slate-600 uppercase tracking-[0.06em] mb-1">Case A</div>
                          <a
                            href={`/test-cases/${m.idA}`}
                            className="text-[13px] text-violet-400 hover:text-violet-300 no-underline hover:underline transition-colors line-clamp-2"
                          >
                            {m.titleA}
                          </a>
                        </div>
                        <div className="text-slate-600 self-center text-sm mt-3">↔</div>
                        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
                          <div className="text-[10px] text-slate-600 uppercase tracking-[0.06em] mb-1">Case B</div>
                          <a
                            href={`/test-cases/${m.idB}`}
                            className="text-[13px] text-violet-400 hover:text-violet-300 no-underline hover:underline transition-colors line-clamp-2"
                          >
                            {m.titleB}
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
