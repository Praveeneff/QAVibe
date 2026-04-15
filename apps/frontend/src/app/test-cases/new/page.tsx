import Link from "next/link";
import NewTestCaseClient from "./NewTestCaseClient";
import ProtectedRoute from "@/components/ProtectedRoute";

interface Props {
  searchParams: Promise<{ suiteId?: string }>;
}

export default async function NewTestCasePage({ searchParams }: Props) {
  const { suiteId } = await searchParams;

  return (
    <ProtectedRoute>
      <main style={{ padding: 32, fontFamily: "sans-serif", color: "#eee", background: "#111", minHeight: "100vh" }}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/test-cases" style={{ color: "#0070f3", textDecoration: "none", fontSize: 14 }}>
            ← Back to Test Cases
          </Link>
        </div>
        <h1 style={{ marginBottom: 24 }}>New Test Case</h1>
        <NewTestCaseClient initialSuiteId={suiteId} />
      </main>
    </ProtectedRoute>
  );
}
