"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import TestCaseForm from "../../../components/TestCaseForm";
import { updateTestCase, deleteTestCase, getProjectMembers, getActiveProjectId, type TestCase } from "../../../lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getStoredToken } from "@/context/AuthContext";
import HistoryPanel from "./HistoryPanel";

interface Props {
  testCase: TestCase;
}

export default function EditTestCaseClient({ testCase: initialTestCase }: Props) {
  const { loading, user } = useRequireAuth();
  const router = useRouter();

  const [currentTestCase, setCurrentTestCase] = useState<TestCase>(initialTestCase);
  const [formKey, setFormKey] = useState(0);

  const [deleting,      setDeleting]      = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [restoreNotice, setRestoreNotice] = useState("");

  const [members,    setMembers]    = useState<any[]>([]);
  const [assignedTo, setAssignedTo] = useState<string | null>(
    (initialTestCase as any).assignedTo ?? null,
  );

  useEffect(() => {
    const projectId = getActiveProjectId();
    const token = getStoredToken();
    if (projectId && token) {
      getProjectMembers(projectId, token).then(setMembers).catch(() => {});
    }
  }, []);

  if (loading) return null;
  const isAdmin = user?.role === "admin";

  async function handleDelete() {
    if (!confirm("Delete this test case?")) return;
    setDeleting(true);
    try {
      await deleteTestCase(currentTestCase.id);
      router.push("/test-cases");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  function handleRestore(restored: TestCase) {
    setCurrentTestCase(restored);
    setFormKey((k) => k + 1);
    setRestoreNotice(`Form updated to v — restored successfully.`);
    setTimeout(() => setRestoreNotice(""), 4000);
  }

  return (
    <div>
      {restoreNotice && (
        <div className="mb-4 px-3.5 py-2 bg-emerald-950/30 border border-emerald-800 rounded-md text-emerald-400 text-[13px]">
          {restoreNotice}
        </div>
      )}

      <TestCaseForm
        key={formKey}
        initial={currentTestCase}
        excludeId={currentTestCase.id}
        onSubmit={(data) => updateTestCase(currentTestCase.id, { ...data, assignedTo })}
      />

      {members.length > 0 && (
        <div className="mt-4 max-w-[560px]">
          <div className="text-[11px] text-slate-500 uppercase tracking-[0.08em] mb-2 border-b border-slate-900 pb-1.5">
            Assignment
          </div>
          <label className="block text-sm text-foreground">
            Assigned To
            <select
              value={assignedTo ?? ""}
              onChange={(e) => setAssignedTo(e.target.value || null)}
              className="block w-full mt-1 px-2 py-1.5 text-sm bg-card text-foreground border border-slate-600 rounded focus:outline-none focus:border-primary transition-colors"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.email ?? m.userId}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-800 flex gap-2.5 items-center">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className={cn(
            "border rounded px-3.5 py-1.5 text-[13px] cursor-pointer transition-colors",
            showHistory
              ? "bg-blue-950/40 border-blue-800 text-blue-400"
              : "bg-transparent border-slate-800 text-slate-500 hover:text-slate-300",
          )}
        >
          {showHistory ? "▲ Hide History" : "▼ Show History"}
        </button>

        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={cn(
              "px-3.5 py-1.5 text-[13px] bg-red-900 text-white border-none rounded cursor-pointer hover:bg-red-800 transition-colors ml-auto",
              deleting && "opacity-50 cursor-not-allowed",
            )}
          >
            {deleting ? "Deleting…" : "Delete Test Case"}
          </button>
        )}
      </div>

      {showHistory && (
        <div className="mt-4 p-5 bg-[#0a0a0a] border border-slate-900 rounded-lg">
          <h3 className="m-0 mb-3.5 text-[15px] text-foreground font-semibold">Version History</h3>
          <HistoryPanel
            testCaseId={currentTestCase.id}
            onRestore={handleRestore}
          />
        </div>
      )}
    </div>
  );
}
