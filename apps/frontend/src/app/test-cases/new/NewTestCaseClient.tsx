"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import TestCaseForm from "../../../components/TestCaseForm";
import { createTestCase, getSuites, createSuite, getActiveProjectId, type TestSuite } from "../../../lib/api";
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
  { id: "__edge__",     label: "Edge cases",     text: "Generate edge case and boundary condition tests for: " },
  { id: "__negative__", label: "Negative paths",  text: "Generate negative path and error handling tests for: " },
  { id: "__happy__",    label: "Happy path",      text: "Generate happy path tests covering the main user flow for: " },
];

const LS_KEY = "qavibe_prompt_templates";

function loadSavedTemplates(): PromptTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
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
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>(
    initialSuiteId ?? ""
  );

  useEffect(() => {
    getSuites().then(setSuites).catch(console.error);
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
        if (res.status === 503) {
          const body = await res.json().catch(() => ({}));
          if (body?.error === "rate_limited") {
            // Legacy quota-exhaustion path: prompt user to supply their own key
            setQuotaExhausted(true);
            setShowAdvanced(true);
            return;
          }
          // All providers temporarily unavailable — show friendly message, not raw error
          setGenError("AI providers are busy right now — please wait a moment and try again.");
          return;
        }
        if (res.status >= 500) throw new Error("AI is temporarily unavailable. Please try again.");
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const body = await res.json();
      // Support both old array format and new { suggestedSuite, cases } format
      const raw: Omit<GeneratedCase, "tag">[] = Array.isArray(body)
        ? body
        : (body.cases ?? body);
      const suggested: string = Array.isArray(body)
        ? ""
        : (body.suggestedSuite ?? "");
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
    // Place cursor at end after React re-renders
    requestAnimationFrame(() => {
      const el = requirementRef.current;
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = text.length; }
    });
  }, []);

  function handleTemplateSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    e.target.value = ""; // reset dropdown to placeholder
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

  const flattenSuites = (
    list: TestSuite[], depth = 0
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
  const flatSuites = flattenSuites(suites);

  if (loading) return null;

  return (
    <div>
      {/* AI Generation Panel */}
      <div style={{ marginBottom: 32, maxWidth: 560 }}>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 12, textAlign: "left" }}
        >
          {showAdvanced ? "▾" : "▸"} Advanced Settings
        </button>

        {showAdvanced && (
          <div style={{ marginBottom: 12, padding: 12, border: "1px solid #333", borderRadius: 6, background: "#161616" }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              <label style={{ flex: 1 }}>
                AI Provider
                <select
                  value={provider}
                  onChange={(e) => {
                    const p = e.target.value as Provider;
                    setProvider(p);
                    if (p === "openrouter") setModel("meta-llama/llama-3.2-3b-instruct:free");
                    else setModel("");
                  }}
                  style={inputStyle}
                >
                  <option value="gemini">gemini</option>
                  <option value="openai">openai</option>
                  <option value="claude">claude</option>
                  <option value="openrouter">openrouter</option>
                </select>
              </label>
              <label style={{ flex: 1 }}>
                Model (optional)
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={provider === "openrouter" ? "e.g. meta-llama/llama-3.2-3b-instruct:free" : "e.g. gemini-2.5-flash, gpt-4o, claude-3-sonnet"}
                  style={inputStyle}
                />
              </label>
            </div>
            <label style={{ display: "block" }}>
              API Key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave blank to use server default"
                style={inputStyle}
              />
            </label>
          </div>
        )}

        <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>
          Paste Requirement / User Story
        </label>
        <textarea
          ref={requirementRef}
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          rows={4}
          placeholder="Describe the feature or user story…"
          style={inputStyle}
        />

        {/* Template row */}
        <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <select
              defaultValue=""
              onChange={handleTemplateSelect}
              style={{ ...inputStyle, marginTop: 0, paddingRight: 28 }}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
              {savedTemplates.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#aaa" }}>
                  <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(t.id)}
                    title="Delete template"
                    style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={!requirement.trim()}
            style={{ ...btnStyle, fontSize: 12, padding: "6px 10px", background: "#2a2a2a", border: "1px solid #444", flexShrink: 0 }}
          >
            Save as template
          </button>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !requirement.trim()}
          style={{ ...btnStyle, marginTop: 8 }}
        >
          {generating ? "Generating…" : "Generate Test Cases"}
        </button>
        {quotaExhausted && (
          <div style={{
            marginTop: 12,
            padding: "12px 16px",
            borderRadius: 6,
            background: "#2d2200",
            border: "1px solid #7a5c00",
            color: "#ffd966",
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            <strong style={{ display: "block", marginBottom: 6 }}>Daily AI quota reached.</strong>
            To continue generating test cases, open Advanced Settings above and paste your own free API key:
            <ul style={{ margin: "8px 0 0 0", paddingLeft: 20 }}>
              <li><a href="https://ai.google.dev" target="_blank" rel="noreferrer" style={{ color: "#ffd966" }}>ai.google.dev</a> — Gemini</li>
              <li><a href="https://platform.openai.com" target="_blank" rel="noreferrer" style={{ color: "#ffd966" }}>platform.openai.com</a> — OpenAI</li>
              <li><a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#ffd966" }}>console.anthropic.com</a> — Claude</li>
            </ul>
          </div>
        )}
        {genSuccess && !generating && (
          <p style={{ color: "#4caf50", marginTop: 8, fontSize: 13 }}>✅ Test cases generated</p>
        )}
        {genError && (
          <p style={{ color: "#ff8a50", marginTop: 8, fontSize: 13 }}>⚠️ {genError}</p>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div ref={resultsRef} style={{ marginBottom: 32, maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Generated Test Cases</h3>
            <button
              type="button"
              onClick={saveSelected}
              disabled={saving || selected.size === 0}
              style={{ ...btnStyle, fontSize: 13, padding: "5px 12px" }}
            >
              {saving ? "Saving…" : `Save Selected (${selected.size})`}
            </button>
          </div>

          {/* Suite assignment */}
          <div style={{
            margin: "16px 0",
            padding: "12px 16px",
            background: "#0d1f33",
            border: "1px solid #0070f3",
            borderRadius: 8,
          }}>
            <div style={{
              fontSize: 13,
              color: "#93c5fd",
              marginBottom: 8,
              fontWeight: 600,
            }}>
              📁 Save to Suite
            </div>
            {suggestedSuite && (
              <div style={{
                fontSize: 12,
                color: "#555",
                marginBottom: 8,
                fontStyle: "italic",
              }}>
                AI suggests: &quot;{suggestedSuite}&quot;
              </div>
            )}
            <select
              value={selectedSuiteId}
              onChange={(e) => setSelectedSuiteId(e.target.value)}
              style={{
                background: "#111",
                border: "1px solid #333",
                borderRadius: 6,
                padding: "6px 10px",
                color: "#eee",
                fontSize: 13,
                width: "100%",
                marginBottom: 8,
              }}
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
                  const newSuite = await createSuite(suggestedSuite);
                  const updated = await getSuites();
                  setSuites(updated);
                  setSelectedSuiteId(newSuite.id);
                }}
                style={{
                  background: "#0070f3",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  color: "#fff",
                  fontSize: 12,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                + Create &quot;{suggestedSuite}&quot; suite and assign
              </button>
            )}
          </div>
          {saveMsg && <p style={{ color: "#4caf50", marginBottom: 8 }}>{saveMsg}</p>}
          {suggestions.map((tc, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${selected.has(i) ? "#0070f3" : "#333"}`,
                borderRadius: 6,
                padding: 16,
                marginBottom: 12,
                background: "#1a1a1a",
              }}
            >
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleSelect(i)}
                  style={{ cursor: "pointer", width: 16, height: 16 }}
                />
                <span style={{ fontSize: 12, color: "#666" }}>#{i + 1}</span>
              </div>

              {/* IDENTIFICATION */}
              <div style={cardSectionLabel}>Identification</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
                <label style={{ fontSize: 13 }}>
                  Title
                  <input
                    type="text"
                    value={tc.title}
                    onChange={(e) => updateSuggestion(i, { title: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={{ fontSize: 13, minWidth: 110 }}>
                  Category
                  <select
                    value={tc.tag}
                    onChange={(e) => updateSuggestion(i, { tag: e.target.value as CaseTag })}
                    style={{ ...inputStyle, marginTop: 4 }}
                  >
                    <option value="smoke">Smoke</option>
                    <option value="sanity">Sanity</option>
                    <option value="regression">Regression</option>
                  </select>
                </label>
              </div>

              <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
                Tags
                <input
                  type="text"
                  value={tc.tags ?? ""}
                  onChange={(e) => updateSuggestion(i, { tags: e.target.value })}
                  placeholder="smoke, login, critical (comma separated)"
                  style={inputStyle}
                />
              </label>

              {/* CLASSIFICATION */}
              <div style={cardSectionLabel}>Classification</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Priority</label>
                  <select
                    value={tc.priority ?? "P2"}
                    onChange={(e) => updateSuggestion(i, { priority: e.target.value })}
                    style={{ ...inputStyle, marginTop: 0 }}
                  >
                    <option value="P1">P1 — Critical</option>
                    <option value="P2">P2 — High</option>
                    <option value="P3">P3 — Medium</option>
                    <option value="P4">P4 — Low</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Severity</label>
                  <select
                    value={tc.severity ?? "medium"}
                    onChange={(e) => updateSuggestion(i, { severity: e.target.value })}
                    style={{ ...inputStyle, marginTop: 0 }}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* CONTENT */}
              <div style={cardSectionLabel}>Content</div>

              <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
                Description
                <textarea
                  value={tc.description ?? ""}
                  onChange={(e) => updateSuggestion(i, { description: e.target.value })}
                  rows={2}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
                Preconditions
                <textarea
                  value={tc.preconditions ?? ""}
                  onChange={(e) => updateSuggestion(i, { preconditions: e.target.value })}
                  rows={2}
                  placeholder="User must be logged out. Account must exist."
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
                Steps (one per line)
                <textarea
                  value={stepsToText(tc.steps)}
                  onChange={(e) => updateSuggestion(i, { steps: textToSteps(e.target.value) })}
                  rows={3}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "block", marginBottom: 8, fontSize: 13 }}>
                Expected Result
                <textarea
                  value={tc.expectedResult ?? ""}
                  onChange={(e) => updateSuggestion(i, { expectedResult: e.target.value })}
                  rows={2}
                  style={inputStyle}
                />
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

const btnStyle: React.CSSProperties = {
  padding: "8px 18px",
  fontSize: 14,
  background: "#0070f3",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const cardSectionLabel: React.CSSProperties = {
  fontSize: 10,
  color: "#555",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 8,
  marginTop: 4,
  borderBottom: "1px solid #2a2a2a",
  paddingBottom: 4,
};
