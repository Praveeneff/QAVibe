"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  listApiTests, createCollection,
  getActiveProjectId, type ApiTest,
} from "@/lib/api";
import { ArrowLeft, Plus, Trash2, Loader2, GripVertical, Check } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";

const glassPanel  = "rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm";
const inputClass  = "w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-foreground placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors";

const METHOD_COLORS: Record<string, string> = {
  GET:    "text-teal-400   bg-teal-950   border-teal-800",
  POST:   "text-violet-400 bg-violet-950 border-violet-800",
  PUT:    "text-amber-400  bg-amber-950  border-amber-800",
  PATCH:  "text-sky-400    bg-sky-950    border-sky-800",
  DELETE: "text-rose-400   bg-rose-950   border-rose-800",
};

interface KVPair { key: string; value: string }

export default function NewCollectionPage() {
  const router    = useRouter();
  const projectId = getActiveProjectId();

  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [variables,   setVariables]   = useState<KVPair[]>([]);
  const [allTests,    setAllTests]    = useState<ApiTest[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [errors,      setErrors]      = useState<string[]>([]);

  useEffect(() => {
    if (!projectId) { router.replace("/projects"); return; }
    listApiTests(projectId).then(setAllTests).catch(console.error);
  }, [projectId, router]);

  function toggleTest(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setSelectedIds((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveDown(i: number) {
    setSelectedIds((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  async function handleSave() {
    const errs: string[] = [];
    if (!name.trim() || name.trim().length < 2) errs.push("Name must be at least 2 characters");
    if (selectedIds.length === 0) errs.push("Add at least one test to the collection");
    if (errs.length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const vars = Object.fromEntries(variables.filter((v) => v.key.trim()).map((v) => [v.key.trim(), v.value]));
      const col  = await createCollection({
        projectId: projectId!,
        name:        name.trim(),
        description: description.trim() || undefined,
        variables:   Object.keys(vars).length ? vars : undefined,
        testIds:     selectedIds,
      });
      router.push(`/api-tests/collections/${col.id}`);
    } catch (e: any) {
      setErrors([e?.message ?? "Save failed"]);
    } finally {
      setSaving(false);
    }
  }

  const orderedTests = selectedIds
    .map((id) => allTests.find((t) => t.id === id))
    .filter(Boolean) as ApiTest[];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-5 pb-24">

          <div>
            <Link href="/api-tests/collections" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4">
              <ArrowLeft className="h-3.5 w-3.5" />Back to Collections
            </Link>
            <div className="h-0.5 w-12 bg-gradient-to-r from-violet-500 to-teal-500 rounded-full mb-2" />
            <h1 className="text-xl font-semibold tracking-tight">New Collection</h1>
          </div>

          {errors.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/40 space-y-1">
              {errors.map((e, i) => <p key={i} className="text-sm text-rose-300">{e}</p>)}
            </div>
          )}

          {/* Basic Info */}
          <div className={glassPanel}>
            <div className="px-5 py-4 border-b border-white/[0.04]">
              <p className="text-sm font-semibold">Details</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Name <span className="text-rose-400">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Auth flows" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What does this collection test?" className={cn(inputClass, "resize-none")} />
              </div>
            </div>
          </div>

          {/* Variables */}
          <div className={glassPanel}>
            <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Collection Variables</p>
                <p className="text-xs text-slate-500 mt-0.5">Shared across all tests. Test-level variables take precedence.</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2">
              {variables.map((v, i) => (
                <div key={i} className="flex gap-2 group">
                  <input value={v.key}   onChange={(e) => setVariables((p) => p.map((x,j) => j===i ? {...x,key:e.target.value} : x))} placeholder="variableName" className={cn(inputClass,"flex-1 font-mono text-xs")} />
                  <input value={v.value} onChange={(e) => setVariables((p) => p.map((x,j) => j===i ? {...x,value:e.target.value} : x))} placeholder="value" className={cn(inputClass,"flex-[2] font-mono text-xs")} />
                  <button type="button" onClick={() => setVariables((p) => p.filter((_,j) => j!==i))} className="p-1.5 rounded text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setVariables((p) => [...p, {key:"",value:""}])} className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition-colors">
                <Plus className="h-3.5 w-3.5" />Add variable
              </button>
            </div>
          </div>

          {/* Test selection */}
          <div className={glassPanel}>
            <div className="px-5 py-4 border-b border-white/[0.04]">
              <p className="text-sm font-semibold">Tests <span className="text-rose-400">*</span></p>
              <p className="text-xs text-slate-500 mt-0.5">Select tests and drag to reorder execution sequence.</p>
            </div>

            {/* Available tests */}
            <div className="px-5 py-4 space-y-1.5 border-b border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Available Tests</p>
              {allTests.length === 0 ? (
                <p className="text-xs text-slate-600 italic">No API tests in this project yet.</p>
              ) : allTests.map((test) => {
                const on = selectedIds.includes(test.id);
                return (
                  <button
                    key={test.id} type="button"
                    onClick={() => toggleTest(test.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-xs transition-all border",
                      on
                        ? "bg-violet-950/40 border-violet-800/50 text-violet-300"
                        : "bg-white/[0.02] border-white/[0.04] text-slate-400 hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", on ? "bg-violet-600 border-violet-500" : "border-slate-600")}>
                      {on && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0", METHOD_COLORS[test.method] ?? "text-slate-400 bg-slate-900 border-slate-700")}>
                      {test.method}
                    </span>
                    <span className="flex-1 truncate">{test.name}</span>
                    <span className="font-mono text-slate-600 truncate max-w-[160px]">{test.url}</span>
                  </button>
                );
              })}
            </div>

            {/* Ordered sequence */}
            {orderedTests.length > 0 && (
              <div className="px-5 py-4 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">
                  Execution Order ({orderedTests.length})
                </p>
                {orderedTests.map((test, i) => (
                  <div key={test.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.025] border border-white/[0.05]">
                    <span className="w-5 text-center text-xs text-slate-600 font-mono shrink-0">{i + 1}</span>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button type="button" onClick={() => moveUp(i)}   disabled={i === 0}                       className="text-slate-600 hover:text-slate-400 disabled:opacity-20 text-[10px] leading-none">▲</button>
                      <button type="button" onClick={() => moveDown(i)} disabled={i === orderedTests.length - 1} className="text-slate-600 hover:text-slate-400 disabled:opacity-20 text-[10px] leading-none">▼</button>
                    </div>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0", METHOD_COLORS[test.method] ?? "text-slate-400 bg-slate-900 border-slate-700")}>
                      {test.method}
                    </span>
                    <span className="flex-1 text-xs text-foreground truncate">{test.name}</span>
                    <button type="button" onClick={() => toggleTest(test.id)} className="text-slate-600 hover:text-rose-400 transition-colors p-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[rgba(10,10,15,0.92)] backdrop-blur-md px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-center justify-end gap-3">
            <Link href="/api-tests/collections" className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-white/[0.06] hover:border-white/[0.12] transition-colors">
              Cancel
            </Link>
            <button
              type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Collection
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
