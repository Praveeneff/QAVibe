"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  getCollection, runCollection, updateCollection, setCollectionTests,
  listApiTests, deleteCollection,
  type ApiCollection, type CollectionRunResult, type CollectionTestResult, type ApiTest,
} from "@/lib/api";
import {
  ArrowLeft, Play, Layers, CheckCircle2, XCircle, AlertCircle,
  Clock, Loader2, ChevronDown, ChevronRight, Settings, Trash2,
  Plus, Save, SkipForward, GripVertical,
} from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";

// ── Helpers ───────────────────────────────────────────────────────────────────

const glassPanel = "rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm";
const inputClass = "w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-foreground placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors";

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-teal-400   bg-teal-950   border-teal-800",
  POST:   "text-violet-400 bg-violet-950 border-violet-800",
  PUT:    "text-amber-400  bg-amber-950  border-amber-800",
  PATCH:  "text-sky-400    bg-sky-950    border-sky-800",
  DELETE: "text-rose-400   bg-rose-950   border-rose-800",
};

const STATUS_META = {
  pass:    { icon: CheckCircle2, color: "text-teal-400",  bg: "bg-teal-950/30",  border: "border-teal-800/50"  },
  fail:    { icon: XCircle,      color: "text-rose-400",  bg: "bg-rose-950/30",  border: "border-rose-800/50"  },
  error:   { icon: AlertCircle,  color: "text-amber-400", bg: "bg-amber-950/30", border: "border-amber-800/50" },
  skipped: { icon: SkipForward,  color: "text-slate-500", bg: "bg-slate-900/30", border: "border-slate-700/50" },
} as const;

interface KVPair { key: string; value: string }

function kvToObj(pairs: KVPair[]): Record<string, unknown> {
  return Object.fromEntries(pairs.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]));
}
function objToKv(obj: Record<string, unknown> | null | undefined): KVPair[] {
  if (!obj) return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
}

// ── Run result panel ──────────────────────────────────────────────────────────

