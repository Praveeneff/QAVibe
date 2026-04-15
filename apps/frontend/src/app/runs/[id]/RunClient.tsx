"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateTestResult, completeTestRun, uploadScreenshot, type TestRun, type TestResult } from "@/lib/api";
import { getStoredToken } from "@/context/AuthContext";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const STATUSES = ["pending", "pass", "fail", "blocked", "skip"] as const;

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  critical: { bg: "#3d0a0a", fg: "#f44336" },
  high:     { bg: "#3d2a0a", fg: "#ff9800" },
  medium:   { bg: "#0a1f3d", fg: "#64b5f6" },
  low:      { bg: "#222",    fg: "#888" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const { bg, fg } = SEVERITY_COLORS[severity] ?? { bg: "#222", fg: "#888" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: bg, color: fg, fontWeight: 600 }}>
      {severity}
    </span>
  );
}

const ENV_COLORS: Record<string, { bg: string; fg: string }> = {
  staging:    { bg: "#1a2a3d", fg: "#64b5f6" },
  production: { bg: "#3d1a0a", fg: "#ff7043" },
  dev:        { bg: "#2a1a3d", fg: "#ab47bc" },
  qa:         { bg: "#0a3d2a", fg: "#26a69a" },
};

function EnvPill({ label, color }: { label: string; color: { bg: string; fg: string } }) {
  return (
    <span style={{
      padding: "3px 10px",
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 600,
      background: color.bg,
      color: color.fg,
      letterSpacing: "0.03em",
    }}>
      {label}
    </span>
  );
}

function MetaPill({ label, icon, mono }: { label: string; icon: string; mono?: boolean }) {
  return (
    <span style={{
      padding: "3px 10px",
      borderRadius: 4,
      fontSize: 12,
      background: "#1e1e1e",
      color: "#aaa",
      fontFamily: mono ? "monospace" : undefined,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
    }}>
      <span style={{ fontSize: 11 }}>{icon}</span>
      {label}
    </span>
  );
}

const statusColor: Record<string, string> = {
  pass:    "#4caf50",
  fail:    "#f44336",
  blocked: "#ff9800",
  skip:    "#888",
  pending: "#555",
};

