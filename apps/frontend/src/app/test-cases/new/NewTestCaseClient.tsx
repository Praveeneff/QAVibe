"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import TestCaseForm from "../../../components/TestCaseForm";
import { createTestCase, getSuites, createSuite, getActiveProjectId, handle401Redirect, type TestSuite } from "../../../lib/api";
import type { TestCase } from "../../../lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getStoredToken } from "@/context/AuthContext";

type CaseTag = "smoke" | "sanity" | "regression";

interface GeneratedCase {
  title: string;
  description?: string;
  steps?: string[];
  expectedResult?: string;
  preconditions?: string;
  tags?: string;
  priority?: string;
  severity?: string;
  tag: CaseTag;
}

function autoTag(title: string): CaseTag {
  const t = title.toLowerCase();
  if (t.includes("success") || t.includes("valid login") || t.includes("happy path")) return "smoke";
  if (t.includes("validation") || t.includes("error") || t.includes("invalid") || t.includes("fail")) return "regression";
  return "sanity";
}

type Provider = "gemini" | "openai" | "claude" | "openrouter";

// ── Prompt templates ─────────────────────────────────────────────────────────

interface PromptTemplate {
  id: string;
  label: string;
  text: string;
}

const PRESET_TEMPLATES: PromptTemplate[] = [
  { id: "__edge__",     label: "Edge cases",    text: "Generate edge case and boundary condition tests for: " },
  { id: "__negative__", label: "Negative paths", text: "Generate negative path and error handling tests for: " },
  { id: "__happy__",    label: "Happy path",     text: "Generate happy path tests covering the main user flow for: " },
];

const LS_KEY = "qavibe_prompt_templates";

function loadSavedTemplates(): PromptTemplate[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); }
  catch { return []; }
}

function saveSavedTemplates(templates: PromptTemplate[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(templates));
}

function stepsToText(steps?: string[]): string {
  return Array.isArray(steps) ? steps.join("\n") : "";
}

