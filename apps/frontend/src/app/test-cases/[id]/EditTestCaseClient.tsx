"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

  // currentTestCase drives the form — updated when a version is restored
  const [currentTestCase, setCurrentTestCase] = useState<TestCase>(initialTestCase);
  // Incrementing key forces TestCaseForm to remount (re-read initial values) on restore
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
    setFormKey((k) => k + 1);           // remount form with restored values
    setRestoreNotice(`Form updated to v — restored successfully.`);
    setTimeout(() => setRestoreNotice(""), 4000);
  }

  return (
    <div>
      {/* Restore notice */}
      {restoreNotice && (
        <div style={{
          marginBottom: 16,
          padding: "9px 14px",
          background: "#0f2a1a",
          border: "1px solid #166534",
          borderRadius: 6,
          color: "#4ade80",
          fontSize: 13,
        }}>
          {restoreNotice}
        </div>
      )}

      {/* Edit form */}
      <TestCaseForm
        key={formKey}
        initial={currentTestCase}
        excludeId={currentTestCase.id}
        onSubmit={(data) => updateTestCase(currentTestCase.id, { ...data, assignedTo })}
      />

      {/* Assigned To — shown when project members are available */}
      {members.length > 0 && (
        <div style={{ marginTop: 16, maxWidth: 560 }}>
          <div style={{
            fontSize: 11,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
            borderBottom: "1px solid #1e1e1e",
            paddingBottom: 6,
          }}>
            Assignment
          </div>
          <label style={{ display: "block", fontSize: 14 }}>
            Assigned To
            <select
              value={assignedTo ?? ""}
              onChange={(e) => setAssignedTo(e.target.value || null)}
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "6px 8px",
                fontSize: 14,
                boxSizing: "border-box" as const,
                background: "#1a1a1a",
                color: "#eee",
                border: "1px solid #444",
                borderRadius: 4,
              }}
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

      {/* History toggle + delete */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #222", display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={() => setShowHistory((v) => !v)}
          style={{
            background: showHistory ? "#0f1f3b" : "transparent",
            border: "1px solid #2a2a2a",
            color: showHistory ? "#60a5fa" : "#666",
            borderRadius: 4,
            padding: "6px 14px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {showHistory ? "▲ Hide History" : "▼ Show History"}
        </button>

        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              background: "#7f1d1d",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            {deleting ? "Deleting…" : "Delete Test Case"}
          </button>
        )}
      </div>

      {/* History panel */}
      {showHistory && (
        <div style={{
          marginTop: 16,
          padding: 20,
          background: "#0a0a0a",
          border: "1px solid #1e1e1e",
          borderRadius: 8,
        }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "#eee", fontWeight: 600 }}>
            Version History
          </h3>
          <HistoryPanel
            testCaseId={currentTestCase.id}
            onRestore={handleRestore}
          />
        </div>
      )}
    </div>
  );
}
