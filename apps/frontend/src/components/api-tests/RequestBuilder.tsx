"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  getSuites,
  getActiveProjectId,
  createApiTest,
  updateApiTest,
  executeApiTest,
  type ApiTest,
  type ApiTestMethod,
  type ApiExecutionResult,
  type AssertionResult,
  type TestSuite,
} from "@/lib/api";
import {
  Plus, Trash2, Loader2, Play, Save, X, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Clock, Code2, Eye, EyeOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KVPair { key: string; value: string }

export type AssertionType = "status" | "jsonPath" | "responseTime" | "header";
export type AssertionOperator = "exists" | "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan";

export interface AssertionDraft {
  id:       string; // local only
  type:     AssertionType;
  value?:   string;
  path?:    string;
  operator?: AssertionOperator;
  name?:    string;
  maxMs?:   string;
}

export interface FormState {
  name:        string;
  description: string;
  suiteId:     string;
  method:      ApiTestMethod;
  url:         string;
  headers:     KVPair[];
  queryParams: KVPair[];
  body:        string;
  assertions:  AssertionDraft[];
  variables:   KVPair[];
}

const METHODS: ApiTestMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

const METHOD_COLORS: Record<ApiTestMethod, string> = {
  GET:    "text-teal-400   bg-teal-950   border-teal-800",
  POST:   "text-violet-400 bg-violet-950 border-violet-800",
  PUT:    "text-amber-400  bg-amber-950  border-amber-800",
  PATCH:  "text-sky-400    bg-sky-950    border-sky-800",
  DELETE: "text-rose-400   bg-rose-950   border-rose-800",
};

const COMMON_HEADERS = [
  { label: "Authorization Bearer", key: "Authorization",  value: "Bearer " },
  { label: "Content-Type JSON",    key: "Content-Type",   value: "application/json" },
  { label: "Accept JSON",          key: "Accept",         value: "application/json" },
  { label: "Content-Type Form",    key: "Content-Type",   value: "application/x-www-form-urlencoded" },
  { label: "X-API-Key",            key: "X-API-Key",      value: "" },
];

const BODY_TEMPLATES = [
  { label: "Empty object",  value: "{\n  \n}" },
  { label: "Empty array",   value: "[\n  \n]" },
  { label: "Auth payload",  value: '{\n  "email": "",\n  "password": ""\n}' },
  { label: "Paginated req", value: '{\n  "page": 1,\n  "limit": 10\n}' },
];

const ASSERTION_OPERATORS: { value: AssertionOperator; label: string }[] = [
  { value: "exists",      label: "exists" },
  { value: "equals",      label: "equals" },
  { value: "notEquals",   label: "not equals" },
  { value: "contains",    label: "contains" },
  { value: "greaterThan", label: "greater than" },
  { value: "lessThan",    label: "less than" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => String(++_uid);

function kvToObject(pairs: KVPair[]): Record<string, string> | undefined {
  const filled = pairs.filter((p) => p.key.trim());
  if (!filled.length) return undefined;
  return Object.fromEntries(filled.map((p) => [p.key.trim(), p.value]));
}

function objectToKv(obj: Record<string, string> | null | undefined): KVPair[] {
  if (!obj) return [];
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
}

function assertionToApi(a: AssertionDraft): Record<string, unknown> {
  switch (a.type) {
    case "status":       return { type: "status",       value: Number(a.value) };
    case "responseTime": return { type: "responseTime", maxMs: Number(a.maxMs) };
    case "header":       return { type: "header",       name: a.name, operator: a.operator ?? "exists", value: a.value };
    case "jsonPath":     return { type: "jsonPath",      path: a.path, operator: a.operator ?? "exists", value: a.value };
  }
}

function buildUrlPreview(url: string, params: KVPair[]): string {
  const filled = params.filter((p) => p.key.trim());
  if (!filled.length) return url;
  const qs = filled.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
  return `${url}${url.includes("?") ? "&" : "?"}${qs}`;
}

function validateForm(f: FormState): string[] {
  const errors: string[] = [];
  if (!f.name.trim() || f.name.trim().length < 3)  errors.push("Name must be at least 3 characters");
  if (f.name.trim().length > 100)                   errors.push("Name must be under 100 characters");
  if (!f.url.trim())                                errors.push("URL is required");
  if (!f.assertions.length)                         errors.push("At least one assertion is required");
  if (f.body.trim() && ["POST","PUT","PATCH"].includes(f.method)) {
    try { JSON.parse(f.body); } catch { errors.push("Body must be valid JSON"); }
  }
  return errors;
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const glassPanel = "rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm";

function SectionHeader({
  title, subtitle, open, onToggle, accent,
}: { title: string; subtitle?: string; open?: boolean; onToggle?: () => void; accent?: string }) {
  const El = onToggle ? "button" : "div";
  return (
    <El
      {...(onToggle ? { onClick: onToggle, type: "button" } : {})}
      className={cn(
        "flex items-center justify-between w-full px-5 py-4",
        onToggle && "hover:bg-white/[0.02] transition-colors",
      )}
    >
      <div className="flex items-center gap-3">
        {accent && <div className={cn("w-1 h-5 rounded-full", accent)} />}
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {onToggle && (open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />)}
    </El>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-slate-400 mb-1.5">
      {children}{required && <span className="text-rose-400 ml-0.5">*</span>}
    </label>
  );
}

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-foreground placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 transition-colors";

// ── KV Editor ─────────────────────────────────────────────────────────────────

function KVEditor({
  pairs, onChange, addLabel, keyPlaceholder, valPlaceholder, presets, monoKey, monoVal,
}: {
  pairs:          KVPair[];
  onChange:       (pairs: KVPair[]) => void;
  addLabel:       string;
  keyPlaceholder?: string;
  valPlaceholder?: string;
  presets?:       { label: string; key: string; value: string }[];
  monoKey?:       boolean;
  monoVal?:       boolean;
}) {
  function update(i: number, field: "key" | "value", val: string) {
    onChange(pairs.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  }
  function remove(i: number) { onChange(pairs.filter((_, idx) => idx !== i)); }
  function add()              { onChange([...pairs, { key: "", value: "" }]); }
  function addPreset(p: { key: string; value: string }) {
    onChange([...pairs, { key: p.key, value: p.value }]);
  }

  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-2 items-center group">
          <input
            value={p.key}
            onChange={(e) => update(i, "key", e.target.value)}
            placeholder={keyPlaceholder ?? "Key"}
            className={cn(inputClass, "flex-1", monoKey && "font-mono text-xs")}
          />
          <input
            value={p.value}
            onChange={(e) => update(i, "value", e.target.value)}
            placeholder={valPlaceholder ?? "Value"}
            className={cn(inputClass, "flex-[2]", monoVal && "font-mono text-xs")}
          />
          <button
            type="button" onClick={() => remove(i)}
            className="p-1.5 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button" onClick={add}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />{addLabel}
        </button>
        {presets && presets.length > 0 && (
          <div className="relative group/presets">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Presets <ChevronDown className="h-3 w-3" />
            </button>
            <div className="absolute left-0 top-full mt-1 z-20 hidden group-hover/presets:block w-56 rounded-lg border border-white/[0.08] bg-[rgba(15,15,25,0.97)] backdrop-blur-sm shadow-xl py-1">
              {presets.map((pr) => (
                <button
                  key={pr.label} type="button"
                  onClick={() => addPreset(pr)}
                  className="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06] transition-colors"
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Assertion row ─────────────────────────────────────────────────────────────

const ASSERTION_TYPE_STYLES: Record<AssertionType, string> = {
  status:       "text-teal-400   bg-teal-950/60   border-teal-800/60",
  jsonPath:     "text-violet-400 bg-violet-950/60 border-violet-800/60",
  responseTime: "text-amber-400  bg-amber-950/60  border-amber-800/60",
  header:       "text-sky-400    bg-sky-950/60    border-sky-800/60",
};
const ASSERTION_TYPE_LABELS: Record<AssertionType, string> = {
  status: "Status", jsonPath: "JSONPath", responseTime: "Response Time", header: "Header",
};

function AssertionRow({ a, onChange, onDelete }: {
  a:        AssertionDraft;
  onChange: (patch: Partial<AssertionDraft>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg bg-white/[0.025] border border-white/[0.05] group">
      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0", ASSERTION_TYPE_STYLES[a.type])}>
        {ASSERTION_TYPE_LABELS[a.type]}
      </span>

      {a.type === "status" && (
        <input
          value={a.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="200"
          className={cn(inputClass, "w-24 font-mono")}
        />
      )}

      {a.type === "responseTime" && (
        <>
          <span className="text-xs text-slate-500">max</span>
          <input
            value={a.maxMs ?? ""}
            onChange={(e) => onChange({ maxMs: e.target.value })}
            placeholder="1000"
            className={cn(inputClass, "w-24 font-mono")}
          />
          <span className="text-xs text-slate-500">ms</span>
        </>
      )}

      {a.type === "header" && (
        <>
          <input
            value={a.name ?? ""}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Header name"
            className={cn(inputClass, "w-40 font-mono text-xs")}
          />
          <select
            value={a.operator ?? "exists"}
            onChange={(e) => onChange({ operator: e.target.value as AssertionOperator })}
            className={cn(inputClass, "w-36")}
          >
            {ASSERTION_OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
          {a.operator !== "exists" && (
            <input
              value={a.value ?? ""}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="Expected value"
              className={cn(inputClass, "flex-1 min-w-[120px] font-mono text-xs")}
            />
          )}
        </>
      )}

      {a.type === "jsonPath" && (
        <>
          <input
            value={a.path ?? ""}
            onChange={(e) => onChange({ path: e.target.value })}
            placeholder="$.data.id"
            className={cn(inputClass, "w-40 font-mono text-xs")}
          />
          <select
            value={a.operator ?? "exists"}
            onChange={(e) => onChange({ operator: e.target.value as AssertionOperator })}
            className={cn(inputClass, "w-36")}
          >
            {ASSERTION_OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
          {a.operator !== "exists" && (
            <input
              value={a.value ?? ""}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="Expected value"
              className={cn(inputClass, "flex-1 min-w-[120px] font-mono text-xs")}
            />
          )}
        </>
      )}

      <button
        type="button" onClick={onDelete}
        className="ml-auto p-1.5 rounded text-slate-600 hover:text-rose-400 hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition-all shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Execution Result Modal ────────────────────────────────────────────────────

function ExecutionModal({
  result, onClose, onSaveAnyway,
}: { result: ApiExecutionResult; onClose: () => void; onSaveAnyway?: () => void }) {
  const [showHeaders, setShowHeaders] = useState(false);
  const [showBody,    setShowBody]    = useState(true);

  const bodyStr = (() => {
    if (result.responseBody == null) return "";
    if (typeof result.responseBody === "string") return result.responseBody;
    try { return JSON.stringify(result.responseBody, null, 2); } catch { return String(result.responseBody); }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className={cn(glassPanel, "w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl")}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            {result.status === "pass"  && <CheckCircle2 className="h-5 w-5 text-teal-400"  />}
            {result.status === "fail"  && <XCircle      className="h-5 w-5 text-rose-400"  />}
            {result.status === "error" && <AlertCircle  className="h-5 w-5 text-amber-400" />}
            <div>
              <p className={cn("text-sm font-semibold", result.status === "pass" ? "text-teal-400" : result.status === "fail" ? "text-rose-400" : "text-amber-400")}>
                {result.status === "pass" ? "All assertions passed" : result.status === "fail" ? "Assertions failed" : "Execution error"}
              </p>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                {result.responseStatus != null && <span>HTTP {result.responseStatus}</span>}
                {result.responseTime   != null && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{result.responseTime}ms</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/[0.06] text-slate-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Error */}
          {result.error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300 font-mono">
              {result.error}
            </div>
          )}

          {/* Assertion Results */}
          {result.assertionResults.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Assertions</p>
              <div className="space-y-1.5">
                {result.assertionResults.map((ar, i) => (
                  <AssertionResultRow key={i} ar={ar} />
                ))}
              </div>
            </div>
          )}

          {/* Response Headers */}
          {result.responseHeaders && Object.keys(result.responseHeaders).length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowHeaders((v) => !v)}
                className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors"
              >
                {showHeaders ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Response Headers ({Object.keys(result.responseHeaders).length})
              </button>
              {showHeaders && (
                <div className="mt-2 rounded-lg bg-white/[0.02] border border-white/[0.05] divide-y divide-white/[0.04]">
                  {Object.entries(result.responseHeaders).map(([k, v]) => (
                    <div key={k} className="flex gap-3 px-3 py-2 text-xs font-mono">
                      <span className="text-slate-500 shrink-0 w-48 truncate">{k}</span>
                      <span className="text-slate-300 truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Response Body */}
          {bodyStr && (
            <div>
              <button
                type="button"
                onClick={() => setShowBody((v) => !v)}
                className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors"
              >
                {showBody ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                Response Body
              </button>
              {showBody && (
                <pre className="mt-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs font-mono text-slate-300 overflow-x-auto max-h-52 overflow-y-auto whitespace-pre-wrap break-all">
                  {bodyStr}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06] shrink-0">
          {onSaveAnyway && result.status !== "pass" && (
            <button
              type="button" onClick={onSaveAnyway}
              className="px-4 py-2 rounded-lg text-sm text-amber-400 border border-amber-800/60 bg-amber-950/40 hover:bg-amber-950 transition-colors"
            >
              Save Anyway
            </button>
          )}
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-foreground border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function AssertionResultRow({ ar }: { ar: AssertionResult }) {
  const a = ar.assertion as any;
  let label = "";
  if (a.type === "status")       label = `Status = ${a.value}`;
  if (a.type === "responseTime") label = `Response time ≤ ${a.maxMs}ms`;
  if (a.type === "header")       label = `Header ${a.name} ${a.operator}${a.value ? ` "${a.value}"` : ""}`;
  if (a.type === "jsonPath")     label = `${a.path} ${a.operator}${a.value ? ` "${a.value}"` : ""}`;

  return (
    <div className={cn(
      "flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs",
      ar.passed ? "bg-teal-950/30 border-teal-800/40" : "bg-rose-950/30 border-rose-800/40",
    )}>
      {ar.passed
        ? <CheckCircle2 className="h-3.5 w-3.5 text-teal-400 mt-0.5 shrink-0" />
        : <XCircle      className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium", ar.passed ? "text-teal-300" : "text-rose-300")}>{label}</p>
        <p className="text-slate-500 mt-0.5">{ar.message}</p>
        {!ar.passed && ar.actual !== undefined && (
          <p className="text-slate-600 mt-0.5 font-mono">actual: {JSON.stringify(ar.actual)}</p>
        )}
      </div>
    </div>
  );
}

// ── URL Preview ───────────────────────────────────────────────────────────────

function UrlPreview({ url, params }: { url: string; params: KVPair[] }) {
  const preview = buildUrlPreview(url, params);
  if (!preview) return null;

  // Highlight ${variable} tokens
  const parts = preview.split(/(\$\{\w+\})/g);

  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <Eye className="h-3.5 w-3.5 text-slate-600 mt-0.5 shrink-0" />
      <p className="text-xs font-mono text-slate-500 break-all leading-5">
        {parts.map((part, i) =>
          part.startsWith("${") ? (
            <span key={i} className="text-violet-400">{part}</span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    </div>
  );
}

// ── Main RequestBuilder ───────────────────────────────────────────────────────

export interface RequestBuilderProps {
  mode:       "create" | "edit";
  initial?:   ApiTest;
  projectId:  string;
}

export default function RequestBuilder({ mode, initial, projectId }: RequestBuilderProps) {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(() => {
    if (initial) {
      return {
        name:        initial.name,
        description: initial.description ?? "",
        suiteId:     initial.suiteId     ?? "",
        method:      initial.method,
        url:         initial.url,
        headers:     objectToKv(initial.headers as any),
        queryParams: objectToKv(initial.queryParams as any),
        body:        initial.body ? JSON.stringify(initial.body, null, 2) : "",
        assertions:  ((initial.assertions ?? []) as any[]).map((a: any) => ({
          id:       uid(),
          type:     a.type,
          value:    a.value != null ? String(a.value) : undefined,
          path:     a.path,
          operator: a.operator,
          name:     a.name,
          maxMs:    a.maxMs != null ? String(a.maxMs) : undefined,
        })),
        variables: objectToKv(initial.variables as any),
      };
    }
    return {
      name: "", description: "", suiteId: "", method: "GET", url: "",
      headers: [], queryParams: [], body: "", assertions: [], variables: [],
    };
  });

  const [suites,          setSuites]          = useState<TestSuite[]>([]);
  const [errors,          setErrors]          = useState<string[]>([]);
  const [saving,          setSaving]          = useState(false);
  const [testing,         setTesting]         = useState(false);
  const [testAndSaving,   setTestAndSaving]   = useState(false);
  const [execResult,      setExecResult]      = useState<ApiExecutionResult | null>(null);
  const [pendingSave,     setPendingSave]      = useState(false);
  const [showAssertions,  setShowAssertions]  = useState(true);
  const [showVariables,   setShowVariables]   = useState(form.variables.length > 0);
  const [bodyFormatErr,   setBodyFormatErr]   = useState("");
  const [savedId,         setSavedId]         = useState<string | null>(initial?.id ?? null);

  useEffect(() => {
    getSuites(projectId).then(setSuites).catch(() => {});
  }, [projectId]);

  const patch = useCallback((p: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...p }));
    setErrors([]);
  }, []);

  function updateAssertion(id: string, p: Partial<AssertionDraft>) {
    setForm((prev) => ({
      ...prev,
      assertions: prev.assertions.map((a) => a.id === id ? { ...a, ...p } : a),
    }));
  }
  function removeAssertion(id: string) {
    setForm((prev) => ({ ...prev, assertions: prev.assertions.filter((a) => a.id !== id) }));
  }
  function addAssertion(type: AssertionType) {
    const draft: AssertionDraft = { id: uid(), type, operator: "exists" };
    setForm((prev) => ({ ...prev, assertions: [...prev.assertions, draft] }));
  }

  function formatBody() {
    try {
      const pretty = JSON.stringify(JSON.parse(form.body), null, 2);
      patch({ body: pretty });
      setBodyFormatErr("");
    } catch {
      setBodyFormatErr("Invalid JSON — cannot format");
    }
  }

  function buildPayload() {
    let parsedBody: unknown = undefined;
    if (form.body.trim() && ["POST","PUT","PATCH"].includes(form.method)) {
      try { parsedBody = JSON.parse(form.body); } catch { /* caught by validation */ }
    }
    return {
      projectId,
      name:        form.name.trim(),
      description: form.description.trim() || undefined,
      method:      form.method,
      url:         form.url.trim(),
      headers:     kvToObject(form.headers)     ?? null,
      queryParams: kvToObject(form.queryParams) ?? null,
      body:        parsedBody ?? null,
      assertions:  form.assertions.map(assertionToApi),
      suiteId:     form.suiteId || null,
      variables:   kvToObject(form.variables as KVPair[]) ?? null,
    } as any;
  }

  async function ensureSaved(): Promise<string | null> {
    const payload = buildPayload();
    if (mode === "edit" && savedId) {
      const updated = await updateApiTest(savedId, payload);
      return updated.id;
    } else {
      const created = await createApiTest(payload);
      setSavedId(created.id);
      return created.id;
    }
  }

  async function handleSave() {
    const errs = validateForm(form);
    if (errs.length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await ensureSaved();
      router.push("/api-tests");
    } catch (err: any) {
      setErrors([err?.message ?? "Save failed"]);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    const errs = validateForm(form);
    if (errs.length) { setErrors(errs); return; }
    setTesting(true);
    try {
      let testId = savedId;
      if (!testId) {
        // Need to save first to get an ID for execute endpoint
        testId = await ensureSaved();
      }
      if (!testId) throw new Error("Could not save test before executing");
      const vars = kvToObject(form.variables as KVPair[]);
      const result = await executeApiTest(testId, { variables: vars ?? undefined });
      setExecResult(result);
    } catch (err: any) {
      setErrors([err?.message ?? "Execution failed"]);
    } finally {
      setTesting(false);
    }
  }

  async function handleTestAndSave() {
    const errs = validateForm(form);
    if (errs.length) { setErrors(errs); return; }
    setTestAndSaving(true);
    try {
      const testId = await ensureSaved();
      if (!testId) throw new Error("Could not save test");
      const vars = kvToObject(form.variables as KVPair[]);
      const result = await executeApiTest(testId, { variables: vars ?? undefined });
      setExecResult(result);
      if (result.status === "pass") {
        router.push("/api-tests");
      } else {
        setPendingSave(true); // offer "Save Anyway"
      }
    } catch (err: any) {
      setErrors([err?.message ?? "Test & Save failed"]);
    } finally {
      setTestAndSaving(false);
    }
  }

  const showBody = ["POST","PUT","PATCH"].includes(form.method);

  return (
    <div className="space-y-4 pb-28">
      {/* ── Validation errors ── */}
      {errors.length > 0 && (
        <div className="flex flex-col gap-1 p-4 rounded-xl bg-rose-950/40 border border-rose-800/40">
          {errors.map((e, i) => (
            <p key={i} className="text-sm text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{e}
            </p>
          ))}
        </div>
      )}

      {/* ── Section 1: Basic Info ── */}
      <div className={glassPanel}>
        <SectionHeader title="Basic Information" accent="bg-gradient-to-b from-violet-500 to-violet-700" />
        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <FieldLabel required>Name</FieldLabel>
            <input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Get user profile"
              className={inputClass}
              maxLength={100}
            />
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="What does this test verify?"
              rows={2}
              className={cn(inputClass, "resize-none")}
            />
          </div>
          <div>
            <FieldLabel>Suite</FieldLabel>
            <select
              value={form.suiteId}
              onChange={(e) => patch({ suiteId: e.target.value })}
              className={inputClass}
            >
              <option value="">— No suite —</option>
              {suites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Section 2: Request Config ── */}
      <div className={glassPanel}>
        <SectionHeader title="Request" subtitle="HTTP method, URL, headers and body" accent="bg-gradient-to-b from-teal-500 to-teal-700" />
        <div className="px-5 pb-5 space-y-5">

          {/* Method + URL */}
          <div>
            <FieldLabel required>Method & URL</FieldLabel>
            <div className="flex gap-2">
              <select
                value={form.method}
                onChange={(e) => patch({ method: e.target.value as ApiTestMethod })}
                className={cn(
                  "px-3 py-2 rounded-lg border text-sm font-bold tracking-wider focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-colors shrink-0 w-28",
                  METHOD_COLORS[form.method],
                )}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m} className="text-foreground bg-background">{m}</option>
                ))}
              </select>
              <input
                value={form.url}
                onChange={(e) => patch({ url: e.target.value })}
                placeholder="https://api.example.com/users/${userId}"
                className={cn(inputClass, "flex-1 font-mono text-sm")}
              />
            </div>
          </div>

          {/* URL preview */}
          {(form.url || form.queryParams.some((p) => p.key)) && (
            <UrlPreview url={form.url} params={form.queryParams} />
          )}

          {/* Query Params */}
          <div>
            <FieldLabel>Query Parameters</FieldLabel>
            <KVEditor
              pairs={form.queryParams}
              onChange={(v) => patch({ queryParams: v })}
              addLabel="Add param"
              keyPlaceholder="param"
              valPlaceholder="value"
              monoKey
            />
          </div>

          {/* Headers */}
          <div>
            <FieldLabel>Headers</FieldLabel>
            <KVEditor
              pairs={form.headers}
              onChange={(v) => patch({ headers: v })}
              addLabel="Add header"
              keyPlaceholder="Header name"
              valPlaceholder="Value"
              presets={COMMON_HEADERS}
              monoKey
            />
          </div>

          {/* Body */}
          {showBody && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <FieldLabel>Body (JSON)</FieldLabel>
                <div className="flex items-center gap-2">
                  {bodyFormatErr && <span className="text-xs text-rose-400">{bodyFormatErr}</span>}
                  <button
                    type="button" onClick={formatBody}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition-colors"
                  >
                    <Code2 className="h-3.5 w-3.5" />Format
                  </button>
                  <div className="relative group/tpl">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      Templates <ChevronDown className="h-3 w-3" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 z-20 hidden group-hover/tpl:block w-48 rounded-lg border border-white/[0.08] bg-[rgba(15,15,25,0.97)] backdrop-blur-sm shadow-xl py-1">
                      {BODY_TEMPLATES.map((t) => (
                        <button
                          key={t.label} type="button"
                          onClick={() => patch({ body: t.value })}
                          className="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.06] transition-colors"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <textarea
                value={form.body}
                onChange={(e) => patch({ body: e.target.value })}
                placeholder={'{\n  "key": "value"\n}'}
                rows={8}
                className={cn(inputClass, "font-mono text-xs resize-y")}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: Assertions ── */}
      <div className={glassPanel}>
        <SectionHeader
          title="Assertions"
          subtitle={`${form.assertions.length} assertion${form.assertions.length !== 1 ? "s" : ""} — at least 1 required`}
          open={showAssertions}
          onToggle={() => setShowAssertions((v) => !v)}
          accent="bg-gradient-to-b from-amber-500 to-amber-700"
        />
        {showAssertions && (
          <div className="px-5 pb-5 space-y-3">
            {form.assertions.length === 0 && (
              <p className="text-sm text-slate-600 italic">No assertions yet. Add one below.</p>
            )}
            {form.assertions.map((a) => (
              <AssertionRow
                key={a.id}
                a={a}
                onChange={(p) => updateAssertion(a.id, p)}
                onDelete={() => removeAssertion(a.id)}
              />
            ))}

            {/* Add assertion buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              {(["status","jsonPath","responseTime","header"] as AssertionType[]).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => addAssertion(t)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors",
                    ASSERTION_TYPE_STYLES[t].replace("bg-", "hover:bg-"),
                    "border-white/[0.06] hover:border-white/[0.12] text-slate-400 hover:text-foreground",
                  )}
                >
                  <Plus className="h-3 w-3" />
                  {ASSERTION_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4: Variables ── */}
      <div className={glassPanel}>
        <SectionHeader
          title="Variables"
          subtitle="Use ${varName} in URL, headers, or body"
          open={showVariables}
          onToggle={() => setShowVariables((v) => !v)}
          accent="bg-gradient-to-b from-sky-500 to-sky-700"
        />
        {showVariables && (
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs text-slate-600">
              Define values here and reference them as{" "}
              <code className="text-violet-400 bg-violet-950/40 px-1 py-0.5 rounded">{"${varName}"}</code>{" "}
              anywhere in the request.
            </p>
            <KVEditor
              pairs={form.variables}
              onChange={(v) => patch({ variables: v })}
              addLabel="Add variable"
              keyPlaceholder="variableName"
              valPlaceholder="value"
              monoKey
              monoVal
            />
          </div>
        )}
      </div>

      {/* ── Sticky Action Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[rgba(10,10,15,0.92)] backdrop-blur-md px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Test actions */}
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={handleTest} disabled={testing || testAndSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-950/60 hover:bg-violet-900/60 text-violet-300 border border-violet-800/60 hover:border-violet-700 text-sm font-medium transition-all disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Test
            </button>
            <button
              type="button" onClick={handleTestAndSave} disabled={testing || testAndSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white border border-teal-600 text-sm font-medium transition-all disabled:opacity-50"
            >
              {testAndSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Test & Save
            </button>
          </div>

          {/* Right: Save/Cancel */}
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={() => router.push("/api-tests")}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-foreground border border-white/[0.06] hover:border-white/[0.12] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-foreground border border-white/[0.08] text-sm font-medium transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mode === "edit" ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Execution Result Modal ── */}
      {execResult && (
        <ExecutionModal
          result={execResult}
          onClose={() => { setExecResult(null); setPendingSave(false); }}
          onSaveAnyway={pendingSave ? () => { setExecResult(null); router.push("/api-tests"); } : undefined}
        />
      )}
    </div>
  );
}
