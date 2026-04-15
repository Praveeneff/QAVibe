"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getSuites,
  checkDuplicate,
  type TestCase,
  type TestCasePayload,
  type TestSuite,
  type DuplicateMatch,
} from "../lib/api";

interface Props {
  initial?:       TestCase;
  initialSuiteId?: string | null;
  excludeId?:     string;
  onSubmit:       (data: TestCasePayload) => Promise<unknown>;
}

const CATEGORIES = [
  "smoke", "sanity", "regression",
  "functional", "e2e", "integration",
  "performance", "security", "ui", "api",
];

const EXECUTION_TYPES = ["manual", "automated", "api", "exploratory"];

function defaultFields(initial?: TestCase, initialSuiteId?: string | null): TestCasePayload {
  return {
    title:          initial?.title          ?? "",
    description:    initial?.description    ?? "",
    category:       initial?.category       ?? "functional",
    executionType:  initial?.executionType  ?? "manual",
    priority:       initial?.priority       ?? "P2",
    severity:       initial?.severity       ?? "medium",
    steps:          initial?.steps          ?? "",
    expectedResult: initial?.expectedResult ?? "",
    preconditions:  initial?.preconditions  ?? "",
    tags:           initial?.tags           ?? "",
    automationId:   initial?.automationId   ?? "",
    status:         initial?.status         ?? "active",
    suiteId:        initial?.suiteId        ?? initialSuiteId ?? null,
  };
}

// Parse a JSON steps string → string[]. Gracefully handles plain text and empty values.
function parseSteps(raw?: string): string[] {
  if (!raw?.trim()) return [""];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr.map(String);
  } catch {}
  return [raw];
}

// ── Steps editor ──────────────────────────────────────────────────────────────

function StepsEditor({
  steps,
  onChange,
  onBlur,
}: {
  steps:    string[];
  onChange: (steps: string[]) => void;
  onBlur:   () => void;
}) {
  function update(idx: number, value: string) {
    const next = steps.map((s, i) => (i === idx ? value : s));
    onChange(next);
  }

  function addStep() {
    onChange([...steps, ""]);
  }

  function removeStep(idx: number) {
    const next = steps.filter((_, i) => i !== idx);
    onChange(next.length === 0 ? [""] : next);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...steps.slice(0, idx + 1), "", ...steps.slice(idx + 1)];
      onChange(next);
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>("[data-step-input]");
        inputs[idx + 1]?.focus();
      }, 0);
    }
    if (e.key === "Backspace" && steps[idx] === "" && steps.length > 1) {
      e.preventDefault();
      removeStep(idx);
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>("[data-step-input]");
        inputs[Math.max(0, idx - 1)]?.focus();
      }, 0);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
      {steps.map((step, idx) => (
        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11,
            color: "#555",
            minWidth: 20,
            textAlign: "right",
            flexShrink: 0,
            userSelect: "none",
          }}>
            {idx + 1}.
          </span>
          <input
            data-step-input
            value={step}
            onChange={(e) => update(idx, e.target.value)}
            onBlur={onBlur}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            placeholder={`Step ${idx + 1}…`}
            style={{ ...stepInputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => removeStep(idx)}
            disabled={steps.length === 1 && step === ""}
            title="Remove step"
            style={{
              background: "none",
              border: "1px solid #333",
              color: "#666",
              borderRadius: 3,
              width: 24,
              height: 24,
              cursor: steps.length === 1 && step === "" ? "not-allowed" : "pointer",
              fontSize: 14,
              lineHeight: 1,
              flexShrink: 0,
              opacity: steps.length === 1 && step === "" ? 0.3 : 1,
            }}
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addStep}
        style={{
          alignSelf: "flex-start",
          marginTop: 2,
          background: "none",
          border: "1px dashed #333",
          color: "#666",
          borderRadius: 4,
          padding: "3px 10px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        + Add step
      </button>
    </div>
  );
}

// ── Similarity badge ──────────────────────────────────────────────────────────

function SimilarityBadge({ level }: { level: "high" | "medium" }) {
  const styles = {
    high:   { bg: "#3d0a0a", fg: "#f87171", border: "#7f2020" },
    medium: { bg: "#3d2a0a", fg: "#fb923c", border: "#92400e" },
  };
  const { bg, fg, border } = styles[level];
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.06em",
      padding: "2px 7px",
      borderRadius: 4,
      background: bg,
      color: fg,
      border: `1px solid ${border}`,
      flexShrink: 0,
    }}>
      {level}
    </span>
  );
}

// ── Duplicate warning banner ──────────────────────────────────────────────────

