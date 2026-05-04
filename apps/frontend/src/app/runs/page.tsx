"use client";

import { useEffect, useState, Suspense } from "react";
import { getAllRuns, getActiveProjectId, type RunSummary } from "@/lib/api";
import EnvFilter from "@/components/EnvFilter";
import RunsClient from "./RunsClient";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function RunsPage() {
  const [allRuns, setAllRuns]       = useState<RunSummary[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await getAllRuns(getActiveProjectId() ?? undefined);
        setAllRuns(result);
      } catch {
        setFetchError("Could not reach backend. Make sure it is running on port 3001.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="p-8 text-slate-400">Loading...</p>;

  return (
    <ProtectedRoute>
      <main className="px-8 py-8 min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <h1 className="m-0 text-2xl font-bold text-foreground">Run History</h1>
          <Suspense>
            <EnvFilter current="" />
          </Suspense>
        </div>

        {fetchError && <p className="text-destructive text-sm">{fetchError}</p>}

        {!fetchError && allRuns.length === 0 && (
          <p className="text-slate-400 text-sm">No runs yet — select test cases and start a run.</p>
        )}

        <RunsClient runs={allRuns} />
      </main>
    </ProtectedRoute>
  );
}
