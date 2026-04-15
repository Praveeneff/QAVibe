"use client";

import { useState, useEffect } from "react";
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

const CHANGE_TYPE_STYLE: Record<string, { bg: string; fg: string }> = {
  manual:  { bg: "#0f1f3b", fg: "#60a5fa" },
  ai:      { bg: "#1a0f3b", fg: "#a78bfa" },
  restore: { bg: "#0f2a1a", fg: "#4ade80" },
};

function ChangeTypeBadge({ type }: { type: string }) {
  const { bg, fg } = CHANGE_TYPE_STYLE[type] ?? { bg: "#222", fg: "#888" };
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      padding: "2px 7px",
      borderRadius: 4,
      background: bg,
      color: fg,
    }}>
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
    <div style={{
      marginTop: 10,
      padding: "10px 12px",
      background: "#0d0d0d",
      borderRadius: 6,
      border: "1px solid #1e1e1e",
      fontSize: 12,
      display: "grid",
      gridTemplateColumns: "90px 1fr",
      gap: "5px 10px",
      color: "#aaa",
    }}>
      {fields.map(([label, value]) =>
        value ? (
          <><span key={`l-${label}`} style={{ color: "#555" }}>{label}</span>
          <span key={`v-${label}`} style={{ color: "#ccc", wordBreak: "break-word" }}>{value}</span></>
        ) : null
      )}
      {stepsArr && (
        <>
          <span style={{ color: "#555", alignSelf: "start", paddingTop: 2 }}>Steps</span>
          <ol style={{ margin: 0, paddingLeft: 18, color: "#ccc", display: "flex", flexDirection: "column", gap: 3 }}>
            {stepsArr.map((s, i) => (
              <li key={i} style={{ wordBreak: "break-word" }}>{s}</li>
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
      // Re-fetch history so the new "restore" entry appears
      const updated = await getTestCaseHistory(testCaseId);
      setHistory(updated);
      onRestore(restored);
    } catch (err: any) {
      setRestoreMsg(err?.message ?? "Restore failed");
    } finally {
      setRestoring(null);
    }
  }

  if (loading) {
    return <p style={{ color: "#555", fontSize: 13, padding: "16px 0" }}>Loading history…</p>;
  }

  if (error) {
    return <p style={{ color: "#f87171", fontSize: 13, padding: "16px 0" }}>{error}</p>;
  }

  if (history.length === 0) {
    return (
      <p style={{ color: "#555", fontSize: 13, padding: "16px 0" }}>
        No history yet — history is saved each time this test case is edited.
      </p>
    );
  }

  return (
    <div>
      {restoreMsg && (
        <div style={{
          marginBottom: 12,
          padding: "8px 14px",
          background: "#0f2a1a",
          border: "1px solid #166534",
          borderRadius: 6,
          color: "#4ade80",
          fontSize: 13,
        }}>
          {restoreMsg}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {history.map((entry) => {
          const isExpanded  = expanded === entry.id;
          const isRestoring = restoring === entry.id;

          return (
            <div
              key={entry.id}
              style={{
                border: "1px solid #1e1e1e",
                borderRadius: 6,
                overflow: "hidden",
                background: isExpanded ? "#111" : "transparent",
              }}
            >
              {/* Row header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                cursor: "pointer",
              }}
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
              >
                {/* Version pill */}
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#eee",
                  background: "#222",
                  border: "1px solid #333",
                  borderRadius: 4,
                  padding: "1px 8px",
                  flexShrink: 0,
                }}>
                  v{entry.version}
                </span>

                <ChangeTypeBadge type={entry.changeType} />

                <span style={{ fontSize: 12, color: "#555", flex: 1, minWidth: 0 }}>
                  {entry.changedBy
                    ? <span style={{ color: "#777" }}>{entry.changedBy.slice(0, 8)}…</span>
                    : <span>—</span>}
                </span>

                <span style={{ fontSize: 11, color: "#444", whiteSpace: "nowrap" }}>
                  {timeAgo(entry.changedAt)}
                </span>

                <span style={{ fontSize: 11, color: "#444", marginLeft: 4 }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {/* Expanded snapshot + restore */}
              {isExpanded && (
                <div style={{ padding: "0 12px 12px" }}>
                  <SnapshotDetail snap={entry.snapshot} />
                  <button
                    onClick={() => handleRestore(entry)}
                    disabled={!!restoring}
                    style={{
                      marginTop: 10,
                      background: "transparent",
                      border: "1px solid #166534",
                      color: isRestoring ? "#555" : "#4ade80",
                      borderRadius: 4,
                      padding: "5px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: restoring ? "not-allowed" : "pointer",
                    }}
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
