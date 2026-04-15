"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getTestCase, type TestCase } from "@/lib/api";
import EditTestCaseClient from "./EditTestCaseClient";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function EditTestCasePage() {
  const { id } = useParams<{ id: string }>();
  const [testCase, setTestCase] = useState<TestCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getTestCase(id)
      .then(setTestCase)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ProtectedRoute>
        <main style={{ padding: 32, fontFamily: "sans-serif", color: "#eee", background: "#111", minHeight: "100vh" }}>
          <div style={{ color: "#888" }}>Loading…</div>
        </main>
      </ProtectedRoute>
    );
  }

  if (error || !testCase) {
    return (
      <ProtectedRoute>
        <main style={{ padding: 32, fontFamily: "sans-serif", color: "#eee", background: "#111", minHeight: "100vh" }}>
          <div style={{ color: "#f87171" }}>Test case not found.</div>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main style={{ padding: 32, fontFamily: "sans-serif", color: "#eee", background: "#111", minHeight: "100vh" }}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/test-cases" style={{ color: "#0070f3", textDecoration: "none", fontSize: 14 }}>
            ← Back to Test Cases
          </Link>
        </div>
        <h1 style={{ marginBottom: 24 }}>Edit Test Case</h1>
        <EditTestCaseClient testCase={testCase} />
      </main>
    </ProtectedRoute>
  );
}
