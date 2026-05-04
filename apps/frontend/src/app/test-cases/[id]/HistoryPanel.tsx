"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getTestCaseHistory, restoreTestCaseVersion, type HistoryEntry, type TestCase } from "../../../lib/api";

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const secs  = Math.floor(diff / 1000);
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (secs  < 60)  return `${secs}s ago`;
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}

const CHANGE_TYPE_CLASSES: Record<string, string> = {
  manual:  "bg-blue-950/40 text-blue-400",
  ai:      "bg-purple-950/40 text-purple-400",
  restore: "bg-emerald-950/40 text-emerald-400",
};

function ChangeTypeBadge({ type }: { type: string }) {
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded", CHANGE_TYPE_CLASSES[type] ?? "bg-slate-800 text-slate-400")}>
      {type}
    </span>
  );
}

function SnapshotDetail({ snap }: { snap: TestCase }) {
  const stepsArr: string[] | null = (() => {
    if (!snap.steps) return null;
    try {
      const arr = JSON.parse(snap.steps);
      if (Array.isArray(arr) && arr.length > 0) return arr as string[];
    } catch {}
    return snap.steps ? [snap.steps] : null;
  })();

  const fields: [string, string | null | undefined][] = [
    ["Title",       snap.title],
    ["Category",    snap.category],
    ["Priority",    snap.priority],
    ["Severity",    snap.severity],
    ["Status",      snap.status],
    ["Execution",   snap.executionType],
    ["Description", snap.description?.slice(0, 100) ?? null],
    ["Expected",    snap.expectedResult?.slice(0, 100) ?? null],
  ];

  return (
    <div className="mt-2.5 px-3 py-2.5 bg-[#0d0d0d] rounded-md border border-slate-900 text-xs grid gap-y-1 gap-x-2.5 text-muted-foreground"
      style={{ gridTemplateColumns: "90px 1fr" }}>
      {fields.map(([label, value]) =>
        value ? (
          <>
            <span key={`l-${label}`} className="text-slate-600">{label}</span>
            <span key={`v-${label}`} className="text-slate-300 break-words">{value}</span>
          </>
        ) : null
      )}
      {stepsArr && (
        <>
          <span className="text-slate-600 self-start pt-0.5">Steps</span>
          <ol className="m-0 pl-4 text-slate-300 flex flex-col gap-0.5">
            {stepsArr.map((s, i) => (
              <li key={i} className="break-words">{s}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

interface Props {
  testCaseId: string;
  onRestore:  (restored: TestCase) => void;
}

export default function HistoryPanel({ testCaseId, onRestore }: Props) {
  const [history,    setHistory]    = useState<HistoryEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [restoring,  setRestoring]  = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    getTestCaseHistory(testCaseId)
      .then(setHistory)
      .catch(() => setError("Could not load history"))
      .finally(() => setLoading(false));
  }, [testCaseId]);

  async function handleRestore(entry: HistoryEntry) {
    if (!confirm(`Restore to version ${entry.version}? The form will update with the restored values.`)) return;
    setRestoring(entry.id);
    setRestoreMsg("");
    try {
      const restored = await restoreTestCaseVersion(testCaseId, entry.id);
      setRestoreMsg(`Restored to v${entry.version}`);
      const updated = await getTestCaseHistory(testCaseId);
      setHistory(updated);
      onRestore(restored);
    } catch (err: any) {
      setRestoreMsg(err?.message ?? "Restore failed");
    } finally {
      setRestoring(null);
    }
  }

  if (loading) return <p className="text-slate-500 text-[13px] py-4">Loading history…</p>;
  if (error)   return <p className="text-red-400 text-[13px] py-4">{error}</p>;
  if (history.length === 0) {
    return (
      <p className="text-slate-500 text-[13px] py-4">
        No history yet — history is saved each time this test case is edited.
      </p>
    );
  }

  return (
    <div>
      {restoreMsg && (
        <div className="mb-3 px-3.5 py-2 bg-emerald-950/30 border border-emerald-800 rounded-md text-emerald-400 text-[13px]">
          {restoreMsg}
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {history.map((entry) => {
          const isExpanded  = expanded === entry.id;
          const isRestoring = restoring === entry.id;

          return (
            <div
              key={entry.id}
              className={cn("border border-slate-900 rounded-md overflow-hidden", isExpanded ? "bg-[#111]" : "bg-transparent")}
            >
              {/* Row header */}
              <div
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
              >
                <span className="text-[11px] font-bold text-foreground bg-slate-800 border border-border rounded px-2 py-px shrink-0">
                  v{entry.version}
                </span>

                <ChangeTypeBadge type={entry.changeType} />

                <span className="text-xs text-slate-500 flex-1 min-w-0">
                  {entry.changedBy
                    ? <span className="text-slate-400">{entry.changedBy.slice(0, 8)}…</span>
                    : <span>—</span>}
                </span>

                <span className="text-[11px] text-slate-600 whitespace-nowrap">
                  {timeAgo(entry.changedAt)}
                </span>

                <span className="text-[11px] text-slate-600 ml-1">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {/* Expanded snapshot + restore */}
              {isExpanded && (
                <div className="px-3 pb-3">
                  <SnapshotDetail snap={entry.snapshot} />
                  <button
                    onClick={() => handleRestore(entry)}
                    disabled={!!restoring}
                    className={cn(
                      "mt-2.5 bg-transparent border border-emerald-800 rounded px-3.5 py-1 text-xs font-semibold transition-colors",
                      isRestoring ? "text-slate-500 cursor-not-allowed" : "text-emerald-400 cursor-pointer hover:bg-emerald-950/30"
                    )}
                  >
                    {isRestoring ? "Restoring…" : `↩ Restore v${entry.version}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
