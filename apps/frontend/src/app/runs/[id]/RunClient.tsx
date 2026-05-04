"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { updateTestResult, completeTestRun, uploadScreenshot, type TestRun, type TestResult } from "@/lib/api";
import { getStoredToken } from "@/context/AuthContext";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const STATUSES = ["pending", "pass", "fail", "blocked", "skip"] as const;

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-950/60 text-destructive border border-red-900",
  high:     "bg-orange-950/40 text-amber-500 border border-amber-900",
  medium:   "bg-blue-950/40 text-blue-400 border border-blue-900",
  low:      "bg-slate-800 text-slate-400 border border-slate-700",
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn("px-2 py-px rounded text-[11px] font-semibold", SEVERITY_CLASSES[severity] ?? "bg-slate-800 text-slate-400 border border-slate-700")}>
      {severity}
    </span>
  );
}

const ENV_CLASSES: Record<string, string> = {
  staging:    "bg-blue-950/40 text-blue-400",
  production: "bg-orange-950/40 text-orange-400",
  dev:        "bg-purple-950/40 text-purple-400",
  qa:         "bg-teal-950/40 text-teal-400",
};

function EnvPill({ label }: { label: string }) {
  return (
    <span className={cn("px-2.5 py-[3px] rounded text-xs font-semibold tracking-[0.03em]", ENV_CLASSES[label.toLowerCase()] ?? "bg-slate-800 text-slate-400")}>
      {label}
    </span>
  );
}

function MetaPill({ label, icon, mono }: { label: string; icon: string; mono?: boolean }) {
  return (
    <span className={cn("px-2.5 py-[3px] rounded text-xs bg-card text-muted-foreground inline-flex items-center gap-1.5", mono && "font-mono")}>
      <span className="text-[11px]">{icon}</span>
      {label}
    </span>
  );
}

// Tailwind variant maps for status
const STATUS_TEXT: Record<string, string> = {
  pass:    "text-emerald-400",
  fail:    "text-destructive",
  blocked: "text-amber-500",
  skip:    "text-slate-400",
  pending: "text-slate-500",
};
const STATUS_BG_ACTIVE: Record<string, string> = {
  pass:    "bg-emerald-950/40",
  fail:    "bg-red-950/40",
  blocked: "bg-amber-950/30",
  skip:    "bg-slate-800",
  pending: "bg-slate-900",
};
const STATUS_BORDER_ACTIVE: Record<string, string> = {
  pass:    "border-emerald-700",
  fail:    "border-red-800",
  blocked: "border-amber-700",
  skip:    "border-slate-700",
  pending: "border-slate-800",
};
const STATUS_BORDER_L: Record<string, string> = {
  pass:    "border-l-emerald-500",
  fail:    "border-l-red-500",
  blocked: "border-l-amber-500",
  skip:    "border-l-slate-500",
  pending: "border-l-slate-700",
};