const statusBg: Record<string, string> = {
  pass:    "#0a2e0a",
  fail:    "#2e0a0a",
  blocked: "#2e1a00",
  skip:    "#1a1a1a",
  pending: "#111",
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
    const updated = await updateTestResult(run.id, resultId, status);
    setRun((prev) => ({
      ...prev,
      results: prev.results.map((r) => (r.id === resultId ? { ...r, status: updated.status } : r)),
    }));
    setActiveResult((prev) => prev?.id === resultId ? { ...prev, status: updated.status } : prev);
  }

  async function handleNotesChange(resultId: string, notes: string) {
    const current = run.results.find((r) => r.id === resultId);
    const updated = await updateTestResult(run.id, resultId, current?.status ?? "pending", notes);
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
    await completeTestRun(run.id);
    setRun((prev) => ({ ...prev, status: "done" }));
    setCompleting(false);
  }

  const counts = summary(run);
  const failedCount = (counts.fail ?? 0) + (counts.blocked ?? 0);
  const canRerun = run.status === "done" && failedCount > 0;
  if (loading) return null;

  const panel = activeResult;

  return (
    <div style={{ display: "flex", gap: 0, alignItems: "flex-start", minHeight: "100vh" }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, paddingRight: panel ? 16 : 0 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => router.push("/test-cases")}
            style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", fontSize: 14, padding: 0, marginBottom: 12 }}
          >
            ← Back to Test Cases
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ margin: 0 }}>{run.name}</h1>
              <span style={{ fontSize: 13, color: "#888" }}>
                Status: <span style={{ color: run.status === "done" ? "#4caf50" : "#ffd966" }}>{run.status}</span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {canRerun && (
                <button onClick={handleRerun} disabled={rerunning} style={rerunBtnStyle}>
                  {rerunning ? "Creating rerun…" : `↺ Rerun Failed (${failedCount})`}
                </button>
              )}
              {run.status !== "done" && (
                <button onClick={handleComplete} disabled={completing} style={completeBtnStyle}>
                  {completing ? "Completing…" : "✓ Complete Run"}
                </button>
              )}
            </div>
          </div>

          {rerunError && (
            <div style={{
              marginTop: 10,
              padding: "8px 14px",
              background: "#2d1414",
              border: "1px solid #5c2020",
              borderRadius: 6,
              color: "#f87171",
              fontSize: 13,
            }}>
              {rerunError}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <EnvPill label={run.environment} color={ENV_COLORS[run.environment] ?? { bg: "#222", fg: "#aaa" }} />
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
            <div style={{ marginBottom: 20 }}>
              <div style={{ height: 8, background: "#1e1e1e", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                <div style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: failed > 0 ? "#ef4444" : "#22c55e",
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ color: "#888" }}>{pct}% complete</span>
                <span style={{ color: "#22c55e" }}>✓ {passed} passed</span>
                <span style={{ color: "#ef4444" }}>✗ {failed} failed</span>
                <span style={{ color: "#888" }}>{total - done} remaining</span>
              </div>
            </div>
          );
        })()}

        {run.status !== "done" && (
          <p style={{ color: "#444", fontSize: 12, marginBottom: 16, fontStyle: "italic" }}>
            💡 Click a row to open the detail panel. Use the status dropdown to mark results.
          </p>
        )}

        {/* Results table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #333", textAlign: "left", color: "#aaa" }}>
              <th style={th}>Test Case</th>
              <th style={th}>Severity</th>
              <th style={th}>Status</th>
              <th style={th}>📎</th>
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
                return (
                  <tr
                    key={result.id}
                    onClick={() => setActiveResult(isActive ? null : result)}
                    style={{
                      borderBottom: "1px solid #222",
                      borderLeft: `3px solid ${statusColor[result.status] ?? "#555"}`,
                      background: isActive ? "#181f28" : "transparent",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                  >
                    <td style={td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{
                          color: "#60a5fa",
                          fontSize: 13,
                          cursor: "pointer",
                          textDecoration: "underline",
                          textDecorationColor: "#1e3a5f",
                          textUnderlineOffset: 3,
                        }}>
                          {result.testCase.title}
                        </span>
                        <span style={{ fontSize: 11, color: "#444", fontStyle: "italic" }}>
                          click to open details →
                        </span>
                      </div>
                    </td>
                    <td style={td}><SeverityBadge severity={result.testCase.severity} /></td>
                    <td style={td}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: statusBg[result.status] ?? "#111",
                        color: statusColor[result.status] ?? "#888",
                        border: `1px solid ${statusColor[result.status] ?? "#333"}`,
                      }}>
                        {result.status}
                      </span>
                    </td>
                    <td style={td}>
                      {result.screenshotUrl && (
                        <span title="Has screenshot" style={{
                          fontSize: 11,
                          color: "#64b5f6",
                          background: "#0d1f33",
                          border: "1px solid #1e3a5f",
                          borderRadius: 4,
                          padding: "2px 6px",
                          fontWeight: 600,
                        }}>
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
        <div style={{
          width: 380,
          flexShrink: 0,
          position: "sticky",
          top: 24,
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "#111",
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>
          {/* Panel header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {panel.testCase.tcId && (
                  <span style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#64b5f6",
                    background: "#0d1f33",
                    border: "1px solid #1e3a5f",
                    borderRadius: 3,
                    padding: "1px 6px",
                    alignSelf: "flex-start",
                  }}>
                    {panel.testCase.tcId}
                  </span>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#eee", lineHeight: 1.4 }}>
                  {panel.testCase.title}
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <SeverityBadge severity={panel.testCase.severity} />
              </div>
            </div>
            <button
              onClick={() => setActiveResult(null)}
              style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}
            >
              ✕
            </button>
          </div>

          {/* Status selector */}
          <div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Status</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={run.status === "done"}
                  onClick={() => handleStatusChange(panel.id, s)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: run.status === "done" ? "not-allowed" : "pointer",
                    background: panel.status === s ? (statusBg[s] ?? "#1a1a1a") : "#1a1a1a",
                    color: panel.status === s ? (statusColor[s] ?? "#888") : "#555",
                    border: panel.status === s ? `1px solid ${statusColor[s] ?? "#333"}` : "1px solid #2a2a2a",
                    transition: "all 0.15s",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {panel.testCase.tags && (
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Tags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {panel.testCase.tags.split(",").map((tag, i) => (
                  <span key={i} style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 11,
                    background: "#1e1e1e",
                    color: "#888",
                    border: "1px solid #333",
                  }}>
                    {tag.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Preconditions */}
          {panel.testCase.preconditions && (
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Preconditions</div>
              <div style={{
                fontSize: 13,
                color: "#f59e0b",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                background: "#2a1f00",
                border: "1px solid #3d2f00",
                borderRadius: 4,
                padding: "8px 10px",
              }}>
                {panel.testCase.preconditions}
              </div>
            </div>
          )}

          {/* Description */}
          {panel.testCase.description && (
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Description</div>
              <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{panel.testCase.description}</div>
            </div>
          )}

          {/* Steps */}
          {panel.testCase.steps && (
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Steps</div>
              {(() => {
                let steps: string[] = [];
                try {
                  const parsed = JSON.parse(panel.testCase.steps!);
                  steps = Array.isArray(parsed)
                    ? parsed
                    : [String(parsed)];
                } catch {
                  steps = panel.testCase.steps!
                    .split("\n")
                    .filter(Boolean);
                }
                return (
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    {steps.map((step, i) => (
                      <li key={i} style={{
                        fontSize: 13,
                        color: "#ccc",
                        marginBottom: 8,
                        lineHeight: 1.6,
                      }}>
                        {step}
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </div>
          )}

          {/* Expected Result */}
          {panel.testCase.expectedResult && (
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Expected Result</div>
              <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{panel.testCase.expectedResult}</div>
            </div>
          )}

          {/* Automation ID */}
          {panel.testCase.automationId && (
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Automation ID</div>
              <div style={{
                fontSize: 12,
                color: "#64b5f6",
                fontFamily: "monospace",
                background: "#0d1f33",
                border: "1px solid #1e3a5f",
                borderRadius: 4,
                padding: "6px 10px",
              }}>
                {panel.testCase.automationId}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Actual Result / Notes</div>
            <textarea
              key={panel.id}
              defaultValue={panel.notes ?? ""}
              disabled={run.status === "done"}
              onBlur={(e) => handleNotesChange(panel.id, e.target.value)}
              placeholder="Actual result / notes…"
              rows={3}
              style={{
                width: "100%",
                background: "#1a1a1a",
                color: "#eee",
                border: "1px solid #333",
                borderRadius: 4,
                padding: "8px 10px",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Screenshot */}
          <div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Screenshot</div>
            {panel.screenshotUrl ? (
              <div>
                <img
                  src={panel.screenshotUrl}
                  alt="Screenshot"
                  style={{ width: "100%", borderRadius: 4, border: "1px solid #2a2a2a", marginBottom: 8 }}
                />
                {run.status !== "done" && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{ fontSize: 12, color: "#64b5f6", background: "none", border: "none", cursor: "pointer", padding: 0 }}
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
                style={{
                  border: "2px dashed #2a2a2a",
                  borderRadius: 6,
                  padding: "24px 16px",
                  textAlign: "center",
                  color: "#555",
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                {uploading ? "Uploading…" : "Click or drag & drop an image"}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#555" }}>No screenshot</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleScreenshotUpload(file);
                e.target.value = "";
              }}
            />
            {uploadError && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#f87171" }}>{uploadError}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px 12px" };
const completeBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  background: "#0070f3",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontSize: 14,
  cursor: "pointer",
};

const rerunBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  background: "#1a1a1a",
  color: "#f59e0b",
  border: "1px solid #78350f",
  borderRadius: 4,
  fontSize: 14,
  cursor: "pointer",
  fontWeight: 600,
};
