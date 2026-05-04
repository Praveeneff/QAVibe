"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import RequestBuilder from "@/components/api-tests/RequestBuilder";
import { getApiTest, getActiveProjectId, type ApiTest } from "@/lib/api";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function EditApiTestPage() {
  const params    = useParams();
  const router    = useRouter();
  const id        = params?.id as string;
  const projectId = getActiveProjectId();

  const [test,    setTest]    = useState<ApiTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!id) return;
    getApiTest(id)
      .then((data) => setTest(data as ApiTest))
      .catch((err) => setError(err?.message ?? "Failed to load API test"))
      .finally(() => setLoading(false));
  }, [id]);

  if (!projectId) {
    router.replace("/projects");
    return null;
  }

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
            <h1 className="text-xl font-semibold tracking-tight">Edit API Test</h1>
            {test && (
              <p className="text-sm text-muted-foreground mt-1">
                {test.name}
              </p>
            )}
          </div>

          {/* Last execution banner */}
          {test && (test as any).executions?.length > 0 && (() => {
            const last = (test as any).executions[0];
            const Icon =
              last.status === "pass"  ? CheckCircle2 :
              last.status === "fail"  ? XCircle      : AlertCircle;
            const color =
              last.status === "pass"  ? "text-teal-400  border-teal-800/50  bg-teal-950/30"  :
              last.status === "fail"  ? "text-rose-400  border-rose-800/50  bg-rose-950/30"  :
                                        "text-amber-400 border-amber-800/50 bg-amber-950/30";
            return (
              <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border text-sm", color)}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-medium capitalize">{last.status}</span>
                {last.responseStatus != null && (
                  <span className="text-slate-400">HTTP {last.responseStatus}</span>
                )}
                {last.responseTime != null && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <Clock className="h-3.5 w-3.5" />{last.responseTime}ms
                  </span>
                )}
                <span className="text-slate-500 ml-auto">
                  Last run {timeAgo(last.executedAt)}
                </span>
              </div>
            );
          })()}

          {/* Loading / Error / Form */}
          {loading ? (
            <div className="flex items-center gap-3 py-20 justify-center text-slate-500 text-sm">
              <span className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              Loading test…
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-5 rounded-xl border border-rose-800/40 bg-rose-950/30 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : test ? (
            <RequestBuilder mode="edit" initial={test} projectId={projectId} />
          ) : null}

        </div>
      </div>
    </ProtectedRoute>
  );
}