function DuplicateWarning({
  duplicates,
  onSaveAnyway,
  onDiscard,
}: {
  duplicates:   DuplicateMatch[];
  onSaveAnyway: () => void;
  onDiscard:    () => void;
}) {
  return (
    <div style={{
      background: "#1c1208",
      border: "1px solid #92400e",
      borderRadius: 6,
      padding: "14px 16px",
      marginTop: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fb923c", marginBottom: 10 }}>
        ⚠ Similar test cases found:
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {duplicates.map((dup) => (
          <div key={dup.id} style={{
            background: "#111",
            border: "1px solid #2a2a2a",
            borderRadius: 5,
            padding: "8px 10px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <SimilarityBadge level={dup.similarity} />
              <span style={{
                fontSize: 13,
                color: "#eee",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}>
                {dup.title.length > 60 ? dup.title.slice(0, 60) + "…" : dup.title}
              </span>
              <a
                href={`/test-cases/${dup.id}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none", flexShrink: 0 }}
              >
                View
              </a>
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>{dup.reason}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>
        This may be a duplicate. You can still save if it&apos;s intentional.
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onSaveAnyway}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            background: "#0070f3",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Save anyway
        </button>
        <button
          type="button"
          onClick={onDiscard}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            background: "transparent",
            color: "#888",
            border: "1px solid #333",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ── Flatten suites tree ───────────────────────────────────────────────────────

const flattenSuites = (
  list: TestSuite[], depth = 0,
): { id: string; name: string; depth: number }[] => {
  const result: { id: string; name: string; depth: number }[] = [];
  for (const s of list) {
    result.push({ id: s.id, name: s.name, depth });
    if (s.children?.length) {
      result.push(...flattenSuites(s.children, depth + 1));
    }
  }
  return result;
};

// ── Main form ─────────────────────────────────────────────────────────────────

export default function TestCaseForm({ initial, initialSuiteId, excludeId, onSubmit }: Props) {
  const router  = useRouter();
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [suites,  setSuites]  = useState<TestSuite[]>([]);

  const [fields, setFields] = useState<TestCasePayload>(() =>
    defaultFields(initial, initialSuiteId),
  );

  const flatSuites = flattenSuites(suites);

  // ── Steps editor state ───────────────────────────────────────────────────
  const [stepsArr, setStepsArr] = useState<string[]>(() =>
    parseSteps(defaultFields(initial, initialSuiteId).steps),
  );

  // ── Duplicate check state ────────────────────────────────────────────────
  const [dupChecking, setDupChecking]   = useState(false);
  const [dupResult,   setDupResult]     = useState<DuplicateMatch[] | null>(null);
  const skipDupGate = useRef(false);

  useEffect(() => {
    getSuites().then(setSuites).catch(console.error);
  }, []);

  function set(key: keyof TestCasePayload, value: string | null) {
    setFields((f) => ({ ...f, [key]: value }));
    if (key === "title" || key === "steps") {
      setDupResult(null);
      skipDupGate.current = false;
    }
  }

  function handleStepsChange(arr: string[]) {
    setStepsArr(arr);
    const filtered = arr.filter((s) => s.trim() !== "");
    const json = filtered.length > 0 ? JSON.stringify(filtered) : "";
    set("steps", json);
  }

  async function handleStepsBlur() {
    const title = fields.title?.trim() ?? "";
    const steps = fields.steps?.trim() ?? "";
    if (title.length <= 10 || steps.length <= 20) return;
    if (dupResult !== null) return;

    setDupChecking(true);
    try {
      const result = await checkDuplicate({
        title,
        steps,
        suiteId:   fields.suiteId ?? undefined,
        excludeId: excludeId      ?? undefined,
      });
      if (result.isDuplicate && result.duplicates.length > 0) {
        setDupResult(result.duplicates);
      }
    } catch {
      // Silent — never block saving on detection failure
    } finally {
      setDupChecking(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (dupResult && dupResult.length > 0 && !skipDupGate.current) {
      return;
    }

    setError("");
    setLoading(true);
    skipDupGate.current = false;
    try {
      await onSubmit(fields);
      router.push("/test-cases");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleSaveAnyway() {
    skipDupGate.current = true;
    setDupResult(null);
    setError("");
    setLoading(true);
    onSubmit(fields)
      .then(() => {
        router.push("/test-cases");
        router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        setLoading(false);
        skipDupGate.current = false;
      });
  }

  function handleDiscard() {
    const reset = defaultFields(initial, initialSuiteId);
    setFields(reset);
    setStepsArr(parseSteps(reset.steps));
    setDupResult(null);
    skipDupGate.current = false;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {initial?.tcId && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#666" }}>Test Case ID</span>
          <span style={{
            fontSize: 13,
            fontFamily: "monospace",
            fontWeight: 700,
            color: "#64b5f6",
            background: "#0d1f33",
            border: "1px solid #1e3a5f",
            borderRadius: 4,
            padding: "3px 10px",
          }}>
            {initial.tcId}
          </span>
        </div>
      )}

      {/* ── SECTION 1: IDENTIFICATION ── */}
      <div style={sectionLabelStyle}>Identification</div>

      <label style={labelStyle}>
        Title *
        <input
          required
          value={fields.title}
          onChange={(e) => set("title", e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        Suite
        <select
          value={fields.suiteId ?? ""}
          onChange={(e) => set("suiteId", e.target.value || null)}
          style={inputStyle}
        >
          <option value="">No suite</option>
          {flatSuites.map((s) => (
            <option key={s.id} value={s.id}>
              {"  ".repeat(s.depth)}{s.depth > 0 ? "└ " : ""}{s.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <label style={labelStyle}>Tags</label>
        <input
          type="text"
          value={fields.tags ?? ""}
          onChange={(e) => setFields(f => ({ ...f, tags: e.target.value }))}
          placeholder="smoke, login, critical (comma separated)"
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
          Separate tags with commas
        </div>
      </div>

      {/* ── SECTION 2: CLASSIFICATION ── */}
      <div style={sectionLabelStyle}>Classification</div>

      <label style={labelStyle}>
        Category *
        <select value={fields.category} onChange={(e) => set("category", e.target.value)} style={inputStyle}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Execution Type *
        <select value={fields.executionType} onChange={(e) => set("executionType", e.target.value)} style={inputStyle}>
          {EXECUTION_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={labelStyle}>
          Priority *
          <select value={fields.priority} onChange={(e) => set("priority", e.target.value)} style={inputStyle}>
            <option value="P1">P1 — Critical</option>
            <option value="P2">P2 — High</option>
            <option value="P3">P3 — Medium</option>
            <option value="P4">P4 — Low</option>
          </select>
        </label>

        <label style={labelStyle}>
          Severity *
          <select value={fields.severity} onChange={(e) => set("severity", e.target.value)} style={inputStyle}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>

      <label style={labelStyle}>
        Status
        <select value={fields.status} onChange={(e) => set("status", e.target.value)} style={inputStyle}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="draft">Draft</option>
        </select>
      </label>

      {/* ── SECTION 3: CONTENT ── */}
      <div style={sectionLabelStyle}>Content</div>

      <label style={labelStyle}>
        Description
        <textarea
          value={fields.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          style={inputStyle}
        />
      </label>

      <div>
        <label style={labelStyle}>Preconditions</label>
        <textarea
          rows={2}
          value={fields.preconditions ?? ""}
          onChange={(e) => setFields(f => ({ ...f, preconditions: e.target.value }))}
          placeholder="User must be logged out. Account must exist."
          style={inputStyle}
        />
      </div>

      <div>
        <span style={{ fontSize: 14, display: "block", marginBottom: 2 }}>Steps</span>
        <StepsEditor
          steps={stepsArr}
          onChange={handleStepsChange}
          onBlur={handleStepsBlur}
        />
      </div>

      {dupChecking && (
        <div style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
          Checking for duplicates…
        </div>
      )}
      {dupResult && dupResult.length > 0 && (
        <DuplicateWarning
          duplicates={dupResult}
          onSaveAnyway={handleSaveAnyway}
          onDiscard={handleDiscard}
        />
      )}

      <label style={labelStyle}>
        Expected Result
        <textarea
          value={fields.expectedResult}
          onChange={(e) => set("expectedResult", e.target.value)}
          rows={3}
          style={inputStyle}
        />
      </label>

      {/* ── SECTION 4: AUTOMATION ── */}
      {(fields.executionType === "automated" || fields.executionType === "api") && (
        <div>
          <div style={sectionLabelStyle}>Automation</div>
          <div>
            <label style={labelStyle}>Automation ID</label>
            <input
              type="text"
              value={fields.automationId ?? ""}
              onChange={(e) => setFields(f => ({ ...f, automationId: e.target.value }))}
              placeholder="e.g. TC_LOGIN_001 or describe('Login', ...)"
              style={inputStyle}
            />
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => router.push("/test-cases")} style={{ ...btnStyle, background: "#555" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#666",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 4,
  marginTop: 8,
  borderBottom: "1px solid #1e1e1e",
  paddingBottom: 6,
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  fontSize: 14,
  boxSizing: "border-box",
  background: "#1a1a1a",
  color: "#eee",
  border: "1px solid #444",
  borderRadius: 4,
};

const stepInputStyle: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 13,
  boxSizing: "border-box",
  background: "#1a1a1a",
  color: "#eee",
  border: "1px solid #333",
  borderRadius: 4,
};

const btnStyle: React.CSSProperties = {
  padding: "8px 18px",
  fontSize: 14,
  background: "#0070f3",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};
