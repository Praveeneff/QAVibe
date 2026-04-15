"use client";

import { useState } from "react";
import { getSuites, type TestSuite } from "@/lib/api";
import { useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";

interface ScanMatch {
  idA: string; titleA: string;
  idB: string; titleB: string;
  score: number;
  level: "high" | "medium";
}

interface ScanResult {
  total: number;
  matches: ScanMatch[];
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function runScan(suiteId?: string): Promise<ScanResult> {
  const token = typeof window !== "undefined" ? localStorage.getItem("qavibe_token") : null;
  const res = await fetch(`${BASE_URL}/test-cases/scan-duplicates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(suiteId ? { suiteId } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function LevelBadge({ level }: { level: "high" | "medium" }) {
  const styles = {
    high:   { bg: "#3d0a0a", fg: "#f87171", border: "#7f2020" },
    medium: { bg: "#3d2a0a", fg: "#fb923c", border: "#92400e" },
  };
  const { bg, fg, border } = styles[level];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const,
      letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 4,
      background: bg, color: fg, border: `1px solid ${border}`, flexShrink: 0,
    }}>
      {level}
    </span>
  );
}

export default function DuplicateScannerPage() {
  const [suites,   setSuites]   = useState<TestSuite[]>([]);
  const [suiteId,  setSuiteId]  = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [result,   setResult]   = useState<ScanResult | null>(null);
  const [error,    setError]    = useState("");

  useEffect(() => {
    getSuites().then(setSuites).catch(() => {});
  }, []);

  async function handleScan() {
    setScanning(true);
    setError("");
    setResult(null);
    try {
      const data = await runScan(suiteId || undefined);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <ProtectedRoute>
    <div style={{ padding: "32px 40px", maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#eee" }}>
        Duplicate Scanner
      </h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        Finds potentially duplicate test cases using word-overlap analysis (no AI). Pairs with Jaccard similarity ≥ 40% are flagged.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <select
          value={suiteId}
          onChange={(e) => setSuiteId(e.target.value)}
          style={{
            padding: "7px 10px", fontSize: 13, background: "#1a1a1a",
            color: "#eee", border: "1px solid #333", borderRadius: 4, minWidth: 200,
          }}
        >
          <option value="">All suites</option>
          {suites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            padding: "7px 20px", fontSize: 13, fontWeight: 600,
            background: scanning ? "#333" : "#0070f3",
            color: "#fff", border: "none", borderRadius: 4, cursor: scanning ? "not-allowed" : "pointer",
          }}
        >
          {scanning ? "Scanning…" : "Run Scan"}
        </button>
      </div>

      {error && (
        <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}

      {/* Results */}
      {result !== null && (
        <>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
            {result.total === 0
              ? "No duplicate pairs found."
              : `Found ${result.total} potential duplicate pair${result.total === 1 ? "" : "s"}${result.matches.length < result.total ? ` (showing top ${result.matches.length})` : ""}.`
            }
          </div>

          {result.matches.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {result.matches.map((m, i) => (
                <div key={i} style={{
                  background: "#111",
                  border: "1px solid #222",
                  borderRadius: 6,
                  padding: "12px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <LevelBadge level={m.level} />
                    <span style={{ fontSize: 12, color: "#555", marginLeft: "auto" }}>
                      {m.score}% similarity
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>Case A</div>
                      <a
                        href={`/test-cases/${m.idA}`}
                        style={{ fontSize: 13, color: "#60a5fa", textDecoration: "none" }}
                      >
                        {m.titleA.length > 70 ? m.titleA.slice(0, 70) + "…" : m.titleA}
                      </a>
                    </div>
                    <div style={{ color: "#333", alignSelf: "center", fontSize: 16 }}>↔</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>Case B</div>
                      <a
                        href={`/test-cases/${m.idB}`}
                        style={{ fontSize: 13, color: "#60a5fa", textDecoration: "none" }}
                      >
                        {m.titleB.length > 70 ? m.titleB.slice(0, 70) + "…" : m.titleB}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
    </ProtectedRoute>
  );
}
