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
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  useEffect(() => {
    getTestCase(id)
      .then(setTestCase)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ProtectedRoute>
        <main className="px-8 py-8 min-h-screen">
          <div className="text-slate-400 text-sm">Loading…</div>
        </main>
      </ProtectedRoute>
    );
  }

  if (error || !testCase) {
    return (
      <ProtectedRoute>
        <main className="px-8 py-8 min-h-screen">
          <div className="text-red-400 text-sm">Test case not found.</div>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="px-8 py-8 min-h-screen">
        <div className="mb-5">
          <Link href="/test-cases" className="text-primary no-underline text-sm hover:underline">
            ← Back to Test Cases
          </Link>
        </div>
        <h1 className="mb-6 text-2xl font-bold text-foreground">Edit Test Case</h1>
        <EditTestCaseClient testCase={testCase} />
      </main>
    </ProtectedRoute>
  );
}
