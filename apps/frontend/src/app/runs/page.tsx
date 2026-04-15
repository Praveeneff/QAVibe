"use client";

import { useEffect, useState, Suspense } from "react";
import { getAllRuns, type RunSummary } from "@/lib/api";
import EnvFilter from "@/components/EnvFilter";
import RunsClient from "./RunsClient";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function RunsPage() {
  const [allRuns, setAllRuns] = useState<RunSummary[]>([]);
  const [fetchError, setFetchError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await getAllRuns();
        setAllRuns(result);
      } catch (err: unknown) {
        setFetchError("Could not reach backend. Make sure it is running on port 3001.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p style={{ padding: 32 }}>Loading...</p>;

  return (
    <ProtectedRoute>
      <main style={{ padding: 32, minHeight: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>Run History</h1>
          <Suspense>
            <EnvFilter current="" />
          </Suspense>
        </div>

        {fetchError && <p style={{ color: "red" }}>{fetchError}</p>}

        {!fetchError && allRuns.length === 0 && (
          <p style={{ color: "#888" }}>
            No runs yet — select test cases and start a run.
          </p>
        )}

        <RunsClient runs={allRuns} />
      </main>
    </ProtectedRoute>
  );
}
