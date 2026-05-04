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
      <main className="px-8 py-8 min-h-screen">
        <div className="mb-5">
          <Link href="/test-cases" className="text-primary no-underline text-sm hover:underline">
            ← Back to Test Cases
          </Link>
        </div>
        <h1 className="mb-6 text-2xl font-bold text-foreground">New Test Case</h1>
        <NewTestCaseClient initialSuiteId={suiteId} />
      </main>
    </ProtectedRoute>
  );
}