function summary(run: TestRun) {
  const counts: Record<string, number> = { pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0 };
  for (const r of run.results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

export default function RunClient({ initialRun }: { initialRun: TestRun }) {
  const { loading } = useRequireAuth();
  const router = useRouter();
  const [run, setRun] = useState<TestRun>(initialRun);
  const [completing, setCompleting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState("");
  const [activeResult, setActiveResult] = useState<TestResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleStatusChange(resultId: string, status: string) {
    const updated = await updateTestResult(run.id, resultId, status, undefined, getStoredToken() ?? "", run.projectId);
    setRun((prev) => ({
      ...prev,
      results: prev.results.map((r) => (r.id === resultId ? { ...r, status: updated.status } : r)),
    }));
    setActiveResult((prev) => prev?.id === resultId ? { ...prev, status: updated.status } : prev);
  }

  async function handleNotesChange(resultId: string, notes: string) {
    const current = run.results.find((r) => r.id === resultId);
    const updated = await updateTestResult(run.id, resultId, current?.status ?? "pending", notes, getStoredToken() ?? "", run.projectId);
    setRun((prev) => ({
      ...prev,
      results: prev.results.map((r) => (r.id === resultId ? { ...r, notes: updated.notes } : r)),
    }));
    setActiveResult((prev) => prev?.id === resultId ? { ...prev, notes: updated.notes } : prev);
  }

  async function handleScreenshotUpload(file: File) {
    if (!activeResult) return;
    setUploading(true);
    setUploadError("");
    try {
      const { screenshotUrl } = await uploadScreenshot(run.id, activeResult.id, file);
      setRun((prev) => ({
        ...prev,
        results: prev.results.map((r) => r.id === activeResult.id ? { ...r, screenshotUrl } : r),
      }));
      setActiveResult((prev) => prev ? { ...prev, screenshotUrl } : prev);
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRerun() {
    setRerunning(true);
    setRerunError("");
    try {
      const token = getStoredToken();
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${BASE_URL}/test-runs/${run.id}/rerun`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(data?.message ?? "Failed to create rerun");
      router.push(`/runs/${data.id}`);
    } catch (err: any) {
      setRerunError(err?.message ?? "Failed to create rerun");
      setRerunning(false);
    }
  }

  async function handleComplete() {
    if (!confirm("Mark this run as done?")) return;
    setCompleting(true);
    await completeTestRun(run.id, run.projectId);
    setRun((prev) => ({ ...prev, status: "done" }));
    setCompleting(false);
  }

  const counts = summary(run);
  const failedCount = (counts.fail ?? 0) + (counts.blocked ?? 0);
  const canRerun = run.status === "done" && failedCount > 0;
  if (loading) return null;

  const panel = activeResult;

  return (
    <div className="flex gap-0 items-start min-h-screen">
      {/* Main content */}
      <div className={cn("flex-1 min-w-0", panel && "pr-4")}>
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/test-cases")}
            className="bg-transparent border-none text-primary cursor-pointer text-sm p-0 mb-3"
          >
            ← Back to Test Cases
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="m-0">{run.name}</h1>
              <span className="text-[13px] text-slate-400">
                Status:{" "}
                <span className={run.status === "done" ? "text-emerald-400" : "text-yellow-300"}>
                  {run.status}
                </span>
              </span>
            </div>
            <div className="flex gap-2 items-center">
              {canRerun && (
                <button
                  onClick={handleRerun}
                  disabled={rerunning}
                  className={cn(rerunBtnClass, rerunning && "opacity-50 cursor-not-allowed")}
                >
                  {rerunning ? "Creating rerun…" : `↺ Rerun Failed (${failedCount})`}
                </button>
              )}
              {run.status !== "done" && (
                <button
                  onClick={handleComplete}
                  disabled={completing}
                  className={cn(completeBtnClass, completing && "opacity-50 cursor-not-allowed")}
                >
                  {completing ? "Completing…" : "✓ Complete Run"}
                </button>
              )}
            </div>
          </div>

          {rerunError && (
            <div className="mt-2.5 px-3.5 py-2 bg-destructive/10 border border-red-900 rounded-md text-red-400 text-[13px]">
              {rerunError}
            </div>
          )}

          <div className="flex gap-2 mt-3 flex-wrap">
            <EnvPill label={run.environment} />
            {run.browser && <MetaPill label={run.browser} icon="🌐" />}
            {run.device  && <MetaPill label={run.device}  icon="📱" />}
            {run.buildVersion && <MetaPill label={run.buildVersion} icon="🏷" mono />}
          </div>
        </div>

        {/* Progress bar */}
        {(() => {
          const total = run.results.length;
          const done = run.results.filter(r => r.status !== "pending").length;
          const passed = run.results.filter(r => r.status === "pass").length;
          const failed = run.results.filter(r => r.status === "fail").length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <div className="mb-5">
              <div className="h-2 bg-card rounded overflow-hidden mb-2">
                <div
                  className={cn("h-full rounded transition-[width]", failed > 0 ? "bg-red-500" : "bg-emerald-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex gap-4 text-[13px] flex-wrap">
                <span className="text-slate-400">{pct}% complete</span>
                <span className="text-emerald-400">✓ {passed} passed</span>
                <span className="text-destructive">✗ {failed} failed</span>
                <span className="text-slate-400">{total - done} remaining</span>
              </div>
            </div>
          );
        })()}

        {run.status !== "done" && (
          <p className="text-slate-700 text-xs mb-4 italic">
            💡 Click a row to open the detail panel. Use the status dropdown to mark results.
          </p>
        )}

        {/* Results table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className={thClass}>Test Case</th>
              <th className={thClass}>Severity</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>📎</th>
            </tr>
          </thead>
          <tbody>
            {[...run.results]
              .sort((a, b) =>
                (SEVERITY_ORDER[a.testCase.severity] ?? 99) -
                (SEVERITY_ORDER[b.testCase.severity] ?? 99),
              )
              .map((result) => {
                const isActive = panel?.id === result.id;
                const statusText = STATUS_TEXT[result.status] ?? "text-slate-400";
                const statusBorderL = STATUS_BORDER_L[result.status] ?? "border-l-slate-700";
                return (
                  <tr
                    key={result.id}
                    onClick={() => setActiveResult(isActive ? null : result)}
                    className={cn(
                      "border-b border-slate-900 border-l-[3px] cursor-pointer transition-colors",
                      statusBorderL,
                      isActive ? "bg-blue-950/20" : "bg-transparent hover:bg-slate-900/40",
                    )}
                  >
                    <td className={tdClass}>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-blue-400 text-[13px] underline decoration-blue-900 underline-offset-[3px]">
                          {result.testCase.title}
                        </span>
                        <span className="text-[11px] text-slate-600 italic">click to open details →</span>
                      </div>
                    </td>
                    <td className={tdClass}><SeverityBadge severity={result.testCase.severity} /></td>
                    <td className={tdClass}>
                      <span className={cn(
                        "inline-block px-2.5 py-px rounded text-xs font-semibold border",
                        STATUS_BG_ACTIVE[result.status] ?? "bg-slate-900",
                        statusText,
                        STATUS_BORDER_ACTIVE[result.status] ?? "border-slate-700",
                      )}>
                        {result.status}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {result.screenshotUrl && (
                        <span className="text-[11px] text-blue-400 bg-blue-950/30 border border-blue-900 rounded px-1.5 py-px font-semibold">
                          📷 screenshot
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Side panel */}
      {panel && (
        <div className="w-[380px] shrink-0 sticky top-6 max-h-[calc(100vh-48px)] overflow-y-auto bg-[#111] border border-slate-800 rounded-lg p-5 flex flex-col gap-5">
          {/* Panel header */}
          <div className="flex justify-between items-start">
            <div className="flex-1 mr-3">
              <div className="flex flex-col gap-1">
                {panel.testCase.tcId && (
                  <span className="text-[11px] font-mono text-blue-400 bg-blue-950/30 border border-blue-900 rounded-[3px] px-1.5 py-px self-start">
                    {panel.testCase.tcId}
                  </span>
                )}
                <div className="text-[13px] font-bold text-foreground leading-snug">
                  {panel.testCase.title}
                </div>
              </div>
              <div className="mt-1.5">
                <SeverityBadge severity={panel.testCase.severity} />
              </div>
            </div>
            <button
              onClick={() => setActiveResult(null)}
              className="bg-transparent border-none text-slate-500 cursor-pointer text-lg leading-none p-0 hover:text-slate-300"
            >
              ✕
            </button>
          </div>

          {/* Status selector */}
          <div>
            <div className={panelLabelClass}>Status</div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => {
                const isSelected = panel.status === s;
                return (
                  <button
                    key={s}
                    disabled={run.status === "done"}
                    onClick={() => handleStatusChange(panel.id, s)}
                    className={cn(
                      "px-3 py-1 rounded text-xs font-semibold border transition-all",
                      run.status === "done" ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                      isSelected
                        ? cn(STATUS_BG_ACTIVE[s] ?? "bg-slate-800", STATUS_TEXT[s] ?? "text-slate-400", STATUS_BORDER_ACTIVE[s] ?? "border-slate-700")
                        : "bg-card text-slate-500 border-slate-800 hover:border-slate-600",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          {panel.testCase.tags && (
            <div>
              <div className={panelLabelClass}>Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {panel.testCase.tags.split(",").map((tag, i) => (
                  <span key={i} className="px-2 py-px rounded-full text-[11px] bg-card text-slate-400 border border-border">
                    {tag.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Preconditions */}
          {panel.testCase.preconditions && (
            <div>
              <div className={panelLabelClass}>Preconditions</div>
              <div className="text-[13px] text-amber-400 leading-relaxed whitespace-pre-wrap bg-amber-950/20 border border-amber-900 rounded px-2.5 py-2">
                {panel.testCase.preconditions}
              </div>
            </div>
          )}

          {/* Description */}
          {panel.testCase.description && (
            <div>
              <div className={panelLabelClass}>Description</div>
              <div className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{panel.testCase.description}</div>
            </div>
          )}

          {/* Steps */}
          {panel.testCase.steps && (
            <div>
              <div className={panelLabelClass}>Steps</div>
              {(() => {
                let steps: string[] = [];
                try {
                  const parsed = JSON.parse(panel.testCase.steps!);
                  steps = Array.isArray(parsed) ? parsed : [String(parsed)];
                } catch {
                  steps = panel.testCase.steps!.split("\n").filter(Boolean);
                }
                return (
                  <ol className="m-0 pl-5">
                    {steps.map((step, i) => (
                      <li key={i} className="text-[13px] text-muted-foreground mb-2 leading-relaxed">{step}</li>
                    ))}
                  </ol>
                );
              })()}
            </div>
          )}

          {/* Expected Result */}
          {panel.testCase.expectedResult && (
            <div>
              <div className={panelLabelClass}>Expected Result</div>
              <div className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{panel.testCase.expectedResult}</div>
            </div>
          )}

          {/* Automation ID */}
          {panel.testCase.automationId && (
            <div>
              <div className={panelLabelClass}>Automation ID</div>
              <div className="text-xs text-blue-400 font-mono bg-blue-950/30 border border-blue-900 rounded px-2.5 py-1.5">
                {panel.testCase.automationId}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div className={panelLabelClass}>Actual Result / Notes</div>
            <textarea
              key={panel.id}
              defaultValue={panel.notes ?? ""}
              disabled={run.status === "done"}
              onBlur={(e) => handleNotesChange(panel.id, e.target.value)}
              placeholder="Actual result / notes…"
              rows={3}
              className="w-full bg-card text-foreground border border-border rounded px-2.5 py-2 text-[13px] resize-y box-border font-inherit focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
            />
          </div>

          {/* Screenshot */}
          <div>
            <div className={panelLabelClass}>Screenshot</div>
            {panel.screenshotUrl ? (
              <div>
                <img
                  src={panel.screenshotUrl}
                  alt="Screenshot"
                  className="w-full rounded border border-slate-800 mb-2"
                />
                {run.status !== "done" && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-400 bg-transparent border-none cursor-pointer p-0"
                  >
                    Replace screenshot
                  </button>
                )}
              </div>
            ) : run.status !== "done" ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleScreenshotUpload(file);
                }}
                className="border-2 border-dashed border-slate-800 rounded-md py-6 px-4 text-center text-slate-500 text-[13px] cursor-pointer hover:border-slate-600 transition-colors"
              >
                {uploading ? "Uploading…" : "Click or drag & drop an image"}
              </div>
            ) : (
              <div className="text-[13px] text-slate-500">No screenshot</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleScreenshotUpload(file);
                e.target.value = "";
              }}
            />
            {uploadError && (
              <div className="mt-1.5 text-xs text-red-400">{uploadError}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const thClass = "px-3 py-2 font-medium";
const tdClass = "px-3 py-2.5";
const panelLabelClass = "text-[11px] text-slate-500 uppercase tracking-[0.08em] mb-1.5";
const completeBtnClass = "px-4 py-2 bg-primary text-primary-foreground border-none rounded text-sm cursor-pointer hover:bg-primary/90 transition-colors";
const rerunBtnClass = "px-4 py-2 bg-transparent text-amber-400 border border-amber-900 rounded text-sm cursor-pointer font-semibold hover:bg-amber-950/30 transition-colors";
