"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  getSuites,
  checkDuplicate,
  getActiveProjectId,
  type TestCase,
  type TestCasePayload,
  type TestSuite,
  type DuplicateMatch,
} from "../lib/api";

interface Props {
  initial?:        TestCase;
  initialSuiteId?: string | null;
  excludeId?:      string;
  onSubmit:        (data: TestCasePayload) => Promise<unknown>;
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

function parseSteps(raw?: string): string[] {
  if (!raw?.trim()) return [""];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr.map(String);
  } catch {}
  return [raw];
}

// ── Steps editor ──────────────────────────────────────────────────────────────

function StepsEditor({ steps, onChange, onBlur }: {
  steps:    string[];
  onChange: (steps: string[]) => void;
  onBlur:   () => void;
}) {
  function update(idx: number, value: string) {
    onChange(steps.map((s, i) => (i === idx ? value : s)));
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
    <div className="flex flex-col gap-1.5 mt-1">
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 min-w-5 text-right shrink-0 select-none">
            {idx + 1}.
          </span>
          <input
            data-step-input
            value={step}
            onChange={(e) => update(idx, e.target.value)}
            onBlur={onBlur}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            placeholder={`Step ${idx + 1}…`}
            className="flex-1 px-2 py-1 text-[13px] bg-card text-foreground border border-slate-600 rounded focus:outline-none focus:border-primary transition-colors"
          />
          <button
            type="button"
            onClick={() => removeStep(idx)}
            disabled={steps.length === 1 && step === ""}
            title="Remove step"
            className={cn(
              "border border-border text-slate-500 rounded w-6 h-6 cursor-pointer text-sm leading-none shrink-0 hover:text-red-400 hover:border-red-800 transition-colors",
              steps.length === 1 && step === "" ? "opacity-30 cursor-not-allowed" : ""
            )}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addStep}
        className="self-start mt-0.5 border border-dashed border-border text-slate-500 rounded px-2.5 py-0.5 text-xs cursor-pointer hover:text-foreground hover:border-slate-500 transition-colors"
      >
        + Add step
      </button>
    </div>
  );
}

// ── Similarity badge ──────────────────────────────────────────────────────────

function SimilarityBadge({ level }: { level: "high" | "medium" }) {
  const classes = {
    high:   "bg-red-950 text-red-400 border-red-800",
    medium: "bg-amber-950/40 text-orange-400 border-amber-800",
  };
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border shrink-0", classes[level])}>
      {level}
    </span>
  );
}

// ── Duplicate warning banner ──────────────────────────────────────────────────

