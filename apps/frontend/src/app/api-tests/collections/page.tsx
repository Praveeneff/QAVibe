"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  listCollections, deleteCollection,
  getActiveProjectId, type ApiCollection,
} from "@/lib/api";
import { Plus, Layers, Trash2, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";

const glassPanel = "rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm";

function CollectionCard({ col, onDelete }: { col: ApiCollection; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const count = col._count?.tests ?? col.tests?.length ?? 0;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm(`Delete "${col.name}"?`)) return;
    setDeleting(true);
    try { onDelete(col.id); } finally { setDeleting(false); }
  }

  return (
    <Link
      href={`/api-tests/collections/${col.id}`}
      className={cn(
        glassPanel,
        "group flex items-center gap-4 px-5 py-4 hover:border-violet-700/40 hover:bg-[rgba(20,15,30,0.7)] transition-all",
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-violet-950/60 border border-violet-800/40 flex items-center justify-center shrink-0">
        <Layers className="h-5 w-5 text-violet-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground group-hover:text-violet-300 transition-colors truncate">
          {col.name}
        </p>
        {col.description && (
          <p className="text-xs text-slate-500 truncate mt-0.5">{col.description}</p>
        )}
        <p className="text-xs text-slate-600 mt-1">
          {count} test{count !== 1 ? "s" : ""}
          {col.variables && Object.keys(col.variables).length > 0 && (
            <span className="ml-2 text-violet-500/70">
              · {Object.keys(col.variables).length} variable{Object.keys(col.variables).length !== 1 ? "s" : ""}
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 hover:bg-rose-950/40 transition-all"
          title="Delete collection"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
        <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1,2,3].map((i) => <div key={i} className="h-20 rounded-xl bg-white/[0.03]" />)}
    </div>
  );
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const projectId = getActiveProjectId();

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    try {
      setCollections(await listCollections(projectId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteCollection(id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="h-0.5 w-12 bg-gradient-to-r from-violet-500 to-teal-500 rounded-full mb-2" />
              <h1 className="text-xl font-semibold tracking-tight">Collections</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Group tests and run them as a sequence with shared variables
              </p>
            </div>
            {projectId && (
              <Link
                href="/api-tests/collections/new"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" />New Collection
              </Link>
            )}
          </div>

          {loading ? <Skeleton /> : error ? (
            <div className="flex items-center gap-3 p-5 rounded-xl border border-rose-800/40 bg-rose-950/30 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          ) : collections.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-20">
              <div className="w-14 h-14 rounded-2xl bg-violet-950/60 border border-violet-800/40 flex items-center justify-center">
                <Layers className="h-7 w-7 text-violet-400" />
              </div>
              <p className="text-sm text-slate-500 text-center">
                No collections yet. Group your API tests to run them together.
              </p>
              {projectId && (
                <Link
                  href="/api-tests/collections/new"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />New Collection
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {collections.map((col) => (
                <CollectionCard key={col.id} col={col} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
