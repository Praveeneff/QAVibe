"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  getTestCases,
  getSuites,
  createSuite,
  deleteSuite,
  createTestRun,
  assignCase,
  removeFromSuite,
  getUser,
  getActiveProjectId,
  getProjectMembers,
  type TestCase,
  type TestSuite,
  type TestCaseFilters,
} from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getStoredToken } from "@/context/AuthContext";
import { usePermission } from "@/context/PermissionsContext";
import { useToast } from "@/hooks/use-toast";
import TestCaseTableRow from "./TestCaseTableRow";
import TestCaseFilters, { type ActiveFilters } from "./TestCaseFilters";

// ── Start Run Modal ───────────────────────────────────────────────────────────

interface RunFormState {
  name: string;
  environment: string;
  browser: string;
  buildVersion: string;
  device: string;
}

function StartRunModal({
  defaultName,
  submitting,
  onCancel,
  onSubmit,
}: {
  defaultName: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (form: RunFormState) => void;
}) {
  const [form, setForm] = useState<RunFormState>({
    name: defaultName,
    environment: "staging",
    browser: "",
    buildVersion: "",
    device: "desktop",
  });

  const set = (key: keyof RunFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-7 w-[460px] max-w-[92vw]"
      >
        <h2 className="mt-0 mb-5 text-lg font-semibold">Start Test Run</h2>

        <label className="block mb-4">
          <span className="block text-sm text-muted-foreground mb-1.5">Run name *</span>
          <input value={form.name} onChange={set("name")} className={inputClass} autoFocus />
        </label>

        <label className="block mb-4">
          <span className="block text-sm text-muted-foreground mb-1.5">Environment</span>
          <select value={form.environment} onChange={set("environment")} className={inputClass}>
            <option value="staging">staging</option>
            <option value="production">production</option>
            <option value="dev">dev</option>
            <option value="qa">qa</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3.5 mb-4">
          <label>
            <span className="block text-sm text-muted-foreground mb-1.5">Browser</span>
            <select value={form.browser} onChange={set("browser")} className={inputClass}>
              <option value="">— optional —</option>
              <option value="chrome">chrome</option>
              <option value="firefox">firefox</option>
              <option value="safari">safari</option>
              <option value="edge">edge</option>
              <option value="other">other</option>
            </select>
          </label>
          <label>
            <span className="block text-sm text-muted-foreground mb-1.5">Device</span>
            <select value={form.device} onChange={set("device")} className={inputClass}>
              <option value="desktop">desktop</option>
              <option value="mobile">mobile</option>
              <option value="tablet">tablet</option>
            </select>
          </label>
        </div>

        <label className="block mb-6">
          <span className="block text-sm text-muted-foreground mb-1.5">Build version</span>
          <input
            value={form.buildVersion}
            onChange={set("buildVersion")}
            placeholder="v1.0.0 or commit hash"
            className={inputClass}
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={() => onSubmit(form)}
            disabled={!form.name.trim() || submitting}
            className={cn(primaryBtnClass, (!form.name.trim() || submitting) && "opacity-50 cursor-not-allowed")}
          >
            {submitting ? "Starting…" : "Start Run"}
          </button>
          <button onClick={onCancel} className={ghostBtnClass}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar items ─────────────────────────────────────────────────────────────

function SidebarItem({
  label, count, active, onClick,
}: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between w-full px-4 py-2 border-l-2 text-sm text-left cursor-pointer transition-colors",
        active
          ? "bg-blue-950/40 border-l-primary text-foreground"
          : "bg-transparent border-l-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <span>{label}</span>
      <span className="text-xs bg-slate-800 px-1.5 py-px rounded-full text-slate-500">
        {count}
      </span>
    </button>
  );
}

const DEPTH_ACTIVE_TEXT  = ["text-primary",    "text-purple-400", "text-amber-400"];
const DEPTH_ACTIVE_BORDER = ["border-l-primary", "border-l-purple-400", "border-l-amber-400"];

function SuiteItem({
  suite, activeId, isAdmin, depth, onSelect, onRun, onBrd, onDelete, onAddChild,
  onDrop, onDragEnter, isDragOver, dragOverSuiteId,
}: {
  suite: TestSuite;
  activeId: string | null;
  isAdmin: boolean;
  depth: number;
  onSelect: (id: string) => void;
  onRun: (id: string, name: string) => void;
  onBrd: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onAddChild: (parentId: string, parentDepth: number, name: string) => void;
  onDrop: (suiteId: string) => void;
  onDragEnter: (suiteId: string) => void;
  isDragOver: boolean;
  dragOverSuiteId: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [hovered, setHovered] = useState(false);
  const hasChildren = suite.children && suite.children.length > 0;
  const active = activeId === suite.id;
  const activeBorderClass = DEPTH_ACTIVE_BORDER[depth] ?? "border-l-primary";
  const activeTextClass   = DEPTH_ACTIVE_TEXT[depth]   ?? "text-primary";
  const indentStyle = { paddingLeft: `${16 + depth * 12}px` };

  return (
    <div>
      <div
        onClick={() => onSelect(suite.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDragEnter={(e) => { e.preventDefault(); onDragEnter(suite.id); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(suite.id); }}
        style={indentStyle}
        className={cn(
          "flex items-center pr-2 py-1.5 border-l-[3px] cursor-pointer gap-1",
          isDragOver
            ? "bg-emerald-950/40 border-l-emerald-500 outline outline-1 outline-dashed outline-emerald-500"
            : active
              ? cn("bg-blue-950/30", activeBorderClass)
              : "bg-transparent border-l-transparent hover:bg-slate-800/30"
        )}
      >
        {/* Collapse toggle */}
        <span
          onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
          className={cn("text-[10px] text-slate-500 w-3 shrink-0", hasChildren ? "cursor-pointer" : "cursor-default")}
        >
          {hasChildren ? (collapsed ? "▶" : "▼") : "•"}
        </span>

        {/* Suite icon by depth */}
        <span className="text-xs shrink-0">
          {depth === 0 ? "📁" : depth === 1 ? "📂" : "📋"}
        </span>

        {/* Suite name */}
        <span
          title={suite.name}
          className={cn(
            "flex-1 text-[13px] overflow-hidden text-ellipsis whitespace-nowrap",
            active ? activeTextClass : "text-slate-300"
          )}
        >
          {suite.name}
        </span>

        {/* Test case count badge */}
        <span className="text-[11px] bg-slate-800 px-1.5 py-px rounded-full text-slate-500 shrink-0">
          {suite._count.testCases}
        </span>

        {/* Add child button — only if depth < 2 */}
        {depth < 2 && (
          addingChild ? (
            <input
              autoFocus
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && childName.trim()) {
                  onAddChild(suite.id, suite.depth, childName.trim());
                  setChildName("");
                  setAddingChild(false);
                }
                if (e.key === "Escape") {
                  setChildName("");
                  setAddingChild(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder={depth === 0 ? "Sub-suite name…" : "Group name…"}
              className="bg-background border border-primary rounded px-1.5 py-0.5 text-foreground text-xs w-28 outline-none shrink-0"
            />
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setAddingChild(true); }}
              title={depth === 0 ? "Add Sub-suite" : "Add Group"}
              className={cn(
                "bg-transparent border border-border text-slate-400 rounded px-1 py-px text-[11px] cursor-pointer shrink-0 transition-opacity",
                hovered ? "opacity-100" : "opacity-0"
              )}
            >
              +
            </button>
          )
        )}

        {/* BRD button */}
        <button
          onClick={(e) => { e.stopPropagation(); onBrd(suite.id); }}
          title="Generate from BRD into this suite"
          className={cn(
            "bg-indigo-950 border border-indigo-800 text-indigo-400 rounded px-1.5 py-0.5 text-[11px] cursor-pointer shrink-0 transition-opacity",
            hovered ? "opacity-100" : "opacity-0"
          )}
        >
          📄
        </button>

        {/* Run button */}
        <button
          onClick={(e) => { e.stopPropagation(); onRun(suite.id, suite.name); }}
          title="Run suite"
          className={cn(
            "bg-emerald-950 border border-emerald-800 text-emerald-500 rounded px-1.5 py-0.5 text-[11px] cursor-pointer shrink-0 transition-opacity",
            hovered ? "opacity-100" : "opacity-0"
          )}
        >
          ▶
        </button>

        {/* Delete button — admin only */}
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(suite.id, suite.name); }}
            title="Delete suite"
            className={cn(
              "bg-transparent border border-red-900 text-red-400 rounded px-1 py-px text-[11px] cursor-pointer shrink-0 transition-opacity",
              hovered ? "opacity-100" : "opacity-0"
            )}
          >
            ✕
          </button>
        )}
      </div>

      {/* Render children recursively */}
      {hasChildren && !collapsed && (
        <div>
          {suite.children!.map((child) => (
            <SuiteItem
              key={child.id}
              suite={child}
              activeId={activeId}
              isAdmin={isAdmin}
              depth={depth + 1}
              onSelect={onSelect}
              onRun={onRun}
              onBrd={onBrd}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onDrop={onDrop}
              onDragEnter={onDragEnter}
              isDragOver={dragOverSuiteId === child.id}
              dragOverSuiteId={dragOverSuiteId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Selection = string | null;


export default function TestCasesClient() {
  const { loading: authLoading, user } = useRequireAuth();
  const isAdmin = user?.role === "admin";
  const { can } = usePermission();
  const { toast } = useToast();
  const token = getStoredToken() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Sidebar / suite selection ──────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<Selection>(
    () => searchParams.get("suite") ?? null,
  );
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [suitesError, setSuitesError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const flattenSuites = (
    suiteList: TestSuite[],
    depth = 0
  ): { id: string; name: string; depth: number }[] => {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const s of suiteList) {
      result.push({ id: s.id, name: s.name, depth });
      if (s.children?.length) {
        result.push(...flattenSuites(s.children, depth + 1));
      }
    }
    return result;
  };
  const flatSuites = flattenSuites(suites);

  const [unassignedCount, setUnassignedCount] = useState(0);

  // ── Test case list ─────────────────────────────────────────────────────────
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // ── Search + filters ───────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("q") ?? "",
  );
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => ({
    search:   searchParams.get("q")        || undefined,
    category: searchParams.get("category") || undefined,
    severity: searchParams.get("severity") || undefined,
    priority: searchParams.get("priority") || undefined,
    status:   searchParams.get("status")   || undefined,
  }));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [page, setPage] = useState(
    () => Math.max(1, parseInt(searchParams.get("page") ?? "1", 10)),
  );
  const [limit, setLimit] = useState<20 | 50 | 100>(() => {
    const raw = parseInt(searchParams.get("limit") ?? "20", 10);
    return (raw === 50 || raw === 100) ? raw : 20;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  // ── User name resolution ───────────────────────────────────────────────────
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  // ── Selection / run ────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [runModal, setRunModal] = useState<{ caseIds: string[]; defaultName: string } | null>(null);

  // ── Import modal ───────────────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFormat, setImportFormat] = useState<"qavibe" | "testrail">("qavibe");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; suiteCreated: string[] } | null>(null);
  const [importError, setImportError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Suite creation ─────────────────────────────────────────────────────────
  const [showNewSuite, setShowNewSuite] = useState(false);
  const [newSuiteName, setNewSuiteName] = useState("");
  const [savingSuite, setSavingSuite] = useState(false);
  const newSuiteInputRef = useRef<HTMLInputElement>(null);
  const [draggingTcId, setDraggingTcId] = useState<string | null>(null);
  const [dragOverSuiteId, setDragOverSuiteId] = useState<string | null>(null);

  // ── Fetch suites + sidebar counts ──────────────────────────────────────────
  useEffect(() => {
    getSuites(getActiveProjectId() ?? undefined)
      .then((data) => { setSuites(data); setSuitesError(null); })
      .catch((err) => {
        console.error("Failed to load suites:", err);
        setSuitesError("Could not load suites. Please refresh.");
      });
    const pid = getActiveProjectId() ?? undefined;
    Promise.all([
      getTestCases({ limit: 1, ...(pid ? { projectId: pid } : {}) }),
      getTestCases({ suiteId: "unassigned", limit: 1, ...(pid ? { projectId: pid } : {}) }),
    ]).then(([all, unassigned]) => {
      setTotalCount(all.total);
      setUnassignedCount(unassigned.total);
    }).catch(console.error);
  }, [refreshKey]);

  // ── Main data fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setLoadError("");
    const projectId = getActiveProjectId();
    const filters: TestCaseFilters = {
      ...(selectedId !== null ? { suiteId: selectedId } : {}),
      ...activeFilters,
      page,
      limit,
      ...(projectId ? { projectId } : {}),
    };
    getTestCases(filters)
      .then((result) => {
        setTestCases(result.data);
        setSelected(new Set());
        setTotalPages(result.totalPages);
        setTotalResults(result.total);
        const ids = [...new Set(result.data.map((tc) => tc.createdBy).filter(Boolean))] as string[];
        if (ids.length > 0) {
          Promise.all(ids.map((id) => getUser(id).then((u) => [id, u.name] as const)))
            .then((pairs) => setUserNames((prev) => ({ ...prev, ...Object.fromEntries(pairs) })))
            .catch(() => {});
        }
        const pid = getActiveProjectId();
        if (pid && token) {
          getProjectMembers(pid, token).then(setMembers).catch(() => {});
        }
      })
      .catch(() => setLoadError("Could not reach backend. Make sure it is running on port 3001."))
      .finally(() => setLoading(false));
  }, [selectedId, activeFilters, page, limit, refreshKey]);

  // ── Focus new suite input when shown ──────────────────────────────────────
  useEffect(() => {
    if (showNewSuite) newSuiteInputRef.current?.focus();
  }, [showNewSuite]);

  // ── Sync filter state → URL ────────────────────────────────────────────────
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const params = new URLSearchParams();
    if (selectedId)               params.set("suite",    selectedId);
    if (activeFilters.search)     params.set("q",        activeFilters.search);
    if (activeFilters.category)   params.set("category", activeFilters.category);
    if (activeFilters.severity)   params.set("severity", activeFilters.severity);
    if (activeFilters.priority)   params.set("priority", activeFilters.priority);
    if (activeFilters.status)     params.set("status",   activeFilters.status);
    if (page > 1)                 params.set("page",     String(page));
    if (limit !== 20)             params.set("limit",    String(limit));
    const qs = params.toString();
    router.replace(qs ? `/test-cases?${qs}` : "/test-cases", { scroll: false });
  }, [selectedId, activeFilters, page, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search debounce ────────────────────────────────────────────────────────

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setActiveFilters((prev) => ({ ...prev, search: value || undefined }));
      setPage(1);
    }, 350);
  }

  function setFilter(key: keyof ActiveFilters, value: string) {
    setActiveFilters((prev) => ({ ...prev, [key]: value || undefined }));
    setPage(1);
  }

  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchInput("");
    setActiveFilters({});
    setPage(1);
  }

  const hasActiveFilters =
    !!searchInput ||
    !!activeFilters.category ||
    !!activeFilters.severity ||
    !!activeFilters.priority ||
    !!activeFilters.status;

  // ── Sidebar selection ──────────────────────────────────────────────────────

  function selectSuite(id: Selection) {
    setSelectedId(id);
    setPage(1);
  }

  // ── Selection helpers ──────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === testCases.length ? new Set() : new Set(testCases.map((tc) => tc.id)),
    );
  }

  // ── Assign helpers ────────────────────────────────────────────────────────

  async function handleAssign(assignedTo: string | null) {
    if (selected.size === 0) return;
    setAssigning(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`${BASE_URL}/test-cases/${id}/assign`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ assignedTo }),
          })
        )
      );
      setSelected(new Set());
      setShowAssignDropdown(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      console.error("Assign failed", e);
    } finally {
      setAssigning(false);
    }
  }

  async function handleAssignToMe() {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      await handleAssign(payload.sub);
    } catch (e) {
      console.error(e);
    }
  }

  // ── Run helpers ────────────────────────────────────────────────────────────

  function handleStartRun(caseIds: string[], defaultName: string) {
    setRunModal({ caseIds, defaultName });
  }

  async function handleRunSuite(suiteId: string, suiteName: string) {
    try {
      const result = await getTestCases({ suiteId, fields: "id", limit: 1000, projectId: getActiveProjectId() ?? undefined });
      if (result.data.length === 0) { toast({ title: "No test cases", description: "This suite has no test cases." }); return; }
      setRunModal({
        caseIds: result.data.map((c) => c.id),
        defaultName: `${suiteName} — ${new Date().toLocaleDateString()}`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load suite", description: err instanceof Error ? err.message : "Could not load suite cases" });
    }
  }

  async function submitRunModal(form: RunFormState) {
    if (!runModal) return;
    setStarting(true);
    try {
      const run = await createTestRun(
        form.name,
        runModal.caseIds,
        form.environment,
        form.browser || undefined,
        form.buildVersion || undefined,
        form.device || undefined,
        getActiveProjectId() ?? undefined,
      );
      router.push(`/runs/${run.id}`);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to create run", description: err instanceof Error ? err.message : undefined });
      setStarting(false);
    }
  }

  async function handleRunAllMatching() {
    try {
      const result = await getTestCases({
        ...(selectedId !== null ? { suiteId: selectedId } : {}),
        ...activeFilters,
        fields: "id",
        limit: 1000,
        projectId: getActiveProjectId() ?? undefined,
      });
      if (result.data.length === 0) { toast({ title: "No matching cases", description: "No test cases match the current filters." }); return; }
      const filterDesc = activeFilters.search
        ? `"${activeFilters.search}"`
        : activeFilters.category ?? activeFilters.severity ?? activeFilters.priority ?? "filtered";
      setRunModal({
        caseIds: result.data.map((c) => c.id),
        defaultName: `${filterDesc} — ${new Date().toLocaleDateString()}`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load cases", description: err instanceof Error ? err.message : undefined });
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    const params = new URLSearchParams();
    if (selectedId)                 params.set("suiteId",  selectedId);
    if (activeFilters.search)       params.set("search",   activeFilters.search);
    if (activeFilters.category)     params.set("category", activeFilters.category);
    if (activeFilters.severity)     params.set("severity", activeFilters.severity);
    if (activeFilters.priority)     params.set("priority", activeFilters.priority);
    if (activeFilters.status)       params.set("status",   activeFilters.status);
    const qs = params.toString();
    const url = `${base}/test-cases/export${qs ? `?${qs}` : ""}`;

    setExporting(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `qavibe-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      toast({ variant: "destructive", title: "Export failed", description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError("");
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const formData = new FormData();
      formData.append("file", importFile);
      const tok = getStoredToken();
      const res = await fetch(`${base}/test-cases/import`, {
        method: "POST",
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const result = await res.json() as { imported: number; skipped: number; suiteCreated: string[] };
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportFile(null);
    setImportError("");
    setImportResult(null);
  }

  // ── Inline suite assignment ────────────────────────────────────────────────

  async function handleSuiteChange(tcId: string, newSuiteId: string | null) {
    try {
      if (newSuiteId) {
        await assignCase(newSuiteId, tcId);
      } else {
        await removeFromSuite(tcId);
      }
      const filters: TestCaseFilters = {
        ...(selectedId !== null ? { suiteId: selectedId } : {}),
        ...activeFilters,
        page,
        limit,
      };
      const result = await getTestCases(filters);
      setTestCases(result.data);
      const pid = getActiveProjectId() ?? undefined;
      const [all, unassigned] = await Promise.all([
        getTestCases({ limit: 1, ...(pid ? { projectId: pid } : {}) }),
        getTestCases({ suiteId: "unassigned", limit: 1, ...(pid ? { projectId: pid } : {}) }),
      ]);
      setTotalCount(all.total);
      setUnassignedCount(unassigned.total);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to update suite", description: err instanceof Error ? err.message : undefined });
    }
  }

  // ── New suite ──────────────────────────────────────────────────────────────

  async function handleNewSuiteKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setShowNewSuite(false);
      setNewSuiteName("");
      return;
    }
    if (e.key !== "Enter" || !newSuiteName.trim()) return;
    setSavingSuite(true);
    try {
      await createSuite(newSuiteName.trim(), undefined, undefined, getActiveProjectId() ?? undefined);
      const updated = await getSuites(getActiveProjectId() ?? undefined);
      setSuites(updated);
      setNewSuiteName("");
      setShowNewSuite(false);
      toast({ title: "Suite created" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to create suite", description: err instanceof Error ? err.message : undefined });
    } finally {
      setSavingSuite(false);
    }
  }

  const handleAddChild = async (parentId: string, parentDepth: number, name: string) => {
    await createSuite(name, undefined, parentId, getActiveProjectId() ?? undefined);
    const updated = await getSuites(getActiveProjectId() ?? undefined);
    setSuites(updated);
  };

  const handleDrop = async (suiteId: string) => {
    if (!draggingTcId) return;
    setDragOverSuiteId(null);
    setDraggingTcId(null);
    await handleSuiteChange(draggingTcId, suiteId);
  };

  async function handleDeleteSuite(suiteId: string, suiteName: string) {
    if (!confirm(`Delete suite "${suiteName}"? Test cases will become unassigned.`)) return;
    try {
      await deleteSuite(suiteId);
      setSuites((prev) => prev.filter((s) => s.id !== suiteId));
      if (selectedId === suiteId) selectSuite(null);
      toast({ title: "Suite deleted" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete suite", description: err instanceof Error ? err.message : undefined });
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const grouped = testCases.reduce(
    (acc, tc) => {
      const cat = tc.category || "uncategorized";
      (acc[cat] ??= []).push(tc);
      return acc;
    },
    {} as Record<string, TestCase[]>,
  );
  const categories = Object.keys(grouped).sort();

  const heading =
    selectedId && selectedId !== "unassigned"
      ? (suites.find((s) => s.id === selectedId)?.name ?? "Test Cases")
      : selectedId === "unassigned" ? "Unassigned"
      : "Test Cases";

  const colCount = 11;

  // ── Render ─────────────────────────────────────────────────────────────────

  const errorParam = searchParams.get("error");
  if (authLoading) return null;

  return (
    <div className="flex min-h-[calc(100vh-45px)]">

      {/* Admin-required banner */}
      {errorParam === "admin-required" && (
        <div className="fixed top-12 left-0 right-0 z-banner bg-red-950 border-b border-red-800 px-8 py-3 text-red-300 text-sm text-center">
          Admin access required. You have been redirected.
        </div>
      )}

      {/* ── Sidebar ── */}
      <aside className="w-[260px] min-w-[260px] border-r border-slate-900 flex flex-col pt-3 overflow-y-auto bg-[#0a0a0a]">
        {draggingTcId && (
          <div className="mx-2 my-1 px-3 py-1.5 bg-emerald-950/40 border border-dashed border-emerald-500 rounded-md text-[11px] text-emerald-500 text-center">
            Drop onto a suite to assign
          </div>
        )}
        <SidebarItem
          label="All cases"
          count={totalCount}
          active={selectedId === null}
          onClick={() => selectSuite(null)}
        />
        <SidebarItem
          label="Unassigned"
          count={unassignedCount}
          active={selectedId === "unassigned"}
          onClick={() => selectSuite("unassigned")}
        />

        <div className="border-t border-slate-900 my-2" />

        {suitesError && (
          <p className="text-red-400 text-xs px-2 py-1">{suitesError}</p>
        )}

        <div className="px-3 py-2">
          {showNewSuite ? (
            <input
              ref={newSuiteInputRef}
              value={newSuiteName}
              onChange={(e) => setNewSuiteName(e.target.value)}
              onKeyDown={handleNewSuiteKeyDown}
              onBlur={() => { setShowNewSuite(false); setNewSuiteName(""); }}
              placeholder="Suite name…"
              disabled={savingSuite}
              className="w-full bg-popover border border-slate-600 rounded text-foreground px-2 py-1.5 text-[13px] outline-none box-border"
            />
          ) : (
            <button
              onClick={() => setShowNewSuite(true)}
              className="w-full bg-transparent border border-dashed border-border text-slate-500 rounded px-2 py-1.5 cursor-pointer text-[13px] text-left hover:border-slate-500 hover:text-slate-400 transition-colors"
            >
              ＋ New suite
            </button>
          )}
        </div>

        {suites.map((suite) => (
          <SuiteItem
            key={suite.id}
            suite={suite}
            activeId={selectedId}
            isAdmin={can("delete", "test_case")}
            depth={0}
            onSelect={(id) => selectSuite(id)}
            onRun={(id, name) => handleRunSuite(id, name)}
            onBrd={(id) => router.push(`/generate-brd?suiteId=${id}`)}
            onDelete={(id, name) => handleDeleteSuite(id, name)}
            onAddChild={handleAddChild}
            onDrop={handleDrop}
            onDragEnter={(id) => setDragOverSuiteId(id)}
            isDragOver={dragOverSuiteId === suite.id}
            dragOverSuiteId={dragOverSuiteId}
          />
        ))}
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 px-8 py-7 overflow-y-auto">

        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="m-0 text-[22px] font-semibold">{heading}</h1>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <button
                onClick={() => handleStartRun(Array.from(selected), `Run ${new Date().toLocaleDateString()}`)}
                disabled={starting}
                className={runBtnClass}
              >
                {starting ? "Starting…" : `▶ Start Run (${selected.size})`}
              </button>
            )}
            {selected.size === 0 && hasActiveFilters && totalResults > 0 && (
              <button
                onClick={handleRunAllMatching}
                disabled={starting}
                title={`Fetch all ${totalResults} matching IDs and start a run`}
                className={cn(runBtnClass, "inline-flex items-center gap-1.5")}
              >
                {starting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {starting ? "Starting…" : `▶ Run all filtered (${totalResults})`}
              </button>
            )}
            <button
              onClick={() => { setImportResult(null); setImportError(""); setImportFile(null); setShowImportModal(true); }}
              className={ghostBtnClass}
            >
              Import CSV
            </button>
            <button onClick={handleExport} disabled={exporting} className={cn(ghostBtnClass, "inline-flex items-center gap-1.5")}>
              {exporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            {can("create", "test_case") && (
              <Link
                href={
                  selectedId && selectedId !== "unassigned"
                    ? `/test-cases/new?suiteId=${selectedId}`
                    : "/test-cases/new"
                }
                className={primaryLinkClass}
              >
                + New
              </Link>
            )}
          </div>
        </div>

        {/* ── Bulk assign bar ── */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-950/30 border border-blue-800/30 rounded-lg mb-3 flex-wrap">
            <span className="text-[13px] text-blue-400 font-semibold">
              {selected.size} selected
            </span>

            <button
              onClick={handleAssignToMe}
              disabled={assigning}
              className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer bg-blue-900/40 text-blue-400 border border-blue-800/30 hover:bg-blue-900/60 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {assigning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {assigning ? "Assigning…" : "Assign to Me"}
            </button>

            {can("assign_others", "test_case") && (
              <>
                <div className="relative">
                  <button
                    onClick={() => setShowAssignDropdown(p => !p)}
                    disabled={assigning}
                    className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer bg-transparent text-foreground border border-border hover:bg-slate-700/40 transition-colors disabled:opacity-50"
                  >
                    Assign to… ▾
                  </button>
                  {showAssignDropdown && (
                    <div className="absolute top-full left-0 z-50 bg-card border border-slate-800 rounded-lg p-2 min-w-[220px] mt-1">
                      {members.length === 0 && (
                        <div className="text-[13px] text-slate-500 px-3 py-2">
                          No members found
                        </div>
                      )}
                      {members.map(m => (
                        <div
                          key={m.userId}
                          onClick={() => handleAssign(m.userId)}
                          className="px-3 py-2 cursor-pointer text-[13px] text-foreground rounded flex items-center gap-2 hover:bg-slate-700/50 transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-blue-900/60 text-blue-400 flex items-center justify-center text-[10px] font-semibold shrink-0">
                            {(m.user?.name ?? m.user?.email ?? "?")
                              .slice(0, 2).toUpperCase()}
                          </div>
                          <span>{m.user?.name ?? m.user?.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleAssign(null)}
                  disabled={assigning}
                  className="px-3 py-1 rounded-md text-xs font-medium cursor-pointer bg-transparent text-red-400 border border-red-900/40 hover:bg-red-950/30 transition-colors disabled:opacity-50"
                >
                  Unassign
                </button>
              </>
            )}

            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1 rounded-md text-xs cursor-pointer bg-transparent text-slate-500 border border-border ml-auto hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* ── Filter bar ── */}
        <TestCaseFilters
          searchInput={searchInput}
          onSearchChange={handleSearchChange}
          activeFilters={activeFilters}
          onFilterChange={setFilter}
          hasActiveFilters={hasActiveFilters}
          totalResults={totalResults}
          loading={loading}
          onClear={clearFilters}
        />

        {/* Error / loading / empty states */}
        {loadError && <p className="text-destructive">{loadError}</p>}
        {loading && <p className="text-slate-500">Loading…</p>}
        {!loading && !loadError && testCases.length === 0 && (
          <p className="text-slate-500">
            {hasActiveFilters ? "No test cases match the current filters." : "No test cases."}
          </p>
        )}

        {/* Table */}
        {!loading && !loadError && testCases.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-slate-500">
                <th className={thClass}>
                  <input
                    type="checkbox"
                    checked={selected.size === testCases.length && testCases.length > 0}
                    onChange={toggleAll}
                    className="cursor-pointer"
                  />
                </th>
                <th className={cn(thClass, "text-slate-600 text-[11px] w-20")}>ID</th>
                <th className={thClass}>Title</th>
                <th className={thClass}>Category</th>
                <th className={thClass}>Suite</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Assignee</th>
                <th className={thClass}>Severity</th>
                <th className={thClass}>Last Run</th>
                <th className={thClass}>Created</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {categories.flatMap((cat) => [
                <tr key={`cat-${cat}`} className="bg-[#131313]">
                  <td
                    colSpan={colCount}
                    className="px-3 py-1 font-bold text-slate-500 text-[11px] uppercase tracking-[0.06em]"
                  >
                    {cat}
                  </td>
                </tr>,
                ...grouped[cat].map((tc) => (
                  <TestCaseTableRow
                    key={tc.id}
                    tc={tc}
                    selected={selected.has(tc.id)}
                    dragging={draggingTcId === tc.id}
                    onSelect={toggleSelect}
                    onDragStart={(id, e) => {
                      setDraggingTcId(id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("tcId", id);
                    }}
                    onDragEnd={() => setDraggingTcId(null)}
                    can={can}
                    userNames={userNames}
                    suites={suites}
                    flatSuites={flatSuites}
                    onSuiteChange={handleSuiteChange}
                  />
                )),
              ])}
            </tbody>
          </table>
        )}

        {/* ── Pagination ── */}
        {!loading && !loadError && totalResults > 0 && (
          <div className="flex items-center flex-wrap gap-2 mt-5 pt-4 border-t border-slate-900 text-[13px]">
            <span className="text-slate-500 whitespace-nowrap">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, totalResults)} of {totalResults} case{totalResults !== 1 ? "s" : ""}
            </span>

            <div className="flex-1" />

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1} className={pageBtnClass(page === 1)} title="First page">«</button>
                <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className={pageBtnClass(page === 1)}>‹ Prev</button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} className="text-slate-500 px-0.5">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={cn(
                          pageBtnClass(false),
                          "min-w-8",
                          p === page
                            ? "bg-primary text-primary-foreground border-primary font-semibold"
                            : "text-muted-foreground"
                        )}
                      >
                        {p}
                      </button>
                    ),
                  )}

                <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} className={pageBtnClass(page === totalPages)}>Next ›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className={pageBtnClass(page === totalPages)} title="Last page">»</button>
              </div>
            )}

            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-slate-500 whitespace-nowrap">Per page:</span>
              {([20, 50, 100] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => { setLimit(n); setPage(1); }}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded border cursor-pointer transition-colors",
                    limit === n
                      ? "bg-primary text-primary-foreground border-primary font-semibold"
                      : "bg-transparent text-slate-400 border-border hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Start Run modal ── */}
      {runModal && (
        <StartRunModal
          defaultName={runModal.defaultName}
          submitting={starting}
          onCancel={() => { setRunModal(null); setStarting(false); }}
          onSubmit={submitRunModal}
        />
      )}

      {/* ── Import modal ── */}
      {showImportModal && (
        <div
          onClick={closeImportModal}
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-modal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-lg p-7 w-[440px] max-w-[92vw]"
          >
            <h2 className="mt-0 mb-5 text-lg font-semibold">Import CSV</h2>

            {importResult ? (
              <>
                <p className="text-emerald-500 mb-2.5 text-[15px]">
                  ✓ {importResult.imported} case{importResult.imported !== 1 ? "s" : ""} imported
                  {importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}
                </p>
                {importResult.suiteCreated.length > 0 && (
                  <div className="my-2 mb-4">
                    <p className="text-slate-400 text-[13px] mb-1.5">New suites created:</p>
                    <ul className="m-0 pl-4 text-slate-300 text-[13px] leading-7">
                      {importResult.suiteCreated.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={() => {
                    toast({ title: `${importResult.imported} case${importResult.imported !== 1 ? "s" : ""} imported` });
                    closeImportModal();
                    setRefreshKey((k) => k + 1);
                  }}
                  className={cn(primaryBtnClass, "mt-2")}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                {importError && (
                  <p className="text-destructive text-[13px] mb-3.5">{importError}</p>
                )}

                <label className="block mb-4">
                  <span className="block text-sm text-muted-foreground mb-1.5">CSV File</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    className="text-foreground text-sm w-full"
                  />
                </label>

                <label className="block mb-5">
                  <span className="block text-sm text-muted-foreground mb-1.5">Format</span>
                  <select
                    value={importFormat}
                    onChange={(e) => setImportFormat(e.target.value as "qavibe" | "testrail")}
                    className={cn(inputClass, "w-full")}
                  >
                    <option value="qavibe">QAVibe CSV</option>
                    <option value="testrail">TestRail CSV</option>
                  </select>
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={handleImport}
                    disabled={!importFile || importing}
                    className={cn(primaryBtnClass, "inline-flex items-center gap-2", (!importFile || importing) && "opacity-50 cursor-not-allowed")}
                  >
                    {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                    {importing ? "Importing…" : "Import"}
                  </button>
                  <button onClick={closeImportModal} className={ghostBtnClass}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Class constants ────────────────────────────────────────────────────────────

const thClass = "px-3 py-2 font-medium";
const tdClass = "px-3 py-2.5";

const inputClass =
  "w-full bg-background border border-slate-600 text-foreground rounded px-2.5 py-[7px] text-sm box-border focus:outline-none focus:border-primary transition-colors";

const primaryBtnClass =
  "px-4 py-2 bg-primary text-primary-foreground border-none rounded text-sm cursor-pointer hover:bg-primary/90 transition-colors disabled:opacity-50";

const primaryLinkClass =
  "px-4 py-2 bg-primary text-primary-foreground rounded text-sm no-underline hover:bg-primary/90 transition-colors";

const runBtnClass =
  "px-4 py-2 bg-emerald-900 text-white border-none rounded text-sm cursor-pointer hover:bg-emerald-800 transition-colors disabled:opacity-50";

const ghostBtnClass =
  "px-4 py-2 bg-transparent text-muted-foreground border border-border rounded text-sm cursor-pointer hover:text-foreground transition-colors";

function pageBtnClass(disabled: boolean) {
  return cn(
    "px-2.5 py-1 bg-transparent border border-border rounded text-[13px] transition-colors",
    disabled ? "text-slate-600 cursor-not-allowed" : "text-muted-foreground cursor-pointer hover:text-foreground"
  );
}
