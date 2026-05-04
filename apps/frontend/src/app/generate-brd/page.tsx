"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { getSuites, getActiveProjectId, handle401Redirect, type TestSuite, type TestCase } from "../../lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getStoredToken } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import ProtectedRoute from "@/components/ProtectedRoute";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const PROGRESS_MESSAGES = [
  "Uploading document...",
  "Reading requirements...",
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

function GenerateBrdPageInner() {
  const { loading: authLoading } = useRequireAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramSuiteId = searchParams.get("suiteId") ?? "";

  const [suites, setSuites]           = useState<TestSuite[]>([]);
  const [file, setFile]               = useState<File | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [suiteId, setSuiteId]         = useState(paramSuiteId);
  const [maxCases, setMaxCases]       = useState(50);
  const [loading, setLoading]         = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [error, setError]             = useState("");
  const [result, setResult]           = useState<{ generated: number; cases: TestCase[]; mode?: string; modules?: { module: string; suiteId: string; count: number }[] } | null>(null);
  const [useModules, setUseModules]   = useState(true);
  const [moduleResults, setModuleResults] = useState<{ module: string; suiteId: string; count: number }[]>([]);

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

  async function handleGenerate() {
    if (!file) return;
    setLoading(true); setError(""); setResult(null); setModuleResults([]); startProgress();
    toast({ title: "Processing BRD…" });
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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      if (!res.ok) {
        if (res.status === 401) { handle401Redirect(); return; }
        const body = await res.json().catch(() => ({}));
        if (res.status === 503) throw new Error("AI providers are busy right now — please wait a moment and try again.");
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.mode === "modules" && data.modules) setModuleResults(data.modules);
      setResult(data);
      toast({ title: `${data.generated} test case${data.generated !== 1 ? "s" : ""} generated` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error. Please try again.";
      setError(msg);
      toast({ variant: "destructive", title: "Generation failed", description: msg });
    } finally {
      stopProgress(); setLoading(false);
    }
  }

  function handleReset() {
    setFile(null); setResult(null); setError(""); setSuiteId(paramSuiteId); setMaxCases(50);
  }

  const progressLabel = PROGRESS_MESSAGES[progressIdx];
  if (authLoading) return null;

  return (
    <main className="px-8 py-8 min-h-screen">
      <div className="max-w-[680px] mx-auto">

        <h1 className="m-0 mb-1.5 text-2xl font-bold text-foreground">Generate from BRD</h1>
        <p className="mt-0 mb-8 text-slate-500 text-sm">
          Upload a requirements document and AI will generate test cases automatically.
        </p>

        {/* Upload zone */}
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
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={onFileInput} className="hidden" />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-[28px]">
                {file.name.endsWith(".pdf") ? "📄" : file.name.endsWith(".docx") ? "📝" : "📃"}
              </span>
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
              <div className="text-4xl mb-2.5">📂</div>
              <div className="text-muted-foreground mb-1.5 text-[15px]">
                Drag & drop a file here, or <span className="text-primary">click to browse</span>
              </div>
              <div className="text-slate-500 text-xs">
                Supported formats: PDF, Word (.docx), plain text
              </div>
            </>
          )}
        </div>

        {/* Options row */}
        <div className="flex gap-4 mb-5">
          <label className="flex-1 text-[13px]">
            <div className="text-slate-400 mb-1">Assign to Suite</div>
            <select value={suiteId} onChange={(e) => setSuiteId(e.target.value)} className={selectClass}>
              <option value="">No suite</option>
              {suites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="w-[140px] text-[13px]">
            <div className="text-slate-400 mb-1">Max cases (5–50)</div>
            <input
              type="number" min={5} max={200} value={maxCases}
              onChange={(e) => setMaxCases(Math.min(200, Math.max(5, parseInt(e.target.value, 10) || 20)))}
              className={inputClass}
            />
          </label>
        </div>

        {/* Module-based toggle */}
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-blue-950/20 border border-blue-900 rounded-lg">
          <div className="flex-1">
            <div className="text-[13px] text-blue-300 font-semibold mb-0.5">🧩 Generate by Modules</div>
            <div className="text-xs text-slate-500">
              AI identifies modules in your BRD and creates a suite + test cases for each one automatically
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUseModules(!useModules)}
            className={cn(
              "w-11 h-6 rounded-full border-none relative shrink-0 cursor-pointer transition-colors",
              useModules ? "bg-primary" : "bg-slate-700",
            )}
          >
            <span className={cn(
              "absolute top-[2px] w-5 h-5 rounded-full bg-white transition-[left]",
              useModules ? "left-[22px]" : "left-[2px]",
            )} />
          </button>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!file || loading}
          className={cn(primaryBtnClass, "w-full mb-4", (!file || loading) && "opacity-50 cursor-not-allowed")}
        >
          {loading ? progressLabel : "Generate Test Cases"}
        </button>

        {error && (
          <div className="px-4 py-3 rounded-md bg-destructive/10 border border-red-900 text-red-400 text-[13px] mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-2">
            <div className="flex items-center gap-4 mb-5 px-4 py-3 rounded-md bg-emerald-950/30 border border-emerald-800">
              <span className="text-emerald-400 text-xl">✓</span>
              <span className="text-emerald-400 font-semibold">
                {result.generated} test case{result.generated !== 1 ? "s" : ""} generated
                {suiteId && suites.find((s) => s.id === suiteId)
                  ? ` and added to "${suites.find((s) => s.id === suiteId)!.name}"`
                  : ""}
              </span>
              <div className="ml-auto flex gap-2">
                {result.mode === "modules" && result.modules && result.modules.length > 0 ? (
                  <button type="button" onClick={() => router.push(`/test-cases?suiteId=${result.modules![0].suiteId}`)} className={cn(primaryBtnClass, "text-[13px] px-3.5 py-1.5")}>
                    View test cases
                  </button>
                ) : suiteId ? (
                  <button type="button" onClick={() => router.push(`/test-cases?suiteId=${suiteId}`)} className={cn(primaryBtnClass, "text-[13px] px-3.5 py-1.5")}>
                    View in suite
                  </button>
                ) : null}
                <button type="button" onClick={handleReset} className="bg-slate-800 text-foreground border-none rounded-md px-3.5 py-1.5 text-[13px] font-semibold cursor-pointer hover:bg-slate-700">
                  Generate more
                </button>
              </div>
            </div>

            {moduleResults.length > 0 && (
              <div className="mb-5">
                <div className="text-xs text-slate-500 uppercase tracking-[0.08em] mb-2">Modules Generated</div>
                {moduleResults.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-blue-950/20 border border-blue-900 rounded-md mb-1.5">
                    <div className="text-[13px] text-blue-300">📁 {m.module}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-primary text-white rounded-full px-2 py-px font-semibold">
                        {m.count} cases
                      </span>
                      <button
                        type="button"
                        onClick={() => router.push(`/test-cases?suiteId=${m.suiteId}`)}
                        className="text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer bg-transparent border-none transition-colors"
                      >
                        View →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {result.cases.map((tc) => (
                <div key={tc.id} className="bg-card border border-slate-800 rounded-md px-4 py-3">
                  <div className="font-medium text-foreground mb-2 text-sm">{tc.title}</div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge label={tc.category} color={CATEGORY_COLORS[tc.category] ?? "#6b7280"} />
                    <Badge label={tc.severity}  color={SEVERITY_COLORS[tc.severity]  ?? "#6b7280"} />
                    <Badge label={tc.priority}  color="#6b7280" />
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

export default function GenerateBrdPage() {
  return (
    <ProtectedRoute>
      <Suspense>
        <GenerateBrdPageInner />
      </Suspense>
    </ProtectedRoute>
  );
}

const inputClass  = "block w-full px-2.5 py-[7px] text-sm bg-card text-foreground border border-slate-700 rounded focus:outline-none focus:border-primary transition-colors";
const selectClass = "block w-full px-2.5 py-[7px] text-sm bg-card text-foreground border border-slate-700 rounded focus:outline-none focus:border-primary transition-colors cursor-pointer";
const primaryBtnClass = "px-5 py-2.5 text-sm font-semibold bg-primary text-white border-none rounded-md cursor-pointer hover:bg-primary/90 transition-colors";
