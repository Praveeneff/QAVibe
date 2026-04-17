"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSuites, getActiveProjectId, type TestSuite, type TestCase } from "../../lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Progress messages cycle every 3s while waiting ───────────────────────────

const PROGRESS_MESSAGES_ZIP = [
  "Uploading archive...",
  "Extracting source files...",
  "Analyzing code structure...",
  "Generating test cases...",
];

const PROGRESS_MESSAGES_GH = [
  "Fetching repository tree...",
  "Reading source files...",
  "Analyzing code structure...",
  "Generating test cases...",
];

// ── Badge helpers (match BRD page exactly) ────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#f59e0b",
  low:      "#22c55e",
};

const CATEGORY_COLORS: Record<string, string> = {
  smoke:      "#a855f7",
  sanity:     "#3b82f6",
  regression: "#f59e0b",
  functional: "#22c55e",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      background: color + "22",
      color,
      border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type InputMode = "github" | "zip";

// ── Page ──────────────────────────────────────────────────────────────────────

function GenerateCodebasePageInner() {
  const { loading: authLoading } = useRequireAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const paramSuiteId = searchParams.get("suiteId") ?? "";

  const [mode, setMode]           = useState<InputMode>("github");
  const [repoUrl, setRepoUrl]     = useState("");
  const [file, setFile]           = useState<File | null>(null);
  const [dragOver, setDragOver]   = useState(false);
  const [suites, setSuites]       = useState<TestSuite[]>([]);
  const [suiteId, setSuiteId]     = useState(paramSuiteId);
  const [maxCases, setMaxCases]   = useState(30);
  const [focus, setFocus]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [error, setError]         = useState("");
  const [result, setResult]       = useState<{ generated: number; source: string; cases: TestCase[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getSuites().then(setSuites).catch(() => {});
  }, []);

  useEffect(() => {
    if (paramSuiteId && suites.some((s) => s.id === paramSuiteId)) {
      setSuiteId(paramSuiteId);
    }
  }, [paramSuiteId, suites]);

  const stopProgress = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startProgress = useCallback(() => {
    setProgressIdx(0);
    intervalRef.current = setInterval(() => {
      setProgressIdx((i) => (i + 1) % (mode === "github" ? PROGRESS_MESSAGES_GH : PROGRESS_MESSAGES_ZIP).length);
    }, 3000);
  }, [mode]);

  useEffect(() => () => stopProgress(), [stopProgress]);

  function acceptFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "zip") {
      setError("Only .zip archives are supported for codebase upload.");
      return;
    }
    setError("");
    setResult(null);
    setFile(f);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) acceptFile(e.target.files[0]);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
  }

  function switchMode(m: InputMode) {
    setMode(m);
    setError("");
    setResult(null);
    setFile(null);
    setRepoUrl("");
  }

  function isReady(): boolean {
    if (loading) return false;
    if (mode === "github") return repoUrl.trim().startsWith("https://github.com");
    return !!file;
  }

  async function handleGenerate() {
    if (!isReady()) return;
    setLoading(true);
    setError("");
    setResult(null);
    startProgress();

    try {
      const form = new FormData();
      if (mode === "zip" && file) form.append("file", file);
      if (mode === "github")     form.append("repoUrl", repoUrl.trim());
      if (suiteId)               form.append("suiteId", suiteId);
      if (focus.trim())          form.append("focus", focus.trim());
      form.append("maxCases", String(maxCases));
      const projectId = getActiveProjectId();
      if (projectId) form.append("projectId", projectId);

      const token = getStoredToken();
      const res = await fetch(`${BASE_URL}/ai/generate-from-codebase`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 503) {
          throw new Error("AI providers are busy right now — please wait a moment and try again.");
        }
        throw new Error(body?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error. Please try again.");
    } finally {
      stopProgress();
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setRepoUrl("");
    setResult(null);
    setError("");
    setSuiteId(paramSuiteId);
    setMaxCases(30);
    setFocus("");
  }

  const messages     = mode === "github" ? PROGRESS_MESSAGES_GH : PROGRESS_MESSAGES_ZIP;
  const progressLabel = messages[progressIdx];

  const selectedSuiteName = suites.find((s) => s.id === suiteId)?.name ?? null;
  if (authLoading) return null;

  return (
    <main style={{ padding: 32, minHeight: "100vh" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <h1 style={{ margin: "0 0 6px", fontSize: 24 }}>Generate from Codebase</h1>
        <p style={{ margin: "0 0 28px", color: "#666", fontSize: 14 }}>
          Point AI at a GitHub repo or upload a zip — it will read the source code and
          generate test cases for every function, endpoint, and flow it finds.
        </p>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "1px solid #333", borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
          {(["github", "zip"] as InputMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              style={{
                padding: "8px 22px",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: mode === m ? "#0070f3" : "#1a1a1a",
                color:      mode === m ? "#fff" : "#888",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {m === "github" ? "GitHub URL" : "Upload ZIP"}
            </button>
          ))}
        </div>

        {/* Input area */}
        {mode === "github" ? (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, color: "#888", marginBottom: 6 }}>
              GitHub Repository URL
            </label>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => { setRepoUrl(e.target.value); setError(""); setResult(null); }}
              placeholder="https://github.com/owner/repo"
              style={{ ...inputStyle, fontSize: 14 }}
              onKeyDown={(e) => e.key === "Enter" && isReady() && handleGenerate()}
            />
            <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
              Public repos only. Branches supported: https://github.com/owner/repo/tree/branch
            </div>
          </div>
        ) : (
          <div
            onClick={() => !file && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${dragOver ? "#0070f3" : file ? "#22c55e" : "#333"}`,
              borderRadius: 10,
              padding: "36px 24px",
              textAlign: "center",
              cursor: file ? "default" : "pointer",
              transition: "border-color 0.15s",
              background: dragOver ? "#0070f308" : "#161616",
              marginBottom: 20,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={onFileInput}
              style={{ display: "none" }}
            />
            {file ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <span style={{ fontSize: 28 }}>🗜️</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, color: "#eee" }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{formatBytes(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
                  style={{
                    marginLeft: 8,
                    background: "none",
                    border: "1px solid #444",
                    borderRadius: 4,
                    color: "#aaa",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    padding: "2px 7px",
                  }}
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🗜️</div>
                <div style={{ color: "#ccc", marginBottom: 6, fontSize: 15 }}>
                  Drag & drop a <strong>.zip</strong> here, or{" "}
                  <span style={{ color: "#0070f3" }}>click to browse</span>
                </div>
                <div style={{ color: "#555", fontSize: 12 }}>
                  Max 50 MB · Supports .ts .tsx .js .jsx .py .java .cs .go .rb .php inside the zip
                </div>
              </>
            )}
          </div>
        )}

        {/* Options */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ flex: 2, minWidth: 180, fontSize: 13 }}>
            <div style={{ color: "#888", marginBottom: 4 }}>Assign to Suite</div>
            <select value={suiteId} onChange={(e) => setSuiteId(e.target.value)} style={selectStyle}>
              <option value="">No suite</option>
              {suites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label style={{ width: 140, fontSize: 13 }}>
            <div style={{ color: "#888", marginBottom: 4 }}>Max cases (1–50)</div>
            <input
              type="number"
              min={1}
              max={200}
              value={maxCases}
              onChange={(e) => setMaxCases(Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 30)))}
              style={inputStyle}
            />
          </label>

          <label style={{ flex: 2, minWidth: 180, fontSize: 13 }}>
            <div style={{ color: "#888", marginBottom: 4 }}>Focus area <span style={{ color: "#444" }}>(optional)</span></div>
            <input
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. authentication, payment flow"
              style={inputStyle}
            />
          </label>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!isReady()}
          style={{
            ...btnStyle,
            opacity: !isReady() ? 0.5 : 1,
            cursor: !isReady() ? "not-allowed" : "pointer",
            width: "100%",
            marginBottom: 16,
          }}
        >
          {loading ? progressLabel : "Generate Test Cases"}
        </button>

        {/* URL hint when invalid */}
        {mode === "github" && repoUrl && !repoUrl.startsWith("https://github.com") && (
          <div style={{ fontSize: 12, color: "#f59e0b", marginTop: -8, marginBottom: 12 }}>
            URL must start with https://github.com
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: "12px 16px",
            borderRadius: 6,
            background: "#2d1010",
            border: "1px solid #7a2020",
            color: "#ff8a80",
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ marginTop: 8 }}>
            {/* Success banner */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 6,
              background: "#0d2d0d",
              border: "1px solid #1a5c1a",
              flexWrap: "wrap",
            }}>
              <span style={{ color: "#4caf50", fontSize: 20, flexShrink: 0 }}>✓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#4caf50", fontWeight: 600 }}>
                  {result.generated} test case{result.generated !== 1 ? "s" : ""} generated
                  {selectedSuiteName ? ` and added to "${selectedSuiteName}"` : ""}
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Source: {result.source}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {suiteId && (
                  <button
                    type="button"
                    onClick={() => router.push(`/test-cases?suiteId=${suiteId}`)}
                    style={{ ...btnStyle, fontSize: 13, padding: "6px 14px" }}
                  >
                    View in suite
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  style={{ ...btnStyle, fontSize: 13, padding: "6px 14px", background: "#2a2a2a" }}
                >
                  Analyze another
                </button>
              </div>
            </div>

            {/* Case cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {result.cases.map((tc) => (
                <div
                  key={tc.id}
                  style={{
                    background: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    borderRadius: 6,
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ fontWeight: 500, color: "#eee", marginBottom: 8, fontSize: 14 }}>
                    {tc.title}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge label={tc.category} color={CATEGORY_COLORS[tc.category] ?? "#6b7280"} />
                    <Badge label={tc.severity}  color={SEVERITY_COLORS[tc.severity]  ?? "#6b7280"} />
                    <Badge label={tc.priority}  color="#6b7280" />
                    <Badge label={tc.executionType} color="#4b5563" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

import ProtectedRoute from "@/components/ProtectedRoute";

export default function GenerateCodebasePage() {
  return (
    <ProtectedRoute>
      <Suspense>
        <GenerateCodebasePageInner />
      </Suspense>
    </ProtectedRoute>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const baseInput: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "7px 10px",
  fontSize: 14,
  boxSizing: "border-box",
  background: "#1a1a1a",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
};

const inputStyle:  React.CSSProperties = { ...baseInput };
const selectStyle: React.CSSProperties = { ...baseInput };

const btnStyle: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  background: "#0070f3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
