"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSuites, getActiveProjectId, type TestSuite, type TestCase } from "../../lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const PROGRESS_MESSAGES = [
  "Uploading document...",
  "Reading requirements...",
  "Generating test cases...",
];

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

function GenerateBrdPageInner() {
  const { loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramSuiteId = searchParams.get("suiteId") ?? "";

  const [suites, setSuites]         = useState<TestSuite[]>([]);
  const [file, setFile]             = useState<File | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const [suiteId, setSuiteId]       = useState(paramSuiteId);
  const [maxCases, setMaxCases]     = useState(20);
  const [loading, setLoading]       = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [error, setError]           = useState("");
  const [result, setResult]         = useState<{ generated: number; cases: TestCase[]; mode?: string; modules?: { module: string; suiteId: string; count: number }[] } | null>(null);
  const [useModules, setUseModules] = useState(true);
  const [moduleResults, setModuleResults] = useState<{ module: string; suiteId: string; count: number }[]>([]);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropZoneRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSuites().then(setSuites).catch(() => {});
  }, []);

  // Pre-select suite from URL param once suites load
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
      setProgressIdx((i) => (i + 1) % PROGRESS_MESSAGES.length);
    }, 3000);
  }, []);

  useEffect(() => () => stopProgress(), [stopProgress]);

  function acceptFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "docx", "txt"].includes(ext)) {
      setError("Unsupported format. Please upload a PDF, Word (.docx), or plain text (.txt) file.");
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

  async function handleGenerate() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    setModuleResults([]);
    startProgress();

    try {
      const form = new FormData();
      form.append("file", file);
      if (suiteId) form.append("suiteId", suiteId);
      form.append("maxCases", String(maxCases));
      form.append("useModules", useModules ? "true" : "false");
      const projectId = getActiveProjectId();
      if (projectId) form.append("projectId", projectId);

      const token = getStoredToken();
      const res = await fetch(`${BASE_URL}/ai/generate-from-brd`, {
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
      if (data.mode === "modules" && data.modules) {
        setModuleResults(data.modules);
      }
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
    setResult(null);
    setError("");
    setSuiteId(paramSuiteId);
    setMaxCases(20);
  }

  const progressLabel = PROGRESS_MESSAGES[progressIdx];
  if (authLoading) return null;

  return (
    <main style={{ padding: 32, minHeight: "100vh" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <h1 style={{ margin: "0 0 6px", fontSize: 24 }}>Generate from BRD</h1>
        <p style={{ margin: "0 0 32px", color: "#666", fontSize: 14 }}>
          Upload a requirements document and AI will generate test cases automatically.
        </p>

        {/* Upload zone */}
        <div
          ref={dropZoneRef}
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
            accept=".pdf,.docx,.txt"
            onChange={onFileInput}
            style={{ display: "none" }}
          />

          {file ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>
                {file.name.endsWith(".pdf") ? "📄" : file.name.endsWith(".docx") ? "📝" : "📃"}
              </span>
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
              <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
              <div style={{ color: "#ccc", marginBottom: 6, fontSize: 15 }}>
                Drag & drop a file here, or <span style={{ color: "#0070f3" }}>click to browse</span>
              </div>
              <div style={{ color: "#555", fontSize: 12 }}>
                Supported formats: PDF, Word (.docx), plain text
              </div>
            </>
          )}
        </div>

        {/* Options row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <label style={{ flex: 1, fontSize: 13 }}>
            <div style={{ color: "#888", marginBottom: 4 }}>Assign to Suite</div>
            <select
              value={suiteId}
              onChange={(e) => setSuiteId(e.target.value)}
              style={selectStyle}
            >
              <option value="">No suite</option>
              {suites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label style={{ width: 140, fontSize: 13 }}>
            <div style={{ color: "#888", marginBottom: 4 }}>Max cases (5–50)</div>
            <input
              type="number"
              min={5}
              max={200}
              value={maxCases}
              onChange={(e) => setMaxCases(Math.min(200, Math.max(5, parseInt(e.target.value, 10) || 20)))}
              style={inputStyle}
            />
          </label>
        </div>

        {/* Module-based toggle */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          padding: "12px 16px",
          background: "#0a1628",
          border: "1px solid #1e3a5f",
          borderRadius: 8,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#93c5fd", fontWeight: 600, marginBottom: 2 }}>
              🧩 Generate by Modules
            </div>
            <div style={{ fontSize: 12, color: "#555" }}>
              AI identifies modules in your BRD and creates a suite + test cases for each one automatically
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUseModules(!useModules)}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: "none",
              background: useModules ? "#0070f3" : "#333",
              cursor: "pointer",
              position: "relative",
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute",
              top: 2,
              left: useModules ? 22 : 2,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
              display: "block",
            }} />
          </button>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!file || loading}
          style={{
            ...btnStyle,
            opacity: !file || loading ? 0.5 : 1,
            cursor: !file || loading ? "not-allowed" : "pointer",
            width: "100%",
            marginBottom: 16,
          }}
        >
          {loading ? progressLabel : "Generate Test Cases"}
        </button>

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
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 6,
              background: "#0d2d0d",
              border: "1px solid #1a5c1a",
            }}>
              <span style={{ color: "#4caf50", fontSize: 20 }}>✓</span>
              <span style={{ color: "#4caf50", fontWeight: 600 }}>
                {result.generated} test case{result.generated !== 1 ? "s" : ""} generated
                {suiteId && suites.find((s) => s.id === suiteId)
                  ? ` and added to "${suites.find((s) => s.id === suiteId)!.name}"`
                  : ""}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
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
                  Generate more
                </button>
              </div>
            </div>

            {/* Module breakdown */}
            {moduleResults.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Modules Generated
                </div>
                {moduleResults.map((m, i) => (
                  <div key={i} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#0a1628",
                    border: "1px solid #1e3a5f",
                    borderRadius: 6,
                    marginBottom: 6,
                  }}>
                    <div style={{ fontSize: 13, color: "#93c5fd" }}>📁 {m.module}</div>
                    <span style={{
                      fontSize: 12,
                      background: "#0070f3",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "2px 8px",
                      fontWeight: 600,
                    }}>
                      {m.count} cases
                    </span>
                  </div>
                ))}
              </div>
            )}

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
                    <Badge
                      label={tc.category}
                      color={CATEGORY_COLORS[tc.category] ?? "#6b7280"}
                    />
                    <Badge
                      label={tc.severity}
                      color={SEVERITY_COLORS[tc.severity] ?? "#6b7280"}
                    />
                    <Badge
                      label={tc.priority}
                      color="#6b7280"
                    />
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

export default function GenerateBrdPage() {
  return (
    <ProtectedRoute>
      <Suspense>
        <GenerateBrdPageInner />
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

const selectStyle: React.CSSProperties = { ...baseInput };
const inputStyle: React.CSSProperties  = { ...baseInput };

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