function DuplicateWarning({ duplicates, onSaveAnyway, onDiscard }: {
  duplicates:   DuplicateMatch[];
  onSaveAnyway: () => void;
  onDiscard:    () => void;
}) {
  return (
    <div className="bg-amber-950/20 border border-amber-700 rounded-md px-4 py-3.5 mt-2">
      <div className="text-[13px] font-semibold text-orange-400 mb-2.5">
        ⚠ Similar test cases found:
      </div>

      <div className="flex flex-col gap-2 mb-3">
        {duplicates.map((dup) => (
          <div key={dup.id} className="bg-background border border-slate-800 rounded px-2.5 py-2">
            <div className="flex items-center gap-2 mb-1">
              <SimilarityBadge level={dup.similarity} />
              <span className="text-[13px] text-foreground overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                {dup.title.length > 60 ? dup.title.slice(0, 60) + "…" : dup.title}
              </span>
              <a
                href={`/test-cases/${dup.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 no-underline shrink-0 hover:underline"
              >
                View
              </a>
            </div>
            <div className="text-xs text-slate-500">{dup.reason}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 m-0 mb-2.5">
        This may be a duplicate. You can still save if it&apos;s intentional.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSaveAnyway}
          className="px-3.5 py-1.5 text-xs bg-primary text-primary-foreground border-none rounded cursor-pointer font-semibold hover:bg-primary/90 transition-colors"
        >
          Save anyway
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-3.5 py-1.5 text-xs bg-transparent text-slate-400 border border-border rounded cursor-pointer hover:text-foreground transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ── Flatten suites tree ───────────────────────────────────────────────────────

const flattenSuites = (list: TestSuite[], depth = 0): { id: string; name: string; depth: number }[] => {
  const result: { id: string; name: string; depth: number }[] = [];
  for (const s of list) {
    result.push({ id: s.id, name: s.name, depth });
    if (s.children?.length) result.push(...flattenSuites(s.children, depth + 1));
  }
  return result;
};

// ── Main form ─────────────────────────────────────────────────────────────────

export default function TestCaseForm({ initial, initialSuiteId, excludeId, onSubmit }: Props) {
  const router  = useRouter();
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [suites,  setSuites]  = useState<TestSuite[]>([]);

  const [fields, setFields] = useState<TestCasePayload>(() => defaultFields(initial, initialSuiteId));
  const flatSuites = flattenSuites(suites);

  const [stepsArr, setStepsArr] = useState<string[]>(() =>
    parseSteps(defaultFields(initial, initialSuiteId).steps),
  );

  const [dupChecking, setDupChecking] = useState(false);
  const [dupResult,   setDupResult]   = useState<DuplicateMatch[] | null>(null);
  const skipDupGate = useRef(false);

  useEffect(() => {
    getSuites(getActiveProjectId() ?? undefined).then(setSuites).catch(console.error);
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
    set("steps", filtered.length > 0 ? JSON.stringify(filtered) : "");
  }

  async function handleStepsBlur() {
    const title = fields.title?.trim() ?? "";
    const steps = fields.steps?.trim() ?? "";
    if (title.length <= 10 || steps.length <= 20 || dupResult !== null) return;
    setDupChecking(true);
    try {
      const result = await checkDuplicate({
        title, steps,
        suiteId: fields.suiteId ?? undefined,
        excludeId: excludeId ?? undefined,
      });
      if (result.isDuplicate && result.duplicates.length > 0) {
        setDupResult(result.duplicates);
      }
    } catch {
      // Silent
    } finally {
      setDupChecking(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (dupResult && dupResult.length > 0 && !skipDupGate.current) return;
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
      .then(() => { router.push("/test-cases"); router.refresh(); })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : "Something went wrong"); })
      .finally(() => { setLoading(false); skipDupGate.current = false; });
  }

  function handleDiscard() {
    const reset = defaultFields(initial, initialSuiteId);
    setFields(reset);
    setStepsArr(parseSteps(reset.steps));
    setDupResult(null);
    skipDupGate.current = false;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-[560px]">
      {error && <p className="text-destructive">{error}</p>}

      {initial?.tcId && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Test Case ID</span>
          <span className="text-[13px] font-mono font-bold text-blue-400 bg-blue-950/30 border border-blue-900 rounded px-2.5 py-0.5">
            {initial.tcId}
          </span>
        </div>
      )}

      <div className={sectionLabelClass}>Identification</div>

      <label className="block text-sm">
        Title *
        <input required value={fields.title} onChange={(e) => set("title", e.target.value)} className={inputClass} />
      </label>

      <label className="block text-sm">
        Suite
        <select value={fields.suiteId ?? ""} onChange={(e) => set("suiteId", e.target.value || null)} className={inputClass}>
          <option value="">No suite</option>
          {flatSuites.map((s) => (
            <option key={s.id} value={s.id}>
              {"  ".repeat(s.depth)}{s.depth > 0 ? "└ " : ""}{s.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <label className="block text-sm">Tags</label>
        <input
          type="text"
          value={fields.tags ?? ""}
          onChange={(e) => setFields(f => ({ ...f, tags: e.target.value }))}
          placeholder="smoke, login, critical (comma separated)"
          className={inputClass}
        />
        <div className="text-[11px] text-slate-500 mt-1">Separate tags with commas</div>
      </div>

      <div className={sectionLabelClass}>Classification</div>

      <label className="block text-sm">
        Category *
        <select value={fields.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Execution Type *
        <select value={fields.executionType} onChange={(e) => set("executionType", e.target.value)} className={inputClass}>
          {EXECUTION_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Priority *
          <select value={fields.priority} onChange={(e) => set("priority", e.target.value)} className={inputClass}>
            <option value="P1">P1 — Critical</option>
            <option value="P2">P2 — High</option>
            <option value="P3">P3 — Medium</option>
            <option value="P4">P4 — Low</option>
          </select>
        </label>
        <label className="block text-sm">
          Severity *
          <select value={fields.severity} onChange={(e) => set("severity", e.target.value)} className={inputClass}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        Status
        <select value={fields.status} onChange={(e) => set("status", e.target.value)} className={inputClass}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="draft">Draft</option>
        </select>
      </label>

      <div className={sectionLabelClass}>Content</div>

      <label className="block text-sm">
        Description
        <textarea value={fields.description} onChange={(e) => set("description", e.target.value)} rows={3} className={inputClass} />
      </label>

      <div>
        <label className="block text-sm">Preconditions</label>
        <textarea
          rows={2}
          value={fields.preconditions ?? ""}
          onChange={(e) => setFields(f => ({ ...f, preconditions: e.target.value }))}
          placeholder="User must be logged out. Account must exist."
          className={inputClass}
        />
      </div>

      <div>
        <span className="text-sm block mb-0.5">Steps</span>
        <StepsEditor steps={stepsArr} onChange={handleStepsChange} onBlur={handleStepsBlur} />
      </div>

      {dupChecking && (
        <div className="text-xs text-slate-500 flex items-center gap-1.5">
          <span className="animate-spin inline-block">⟳</span>
          Checking for duplicates…
        </div>
      )}
      {dupResult && dupResult.length > 0 && (
        <DuplicateWarning duplicates={dupResult} onSaveAnyway={handleSaveAnyway} onDiscard={handleDiscard} />
      )}

      <label className="block text-sm">
        Expected Result
        <textarea value={fields.expectedResult} onChange={(e) => set("expectedResult", e.target.value)} rows={3} className={inputClass} />
      </label>

      {(fields.executionType === "automated" || fields.executionType === "api") && (
        <div>
          <div className={sectionLabelClass}>Automation</div>
          <div>
            <label className="block text-sm">Automation ID</label>
            <input
              type="text"
              value={fields.automationId ?? ""}
              onChange={(e) => setFields(f => ({ ...f, automationId: e.target.value }))}
              placeholder="e.g. TC_LOGIN_001 or describe('Login', ...)"
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-primary text-primary-foreground border-none rounded cursor-pointer hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {loading ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => router.push("/test-cases")} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-sm font-medium transition-colors cursor-pointer">
          Cancel
        </button>
      </div>
    </form>
  );
}

const sectionLabelClass =
  "text-[11px] text-slate-500 uppercase tracking-[0.08em] mb-1 mt-2 border-b border-slate-900 pb-1.5";

const inputClass =
  "block w-full mt-1 px-2 py-1.5 text-sm box-border bg-card text-foreground border border-slate-600 rounded focus:outline-none focus:border-primary transition-colors";
