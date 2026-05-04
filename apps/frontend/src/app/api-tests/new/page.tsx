"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import RequestBuilder from "@/components/api-tests/RequestBuilder";
import { getActiveProjectId } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewApiTestPage() {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [checked,   setChecked]   = useState(false);

  useEffect(() => {
    const pid = getActiveProjectId();
    setProjectId(pid);
    setChecked(true);
    if (!pid) router.replace("/projects");
  }, [router]);

  if (!checked) return null;
  if (!projectId) return null;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

          {/* Header */}
          <div>
            <Link
              href="/api-tests"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-4"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to API Tests
            </Link>
            <div className="h-0.5 w-12 bg-gradient-to-r from-violet-500 to-teal-500 rounded-full mb-2" />
            <h1 className="text-xl font-semibold tracking-tight">New API Test</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define an HTTP request and the assertions to verify the response.
            </p>
          </div>

          <RequestBuilder mode="create" projectId={projectId} />
        </div>
      </div>
    </ProtectedRoute>
  );
}
