"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getTestRun, type TestRun } from "@/lib/api";
import RunClient from "./RunClient";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function RunPage() {
  const params = useParams();
  const id = params?.id as string;
  const [run, setRun] = useState<TestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    getTestRun(id)
      .then(setRun)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <ProtectedRoute>
      <main style={{ padding: 32 }}>
        <p style={{ color: "#888" }}>Loading run...</p>
      </main>
    </ProtectedRoute>
  );

  if (error || !run) return (
    <ProtectedRoute>
      <main style={{ padding: 32 }}>
        <p style={{ color: "#f87171" }}>Run not found.</p>
      </main>
    </ProtectedRoute>
  );

  return (
    <ProtectedRoute>
      <main style={{ padding: 32, minHeight: "100vh" }}>
        <RunClient initialRun={run} />
      </main>
    </ProtectedRoute>
  );
}