function textToSteps(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

interface Props {
  initialSuiteId?: string;
}

export default function NewTestCaseClient({ initialSuiteId }: Props) {
  const { loading } = useRequireAuth();
  const [requirement, setRequirement] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [provider, setProvider] = useState<Provider>("gemini");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [genSuccess, setGenSuccess] = useState(false);
  const [quotaExhausted, setQuotaExhausted] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const requirementRef = useRef<HTMLTextAreaElement>(null);
  const [savedTemplates, setSavedTemplates] = useState<PromptTemplate[]>(() => loadSavedTemplates());
  const [suggestions, setSuggestions] = useState<GeneratedCase[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [formInitial, setFormInitial] = useState<TestCase | undefined>();
  const [formKey, setFormKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [suggestedSuite, setSuggestedSuite] = useState<string>("");
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>(initialSuiteId ?? "");

  useEffect(() => {
    getSuites(getActiveProjectId() ?? undefined).then(setSuites).catch(console.error);
  }, []);

  async function handleGenerate() {
    if (!requirement.trim()) return;
    setGenerating(true);
    setGenError("");
    setGenSuccess(false);
    setQuotaExhausted(false);
    setSuggestions([]);
    setSelected(new Set());
    setSaveMsg("");
    try {
      const token = getStoredToken();
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${BASE_URL}/ai/generate-test-cases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(
          showAdvanced
            ? { input: requirement, provider, model: model || undefined, apiKey: apiKey || undefined }
            : { input: requirement },
        ),
      });
      if (!res.ok) {
        if (res.status === 401) { handle401Redirect(); return; }
        if (res.status === 503) {
          const body = await res.json().catch(() => ({}));
          if (body?.error === "rate_limited") {
            setQuotaExhausted(true);
            setShowAdvanced(true);
            return;
          }
          setGenError("AI providers are busy right now — please wait a moment and try again.");
          return;
        }
        if (res.status >= 500) throw new Error("AI is temporarily unavailable. Please try again.");
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const body = await res.json();
      const raw: Omit<GeneratedCase, "tag">[] = Array.isArray(body) ? body : (body.cases ?? body);
      const suggested: string = Array.isArray(body) ? "" : (body.suggestedSuite ?? "");
      setSuggestedSuite(suggested);
      const list: GeneratedCase[] = (Array.isArray(raw) ? raw : []).map((tc) => ({
        ...tc,
        tag: autoTag(tc.title ?? ""),
      }));
      setSuggestions(list);
      setSelected(new Set(list.map((_, i) => i)));
      setGenSuccess(true);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err: any) {
      console.error("Generation error:", err);
      setGenError(err?.message ?? "AI is busy. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function updateSuggestion(index: number, patch: Partial<GeneratedCase>) {
    setSuggestions((prev) => prev.map((tc, i) => (i === index ? { ...tc, ...patch } : tc)));
  }

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  async function saveSelected() {
    setSaving(true);
    setSaveMsg("");
    let saved = 0;
    let failed = 0;
    const projectId = getActiveProjectId();
    for (const i of selected) {
      const tc = suggestions[i];
      if (!tc) continue;
      try {
        await createTestCase({
          title: tc.title ?? "",
          description: tc.description ?? "",
          category: tc.tag,
          executionType: "manual",
          steps: Array.isArray(tc.steps) ? JSON.stringify(tc.steps) : (tc.steps ?? ""),
          expectedResult: tc.expectedResult ?? "",
          preconditions: tc.preconditions ?? "",
          tags: tc.tags ?? "",
          priority: tc.priority ?? "P2",
          severity: tc.severity ?? "medium",
          status: "active",
          suiteId: selectedSuiteId || null,
          ...(projectId ? { projectId } : {}),
        } as any);
        saved++;
      } catch {
        failed++;
      }
    }
    setSaving(false);
    setSaveMsg(
      failed === 0
        ? `${saved} test case${saved !== 1 ? "s" : ""} saved successfully.`
        : `${saved} saved, ${failed} failed.`,
    );
    if (failed === 0) setSuggestions([]);
  }

  function useThis(tc: GeneratedCase) {
    setFormInitial({
      id: "",
      tcId: "",
      title: tc.title ?? "",
      description: tc.description ?? "",
      category: tc.tag,
      executionType: "manual",
      priority: tc.priority ?? "P2",
      severity: tc.severity ?? "medium",
      steps: Array.isArray(tc.steps) ? JSON.stringify(tc.steps) : (tc.steps ?? ""),
      expectedResult: tc.expectedResult ?? "",
      preconditions: tc.preconditions ?? "",
      tags: tc.tags ?? "",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    setFormKey((k) => k + 1);
    setSuggestions([]);
  }

  const applyTemplate = useCallback((text: string) => {
    setRequirement(text);
    requestAnimationFrame(() => {
      const el = requirementRef.current;
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = text.length; }
    });
  }, []);

  function handleTemplateSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    e.target.value = "";
    if (!id) return;
    const all = [...PRESET_TEMPLATES, ...savedTemplates];
    const tpl = all.find((t) => t.id === id);
    if (tpl) applyTemplate(tpl.text);
  }

  function handleSaveTemplate() {
    const name = window.prompt("Template name:");
    if (!name?.trim()) return;
    const newTpl: PromptTemplate = { id: Date.now().toString(), label: name.trim(), text: requirement };
    const updated = [...savedTemplates, newTpl];
    saveSavedTemplates(updated);
    setSavedTemplates(updated);
  }

  function handleDeleteTemplate(id: string) {
    const updated = savedTemplates.filter((t) => t.id !== id);
    saveSavedTemplates(updated);
    setSavedTemplates(updated);
  }

  const flattenSuites = (list: TestSuite[], depth = 0): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const s of list) {
      result.push({ id: s.id, name: s.name, depth });
      if (s.children?.length) result.push(...flattenSuites(s.children, depth + 1));
    }
    return result;
  };
  const flatSuites = flattenSuites(suites);

  if (loading) return null;

  return (
    <div>
      {/* AI Generation Panel */}
      <div className="mb-8 max-w-[560px]">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="bg-transparent border-none text-muted-foreground cursor-pointer text-[13px] p-0 mb-3 text-left hover:text-foreground transition-colors"
        >
          {showAdvanced ? "▾" : "▸"} Advanced Settings
        </button>

        {showAdvanced && (
          <div className="mb-3 p-3 border border-border rounded-md bg-popover">
            <div className="flex gap-3 mb-2.5">
              <label className="flex-1 text-sm">
                AI Provider
                <select
                  value={provider}
                  onChange={(e) => {
                    const p = e.target.value as Provider;
                    setProvider(p);
                    if (p === "openrouter") setModel("meta-llama/llama-3.2-3b-instruct:free");
                    else setModel("");
                  }}
                  className={inputClass}
                >
                  <option value="gemini">gemini</option>
                  <option value="openai">openai</option>
                  <option value="claude">claude</option>
                  <option value="openrouter">openrouter</option>
                </select>
              </label>
              <label className="flex-1 text-sm">
                Model (optional)
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={provider === "openrouter" ? "e.g. meta-llama/llama-3.2-3b-instruct:free" : "e.g. gemini-2.5-flash, gpt-4o"}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block text-sm">
              API Key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave blank to use server default"
                className={inputClass}
              />
            </label>
          </div>
        )}

        <label className="block mb-1.5 font-medium text-sm">
          Paste Requirement / User Story
        </label>
        <textarea
          ref={requirementRef}
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          rows={4}
          placeholder="Describe the feature or user story…"
          className={inputClass}
        />

        {/* Template row */}
        <div className="flex gap-2 mt-1.5 items-center">
          <div className="relative flex-1">
            <select
              defaultValue=""
              onChange={handleTemplateSelect}
              className={cn(inputClass, "mt-0 pr-7")}
            >
              <option value="" disabled>— choose a template —</option>
              <optgroup label="Presets">
                {PRESET_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </optgroup>
              {savedTemplates.length > 0 && (
                <optgroup label="Saved">
                  {savedTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {savedTemplates.length > 0 && (
            <div className="flex flex-col gap-1 shrink-0">
              {savedTemplates.map((t) => (
                <div key={t.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{t.label}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(t.id)}
                    title="Delete template"
                    className="bg-transparent border-none text-slate-400 cursor-pointer text-[13px] px-0.5 leading-none hover:text-red-400 transition-colors"
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={!requirement.trim()}
            className="bg-slate-800 border border-slate-600 text-muted-foreground rounded px-2.5 py-1.5 text-xs cursor-pointer shrink-0 hover:text-foreground transition-colors disabled:opacity-50"
          >
            Save as template
          </button>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !requirement.trim()}
          className={cn(primaryBtnClass, "mt-2 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed")}
        >
          {generating && <Loader2 className="h-4 w-4 animate-spin" />}
          {generating ? "Generating…" : "Generate Test Cases"}
        </button>

        {quotaExhausted && (
          <div className="mt-3 p-4 rounded-md bg-amber-950/40 border border-amber-700 text-amber-300 text-[13px] leading-relaxed">
            <strong className="block mb-1.5">Daily AI quota reached.</strong>
            To continue generating test cases, open Advanced Settings above and paste your own free API key:
            <ul className="mt-2 mb-0 pl-5">
              <li><a href="https://ai.google.dev" target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">ai.google.dev</a> — Gemini</li>
              <li><a href="https://platform.openai.com" target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">platform.openai.com</a> — OpenAI</li>
              <li><a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">console.anthropic.com</a> — Claude</li>
            </ul>
          </div>
        )}
        {genSuccess && !generating && (
          <p className="text-emerald-500 mt-2 text-[13px]">✅ Test cases generated</p>
        )}
        {genError && (
          <p className="text-orange-400 mt-2 text-[13px]">⚠️ {genError}</p>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div ref={resultsRef} className="mb-8 max-w-[600px]">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="m-0">Generated Test Cases</h3>
            <button
              type="button"
              onClick={saveSelected}
              disabled={saving || selected.size === 0}
              className={cn(primaryBtnClass, "text-[13px] px-3 py-1 inline-flex items-center gap-2 disabled:opacity-50")}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : `Save Selected (${selected.size})`}
            </button>
          </div>

          {/* Suite assignment */}
          <div className="my-4 p-4 bg-blue-950/30 border border-primary rounded-lg">
            <div className="text-[13px] text-blue-300 mb-2 font-semibold">
              📁 Save to Suite
            </div>
            {suggestedSuite && (
              <div className="text-xs text-slate-500 mb-2 italic">
                AI suggests: &quot;{suggestedSuite}&quot;
              </div>
            )}
            <select
              value={selectedSuiteId}
              onChange={(e) => setSelectedSuiteId(e.target.value)}
              className={cn(inputClass, "mb-2")}
            >
              <option value="">— No suite —</option>
              {flatSuites.map((s) => (
                <option key={s.id} value={s.id}>
                  {"  ".repeat(s.depth)}{s.depth > 0 ? "└ " : ""}{s.name}
                </option>
              ))}
            </select>
            {suggestedSuite && !flatSuites.find((s) =>
              s.name.toLowerCase() === suggestedSuite.toLowerCase()
            ) && (
              <button
                type="button"
                onClick={async () => {
                  const newSuite = await createSuite(suggestedSuite, undefined, undefined, getActiveProjectId() ?? undefined);
                  const updated = await getSuites(getActiveProjectId() ?? undefined);
                  setSuites(updated);
                  setSelectedSuiteId(newSuite.id);
                }}
                className={cn(primaryBtnClass, "w-full text-xs py-1.5")}
              >
                + Create &quot;{suggestedSuite}&quot; suite and assign
              </button>
            )}
          </div>

          {saveMsg && <p className="text-emerald-500 mb-2">{saveMsg}</p>}

          {suggestions.map((tc, i) => (
            <div
              key={i}
              className={cn(
                "border rounded-md p-4 mb-3 bg-card",
                selected.has(i) ? "border-primary" : "border-border"
              )}
            >
              {/* Card header */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleSelect(i)}
                  className="cursor-pointer w-4 h-4"
                />
                <span className="text-xs text-slate-500">#{i + 1}</span>
              </div>

              {/* IDENTIFICATION */}
              <div className={cardSectionClass}>Identification</div>

              <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
                <label className="text-[13px]">
                  Title
                  <input
                    type="text"
                    value={tc.title}
                    onChange={(e) => updateSuggestion(i, { title: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="text-[13px] min-w-[110px]">
                  Category
                  <select
                    value={tc.tag}
                    onChange={(e) => updateSuggestion(i, { tag: e.target.value as CaseTag })}
                    className={cn(inputClass, "mt-1")}
                  >
                    <option value="smoke">Smoke</option>
                    <option value="sanity">Sanity</option>
                    <option value="regression">Regression</option>
                  </select>
                </label>
              </div>

              <label className="block mb-2 text-[13px]">
                Tags
                <input
                  type="text"
                  value={tc.tags ?? ""}
                  onChange={(e) => updateSuggestion(i, { tags: e.target.value })}
                  placeholder="smoke, login, critical (comma separated)"
                  className={inputClass}
                />
              </label>

              {/* CLASSIFICATION */}
              <div className={cardSectionClass}>Classification</div>

              <div className="grid grid-cols-2 gap-2 mb-2.5">
                <div>
                  <label className="text-[13px] block mb-1">Priority</label>
                  <select
                    value={tc.priority ?? "P2"}
                    onChange={(e) => updateSuggestion(i, { priority: e.target.value })}
                    className={cn(inputClass, "mt-0")}
                  >
                    <option value="P1">P1 — Critical</option>
                    <option value="P2">P2 — High</option>
                    <option value="P3">P3 — Medium</option>
                    <option value="P4">P4 — Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] block mb-1">Severity</label>
                  <select
                    value={tc.severity ?? "medium"}
                    onChange={(e) => updateSuggestion(i, { severity: e.target.value })}
                    className={cn(inputClass, "mt-0")}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* CONTENT */}
              <div className={cardSectionClass}>Content</div>

              <label className="block mb-2 text-[13px]">
                Description
                <textarea value={tc.description ?? ""} onChange={(e) => updateSuggestion(i, { description: e.target.value })} rows={2} className={inputClass} />
              </label>

              <label className="block mb-2 text-[13px]">
                Preconditions
                <textarea value={tc.preconditions ?? ""} onChange={(e) => updateSuggestion(i, { preconditions: e.target.value })} rows={2} placeholder="User must be logged out. Account must exist." className={inputClass} />
              </label>

              <label className="block mb-2 text-[13px]">
                Steps (one per line)
                <textarea value={stepsToText(tc.steps)} onChange={(e) => updateSuggestion(i, { steps: textToSteps(e.target.value) })} rows={3} className={inputClass} />
              </label>

              <label className="block mb-2 text-[13px]">
                Expected Result
                <textarea value={tc.expectedResult ?? ""} onChange={(e) => updateSuggestion(i, { expectedResult: e.target.value })} rows={2} className={inputClass} />
              </label>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      <TestCaseForm key={formKey} initial={formInitial} initialSuiteId={initialSuiteId} onSubmit={createTestCase} />
    </div>
  );
}

// ── Class constants ────────────────────────────────────────────────────────────

const inputClass =
  "block w-full mt-1 px-2 py-1.5 text-sm box-border bg-card text-foreground border border-slate-600 rounded focus:outline-none focus:border-primary transition-colors";

const primaryBtnClass =
  "px-4 py-2 text-sm bg-primary text-primary-foreground border-none rounded cursor-pointer hover:bg-primary/90 transition-colors";

const cardSectionClass =
  "text-[10px] text-slate-600 uppercase tracking-[0.08em] mb-2 mt-1 border-b border-slate-800 pb-1";