function RunResultRow({ r, index }: { r: CollectionTestResult; index: number }) {
  const [open, setOpen] = useState(r.status !== "pass");
  const m = STATUS_META[r.status];
  const Icon = m.icon;

  const passCount = r.assertionResults.filter((a: any) => a.passed).length;

  return (
    <div className={cn("rounded-xl border overflow-hidden", m.border, m.bg)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="w-5 text-xs text-slate-600 font-mono shrink-0">{index + 1}</span>
        <Icon className={cn("h-4 w-4 shrink-0", m.color)} />
        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0", METHOD_COLORS[r.method] ?? "text-slate-400 bg-slate-900 border-slate-700")}>
          {r.method}
        </span>
        <span className="flex-1 text-sm font-medium text-foreground truncate">{r.name}</span>
        <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
          {r.responseStatus != null && <span className="font-mono">{r.responseStatus}</span>}
          {r.responseTime   != null && (
            <span className={cn(
              "flex items-center gap-1",
              r.responseTime < 500 ? "text-teal-400" : r.responseTime < 1500 ? "text-amber-400" : "text-rose-400",
            )}>
              <Clock className="h-3 w-3" />{r.responseTime}ms
            </span>
          )}
          {r.assertionResults.length > 0 && (
            <span>{passCount}/{r.assertionResults.length}</span>
          )}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-slate-600 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-white/[0.04] pt-3">
          <p className="text-xs font-mono text-slate-500 truncate">{r.url}</p>

          {r.error && (
            <pre className="text-xs font-mono text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded-lg p-3 whitespace-pre-wrap break-all">
              {r.error}
            </pre>
          )}

          {r.status === "skipped" && (
            <p className="text-xs text-slate-500 italic">Skipped because a previous test failed (stopOnFail enabled).</p>
          )}

          {r.assertionResults.length > 0 && (
            <div className="space-y-1">
              {(r.assertionResults as any[]).map((ar: any, i: number) => {
                const a = ar.assertion as any;
                let label = a.type;
                if (a.type === "status")       label = `Status = ${a.value}`;
                if (a.type === "responseTime") label = `Time ≤ ${a.maxMs}ms`;
                if (a.type === "header")       label = `${a.name} ${a.operator}`;
                if (a.type === "jsonPath")     label = `${a.path} ${a.operator}${a.value ? ` "${a.value}"` : ""}`;
                return (
                  <div key={i} className={cn("flex items-start gap-2 px-3 py-2 rounded-lg border text-xs", ar.passed ? "bg-teal-950/20 border-teal-900/40" : "bg-rose-950/20 border-rose-900/40")}>
                    {ar.passed
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-teal-400 mt-0.5 shrink-0" />
                      : <XCircle      className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className={cn("font-medium", ar.passed ? "text-teal-300" : "text-rose-300")}>{label}</p>
                      <p className="text-slate-500 mt-0.5">{ar.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunSummaryBanner({ result }: { result: CollectionRunResult }) {
  const ok = result.status === "pass";
  return (
    <div className={cn(
      "rounded-xl border p-5 space-y-4",
      ok ? "bg-teal-950/30 border-teal-800/40" : "bg-rose-950/30 border-rose-800/40",
    )}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {ok
            ? <CheckCircle2 className="h-6 w-6 text-teal-400" />
            : <XCircle      className="h-6 w-6 text-rose-400" />}
          <div>
            <p className={cn("text-base font-semibold", ok ? "text-teal-300" : "text-rose-300")}>
              {ok ? "All tests passed" : `${result.failed} test${result.failed !== 1 ? "s" : ""} failed`}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {result.passed} passed · {result.failed} failed
              {result.skipped > 0 && ` · ${result.skipped} skipped`}
              · {result.duration}ms total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <p className="text-xl font-bold text-teal-400">{result.passed}</p>
            <p className="text-xs text-slate-500">passed</p>
          </div>
          <div className="text-center">
            <p className={cn("text-xl font-bold", result.failed > 0 ? "text-rose-400" : "text-slate-600")}>{result.failed}</p>
            <p className="text-xs text-slate-500">failed</p>
          </div>
          {result.skipped > 0 && (
            <div className="text-center">
              <p className="text-xl font-bold text-slate-500">{result.skipped}</p>
              <p className="text-xs text-slate-500">skipped</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-xl font-bold text-slate-300">{result.duration}ms</p>
            <p className="text-xs text-slate-500">total</p>
          </div>
        </div>
      </div>

      {/* Per-test results */}
      <div className="space-y-2">
        {result.results.map((r, i) => <RunResultRow key={r.apiTestId} r={r} index={i} />)}
      </div>
    </div>
  );
}

// ── Settings drawer ───────────────────────────────────────────────────────────

function SettingsDrawer({
  collection, allTests, onSaved, onClose,
}: {
  collection: ApiCollection;
  allTests:   ApiTest[];
  onSaved:    (updated: ApiCollection) => void;
  onClose:    () => void;
}) {
  const router = useRouter();
  const [name,        setName]        = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const [variables,   setVariables]   = useState<KVPair[]>(() => objToKv(collection.variables as any));
  const [selectedIds, setSelectedIds] = useState<string[]>(() => collection.tests.map((t) => t.apiTestId));
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  function toggleTest(id: string) {
    setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }
  function moveUp(i: number) {
    if (i === 0) return;
    setSelectedIds((p) => { const n = [...p]; [n[i-1],n[i]]=[n[i],n[i-1]]; return n; });
  }
  function moveDown(i: number) {
    setSelectedIds((p) => { if (i >= p.length-1) return p; const n=[...p]; [n[i],n[i+1]]=[n[i+1],n[i]]; return n; });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const vars = kvToObj(variables);
      await updateCollection(collection.id, {
        name:        name.trim(),
        description: description.trim() || undefined,
        variables:   Object.keys(vars).length ? vars : {},
      });
      const updated = await setCollectionTests(collection.id, selectedIds);
      onSaved(updated);
      onClose();
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${collection.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteCollection(collection.id);
      router.push("/api-tests/collections");
    } finally {
      setDeleting(false);
    }
  }

  const orderedTests = selectedIds.map((id) => allTests.find((t) => t.id === id)).filter(Boolean) as ApiTest[];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1" onClick={onClose} />
      <div className={cn("w-full max-w-md h-full overflow-y-auto shadow-2xl border-l border-white/[0.08] bg-[rgba(10,10,16,0.97)] backdrop-blur-md")}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] sticky top-0 bg-[rgba(10,10,16,0.97)] z-10">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold">Collection Settings</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={cn(inputClass, "resize-none")} />
          </div>

          {/* Variables */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Collection Variables</p>
            <p className="text-xs text-slate-600 mb-2">Shared base. Test-level variables override these.</p>
            <div className="space-y-2">
              {variables.map((v, i) => (
                <div key={i} className="flex gap-2 group">
                  <input value={v.key}   onChange={(e) => setVariables((p) => p.map((x,j) => j===i ? {...x,key:e.target.value} : x))} placeholder="key" className={cn(inputClass,"flex-1 font-mono text-xs")} />
                  <input value={v.value} onChange={(e) => setVariables((p) => p.map((x,j) => j===i ? {...x,value:e.target.value} : x))} placeholder="value" className={cn(inputClass,"flex-[2] font-mono text-xs")} />
                  <button type="button" onClick={() => setVariables((p) => p.filter((_,j) => j!==i))} className="p-1.5 rounded text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setVariables((p) => [...p, {key:"",value:""}])} className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition-colors">
                <Plus className="h-3.5 w-3.5" />Add variable
              </button>
            </div>
          </div>

          {/* Tests */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Tests</p>
            <div className="space-y-1 mb-3">
              {allTests.map((test) => {
                const on = selectedIds.includes(test.id);
                return (
                  <button key={test.id} type="button" onClick={() => toggleTest(test.id)}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-all",
                      on ? "bg-violet-950/40 border-violet-800/50 text-violet-300" : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04]")}>
                    <div className={cn("w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center", on ? "bg-violet-600 border-violet-500" : "border-slate-600")}>
                      {on && <span className="text-[8px] text-white font-bold">✓</span>}
                    </div>
                    <span className={cn("text-[10px] font-bold px-1 py-0.5 rounded border shrink-0", METHOD_COLORS[test.method] ?? "text-slate-400 bg-slate-900 border-slate-700")}>{test.method}</span>
                    <span className="flex-1 truncate">{test.name}</span>
                  </button>
                );
              })}
            </div>
            {orderedTests.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Order</p>
                {orderedTests.map((test, i) => (
                  <div key={test.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs">
                    <span className="text-slate-600 font-mono w-4 shrink-0">{i+1}</span>
                    <div className="flex flex-col gap-0 shrink-0">
                      <button type="button" onClick={() => moveUp(i)}   disabled={i===0}                     className="text-slate-600 hover:text-slate-400 disabled:opacity-20 leading-none text-[9px]">▲</button>
                      <button type="button" onClick={() => moveDown(i)} disabled={i===orderedTests.length-1} className="text-slate-600 hover:text-slate-400 disabled:opacity-20 leading-none text-[9px]">▼</button>
                    </div>
                    <span className={cn("text-[10px] font-bold px-1 py-0.5 rounded border shrink-0", METHOD_COLORS[test.method] ?? "text-slate-400 bg-slate-900 border-slate-700")}>{test.method}</span>
                    <span className="flex-1 truncate text-foreground">{test.name}</span>
                    <button type="button" onClick={() => toggleTest(test.id)} className="text-slate-600 hover:text-rose-400 p-0.5"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-white/[0.06] bg-[rgba(10,10,16,0.97)] px-5 py-3 flex items-center justify-between gap-3">
          <button type="button" onClick={handleDelete} disabled={deleting} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 border border-rose-900/50 hover:bg-rose-950/40 transition-colors disabled:opacity-50">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-white/[0.06] hover:border-white/[0.12] transition-colors">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollectionDetailPage() {
  const params = useParams();
  const id     = params?.id as string;

  const [collection,  setCollection]  = useState<ApiCollection | null>(null);
  const [allTests,    setAllTests]    = useState<ApiTest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [running,     setRunning]     = useState(false);
  const [runResult,   setRunResult]   = useState<CollectionRunResult | null>(null);
  const [showSettings,setShowSettings]= useState(false);

  // Run options
  const [environment,  setEnvironment]  = useState("staging");
  const [stopOnFail,   setStopOnFail]   = useState(false);
  const [runtimeVars,  setRuntimeVars]  = useState<KVPair[]>([]);
  const [showRunOpts,  setShowRunOpts]  = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const col = await getCollection(id);
      setCollection(col);
      if (col.projectId) {
        listApiTests(col.projectId).then(setAllTests).catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleRun() {
    if (!collection) return;
    setRunning(true);
    setRunResult(null);
    try {
      const vars = kvToObj(runtimeVars);
      const result = await runCollection(collection.id, {
        environment: environment || undefined,
        stopOnFail,
        variables:   Object.keys(vars).length ? vars : undefined,
      });
      setRunResult(result);
      // Refresh to update lastExecution on each test
      load();
    } catch (e: any) {
      setError(e?.message ?? "Run failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background flex items-center justify-center text-slate-500 gap-3 text-sm">
          <span className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          Loading collection…
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !collection) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center gap-3 p-5 rounded-xl border border-rose-800/40 bg-rose-950/30 text-sm text-rose-400">
            <AlertCircle className="h-4 w-4" />{error || "Collection not found"}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const passCount = collection.tests.filter((t) => t.apiTest.executions[0]?.status === "pass").length;
  const failCount = collection.tests.filter((t) => {
    const s = t.apiTest.executions[0]?.status;
    return s === "fail" || s === "error";
  }).length;
  const neverRun  = collection.tests.filter((t) => !t.apiTest.executions[0]).length;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

          {/* Header */}
          <div>
            <Link href="/api-tests/collections" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4">
              <ArrowLeft className="h-3.5 w-3.5" />Collections
            </Link>
            <div className="h-0.5 w-12 bg-gradient-to-r from-violet-500 to-teal-500 rounded-full mb-2" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">{collection.name}</h1>
                {collection.description && (
                  <p className="text-sm text-muted-foreground mt-1">{collection.description}</p>
                )}
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-white/[0.06] hover:border-white/[0.12] hover:text-foreground transition-colors shrink-0"
              >
                <Settings className="h-3.5 w-3.5" />Settings
              </button>
            </div>
          </div>

          {/* Stats row */}
          {collection.tests.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span><span className="text-foreground font-medium">{collection.tests.length}</span> tests</span>
              {passCount > 0 && <span><span className="text-teal-400 font-medium">{passCount}</span> passing</span>}
              {failCount > 0 && <span><span className="text-rose-400 font-medium">{failCount}</span> failing</span>}
              {neverRun  > 0 && <span><span className="text-slate-400 font-medium">{neverRun}</span> never run</span>}
              {collection.variables && Object.keys(collection.variables).length > 0 && (
                <span><span className="text-violet-400 font-medium">{Object.keys(collection.variables).length}</span> variables</span>
              )}
            </div>
          )}

          {/* Test list */}
          <div className={glassPanel}>
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <p className="text-sm font-semibold">Tests</p>
              <span className="text-xs text-slate-600">Execution order →</span>
            </div>
            {collection.tests.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Layers className="h-7 w-7 text-slate-700" />
                <p className="text-sm text-slate-500">No tests yet. Add some in Settings.</p>
                <button onClick={() => setShowSettings(true)} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Open Settings →</button>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {collection.tests.map((ct, i) => {
                  const last = ct.apiTest.executions[0];
                  const m = last ? STATUS_META[last.status as keyof typeof STATUS_META] : null;
                  const Icon = m?.icon;
                  return (
                    <div key={ct.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                      <span className="w-5 text-xs text-slate-600 font-mono shrink-0">{i + 1}</span>
                      <GripVertical className="h-4 w-4 text-slate-700 shrink-0" />
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0", METHOD_COLORS[ct.apiTest.method] ?? "text-slate-400 bg-slate-900 border-slate-700")}>
                        {ct.apiTest.method}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{ct.apiTest.name}</p>
                        <p className="text-xs text-slate-500 font-mono truncate">{ct.apiTest.url}</p>
                      </div>
                      {last && Icon && m && (
                        <div className="flex items-center gap-1.5 shrink-0 text-xs">
                          <Icon className={cn("h-3.5 w-3.5", m.color)} />
                          {last.responseTime != null && (
                            <span className="text-slate-500">{last.responseTime}ms</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Run options */}
          <div className={glassPanel}>
            <button
              type="button"
              onClick={() => setShowRunOpts((v) => !v)}
              className="flex items-center justify-between w-full px-5 py-4 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 rounded-full bg-gradient-to-b from-teal-500 to-teal-700" />
                <p className="text-sm font-semibold">Run Options</p>
              </div>
              {showRunOpts ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
            </button>
            {showRunOpts && (
              <div className="px-5 pb-5 space-y-4 border-t border-white/[0.04] pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Environment</label>
                    <select
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                      className={inputClass}
                    >
                      {["staging","production","dev","qa"].map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end pb-0.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stopOnFail}
                        onChange={(e) => setStopOnFail(e.target.checked)}
                        className="accent-violet-500 h-4 w-4 rounded"
                      />
                      <div>
                        <p className="text-sm text-foreground">Stop on fail</p>
                        <p className="text-xs text-slate-500">Skip remaining tests if one fails</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Runtime variable overrides */}
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1.5">
                    Runtime Variable Overrides
                    <span className="ml-1 text-slate-600 font-normal">(highest priority, not saved)</span>
                  </p>
                  <div className="space-y-2">
                    {runtimeVars.map((v, i) => (
                      <div key={i} className="flex gap-2 group">
                        <input value={v.key}   onChange={(e) => setRuntimeVars((p) => p.map((x,j) => j===i ? {...x,key:e.target.value} : x))} placeholder="key" className={cn(inputClass,"flex-1 font-mono text-xs")} />
                        <input value={v.value} onChange={(e) => setRuntimeVars((p) => p.map((x,j) => j===i ? {...x,value:e.target.value} : x))} placeholder="value" className={cn(inputClass,"flex-[2] font-mono text-xs")} />
                        <button type="button" onClick={() => setRuntimeVars((p) => p.filter((_,j) => j!==i))} className="p-1.5 rounded text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setRuntimeVars((p) => [...p, {key:"",value:""}])} className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition-colors">
                      <Plus className="h-3.5 w-3.5" />Add override
                    </button>
                  </div>
                </div>

                {/* Variable resolution hint */}
                {(collection.variables && Object.keys(collection.variables).length > 0) && (
                  <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Variable Resolution Order</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-violet-950/60 border border-violet-800/40 text-violet-400">collection</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-teal-950/60 border border-teal-800/40 text-teal-400">test-level</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/40 text-amber-400">runtime overrides</span>
                      <span className="text-slate-600 ml-1">(highest wins)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Run button */}
          {collection.tests.length > 0 && (
            <button
              onClick={handleRun}
              disabled={running}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-teal-900/30"
            >
              {running ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Running {collection.name}…
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  Run Collection ({collection.tests.length} tests)
                </>
              )}
            </button>
          )}

          {/* Run result */}
          {runResult && <RunSummaryBanner result={runResult} />}

        </div>
      </div>

      {/* Settings drawer */}
      {showSettings && (
        <SettingsDrawer
          collection={collection}
          allTests={allTests}
          onSaved={(updated) => { setCollection(updated); }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </ProtectedRoute>
  );
}
