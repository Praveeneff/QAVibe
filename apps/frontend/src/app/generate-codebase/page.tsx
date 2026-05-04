"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { getSuites, getActiveProjectId, handle401Redirect, type TestSuite, type TestCase } from "../../lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getStoredToken } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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

// Badge uses dynamic hex transparency — must stay inline
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

function GenerateCodebasePageInner() {
  const { loading: authLoading } = useRequireAuth();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const paramSuiteId = searchParams.get("suiteId") ?? "";

  const [mode, setMode]               = useState<InputMode>("github");
  const [repoUrl, setRepoUrl]         = useState("");
  const [file, setFile]               = useState<File | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [suites, setSuites]           = useState<TestSuite[]>([]);
  const [suiteId, setSuiteId]         = useState(paramSuiteId);
  const [maxCases, setMaxCases]       = useState(30);
  const [focus, setFocus]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [error, setError]             = useState("");
  const [result, setResult]           = useState<{ generated: number; source: string; cases: TestCase[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { getSuites(getActiveProjectId() ?? undefined).then(setSuites).catch(() => {}); }, []);

  useEffect(() => {
    if (paramSuiteId && suites.some((s) => s.id === paramSuiteId)) setSuiteId(paramSuiteId);
  }, [paramSuiteId, suites]);

  const stopProgress = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
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
    if (ext !== "zip") { setError("Only .zip archives are supported for codebase upload."); return; }
    setError(""); setResult(null); setFile(f);
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) acceptFile(e.target.files[0]);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
  }

  function switchMode(m: InputMode) {
    setMode(m); setError(""); setResult(null); setFile(null); setRepoUrl("");
  }

  function isReady(): boolean {
    if (loading) return false;
    if (mode === "github") return repoUrl.trim().startsWith("https://github.com");
    return !!file;
  }

  async function handleGenerate() {
    if (!isReady()) return;
    setLoading(true); setError(""); setResult(null); startProgress();
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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      if (!res.ok) {
        if (res.status === 401) { handle401Redirect(); return; }
        const body = await res.json().catch(() => ({}));
        if (res.status === 503) throw new Error("AI providers are busy right now — please wait a moment and try again.");
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error. Please try again.");
    } finally {
      stopProgress(); setLoading(false);
    }
  }

  function handleReset() {
    setFile(null); setRepoUrl(""); setResult(null); setError("");
    setSuiteId(paramSuiteId); setMaxCases(30); setFocus("");
  }

  const messages      = mode === "github" ? PROGRESS_MESSAGES_GH : PROGRESS_MESSAGES_ZIP;
  const progressLabel = messages[progressIdx];
  const selectedSuiteName = suites.find((s) => s.id === suiteId)?.name ?? null;
  if (authLoading) return null;

  return (
    <main className="px-8 py-8 min-h-screen">
      <div className="max-w-[680px] mx-auto">

        <h1 className="m-0 mb-1.5 text-2xl font-bold text-foreground">Generate from Codebase</h1>
        <p className="mt-0 mb-7 text-slate-500 text-sm">
          Point AI at a GitHub repo or upload a zip — it will read the source code and
          generate test cases for every function, endpoint, and flow it finds.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-0 mb-5 border border-slate-700 rounded overflow-hidden w-fit">
          {(["github", "zip"] as InputMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                "px-[22px] py-2 text-[13px] font-semibold border-none cursor-pointer transition-colors",
                mode === m ? "bg-primary text-white" : "bg-card text-slate-400 hover:text-slate-200",
              )}
            >
              {m === "github" ? "GitHub URL" : "Upload ZIP"}
            </button>
          ))}
        </div>

        {/* Input area */}
        {mode === "github" ? (
          <div className="mb-5">
            <label className="block text-[13px] text-slate-400 mb-1.5">GitHub Repository URL</label>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => { setRepoUrl(e.target.value); setError(""); setResult(null); }}
              placeholder="https://github.com/owner/repo"
              className={inputClass}
              onKeyDown={(e) => e.key === "Enter" && isReady() && handleGenerate()}
            />
            <div className="text-[11px] text-slate-600 mt-1">
              Public repos only. Branches supported: https://github.com/owner/repo/tree/branch
            </div>
          </div>
        ) : (
          <div
            onClick={() => !file && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "rounded-lg py-9 px-6 text-center transition-colors mb-5",
              file ? "cursor-default" : "cursor-pointer",
              dragOver
                ? "border-2 border-dashed border-primary bg-primary/5"
                : file
                  ? "border-2 border-dashed border-emerald-600 bg-popover"
                  : "border-2 border-dashed border-slate-700 bg-popover hover:border-slate-500",
            )}
          >
            <input ref={fileInputRef} type="file" accept=".zip" onChange={onFileInput} className="hidden" />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <span className="text-[28px]">🗜️</span>
                <div className="text-left">
                  <div className="font-semibold text-foreground">{file.name}</div>
                  <div className="text-xs text-slate-400">{formatBytes(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }}
                  className="ml-2 bg-transparent border border-slate-600 rounded text-muted-foreground cursor-pointer text-base leading-none px-1.5 py-px hover:border-slate-400"
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            ) : (
              <>
                <div className="text-4xl mb-2.5">🗜️</div>
                <div className="text-muted-foreground mb-1.5 text-[15px]">
                  Drag & drop a <strong>.zip</strong> here, or{" "}
                  <span className="text-primary">click to browse</span>
                </div>
                <div className="text-slate-500 text-xs">
                  Max 50 MB · Supports .ts .tsx .js .jsx .py .java .cs .go .rb .php inside the zip
                </div>
              </>
            )}
          </div>
        )}

        {/* Options */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <label className="flex-[2] min-w-[180px] text-[13px]">
            <div className="text-slate-400 mb-1">Assign to Suite</div>
            <select value={suiteId} onChange={(e) => setSuiteId(e.target.value)} className={selectClass}>
              <option value="">No suite</option>
              {suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <label className="w-[140px] text-[13px]">
            <div className="text-slate-400 mb-1">Max cases (1–50)</div>
            <input
              type="number" min={1} max={200} value={maxCases}
              onChange={(e) => setMaxCases(Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 30)))}
              className={inputClass}
            />
          </label>

          <label className="flex-[2] min-w-[180px] text-[13px]">
            <div className="text-slate-400 mb-1">
              Focus area <span className="text-slate-700">(optional)</span>
            </div>
            <input
              type="text" value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. authentication, payment flow"
              className={inputClass}
            />
          </label>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!isReady()}
          className={cn(primaryBtnClass, "w-full mb-4", !isReady() && "opacity-50 cursor-not-allowed")}
        >
          {loading ? progressLabel : "Generate Test Cases"}
        </button>

        {mode === "github" && repoUrl && !repoUrl.startsWith("https://github.com") && (
          <div className="text-xs text-amber-500 -mt-2 mb-3">
            URL must start with https://github.com
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-md bg-destructive/10 border border-red-900 text-red-400 text-[13px] mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-2">
            <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-md bg-emerald-950/30 border border-emerald-800 flex-wrap">
              <span className="text-emerald-400 text-xl shrink-0">✓</span>
              <div className="flex-1 min-w-0">
                <div className="text-emerald-400 font-semibold">
                  {result.generated} test case{result.generated !== 1 ? "s" : ""} generated
                  {selectedSuiteName ? ` and added to "${selectedSuiteName}"` : ""}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
                  Source: {result.source}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {suiteId && (
                  <button type="button" onClick={() => router.push(`/test-cases?suiteId=${suiteId}`)} className={cn(primaryBtnClass, "text-[13px] px-3.5 py-1.5")}>
                    View in suite
                  </button>
                )}
                <button type="button" onClick={handleReset} className="bg-slate-800 text-foreground border-none rounded-md px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer hover:bg-slate-700">
                  Analyze another
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {result.cases.map((tc) => (
                <div key={tc.id} className="bg-card border border-slate-800 rounded-md px-4 py-3">
                  <div className="font-medium text-foreground mb-2 text-sm">{tc.title}</div>
                  <div className="flex gap-1.5 flex-wrap">
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

export default function GenerateCodebasePage() {
  return (
    <ProtectedRoute>
      <Suspense>
        <GenerateCodebasePageInner />
      </Suspense>
    </ProtectedRoute>
  );
}

const inputClass  = "block w-full px-2.5 py-[7px] text-sm bg-card text-foreground border border-slate-700 rounded focus:outline-none focus:border-primary transition-colors";
const selectClass = "block w-full px-2.5 py-[7px] text-sm bg-card text-foreground border border-slate-700 rounded focus:outline-none focus:border-primary transition-colors cursor-pointer";
const primaryBtnClass = "px-5 py-2.5 text-sm font-semibold bg-primary text-white border-none rounded-md cursor-pointer hover:bg-primary/90 transition-colors";
