"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

// ── Severity badge ────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  critical: { bg: "#3d0a0a", fg: "#f44336" },
  high:     { bg: "#3d2a0a", fg: "#ff9800" },
  medium:   { bg: "#0a1f3d", fg: "#64b5f6" },
  low:      { bg: "#222",    fg: "#888" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const { bg, fg } = SEVERITY_COLORS[severity] ?? { bg: "#222", fg: "#888" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: bg, color: fg, fontWeight: 600 }}>
      {severity}
    </span>
  );
}

// ── Last-run cell ─────────────────────────────────────────────────────────────

function LastRunCell({
  results,
}: {
  results?: { status: string; createdAt: string; testRunId: string }[];
}) {
  const last = results?.[0];
  if (!last) return (
    <span style={{ fontSize: 12, color: "#444" }}>— Never run</span>
  );

  const statusColors: Record<string, string> = {
    pass:    "#22c55e",
    fail:    "#ef4444",
    blocked: "#f59e0b",
    skip:    "#6b7280",
    pending: "#555",
  };

  const color = statusColors[last.status] ?? "#555";

  const date = new Date(last.createdAt);
  const formatted = date.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        color,
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          display: "inline-block",
        }} />
        {last.status}
      </span>
      <span style={{ fontSize: 11, color: "#555" }}>{formatted}</span>
    </div>
  );
}

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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#111",
    border: "1px solid #444",
    color: "#eee",
    borderRadius: 4,
    padding: "7px 10px",
    fontSize: 14,
    boxSizing: "border-box",
  };

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: 8,
          padding: 28,
          width: 460,
          maxWidth: "92vw",
        }}
      >
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>Start Test Run</h2>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Run name *</span>
          <input value={form.name} onChange={set("name")} style={inputStyle} autoFocus />
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Environment</span>
          <select value={form.environment} onChange={set("environment")} style={inputStyle}>
            <option value="staging">staging</option>
            <option value="production">production</option>
            <option value="dev">dev</option>
            <option value="qa">qa</option>
          </select>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <label>
            <span style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Browser</span>
            <select value={form.browser} onChange={set("browser")} style={inputStyle}>
              <option value="">— optional —</option>
              <option value="chrome">chrome</option>
              <option value="firefox">firefox</option>
              <option value="safari">safari</option>
              <option value="edge">edge</option>
              <option value="other">other</option>
            </select>
          </label>
          <label>
            <span style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Device</span>
            <select value={form.device} onChange={set("device")} style={inputStyle}>
              <option value="desktop">desktop</option>
              <option value="mobile">mobile</option>
              <option value="tablet">tablet</option>
            </select>
          </label>
        </div>

        <label style={{ display: "block", marginBottom: 24 }}>
          <span style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Build version</span>
          <input
            value={form.buildVersion}
            onChange={set("buildVersion")}
            placeholder="v1.0.0 or commit hash"
            style={inputStyle}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onSubmit(form)}
            disabled={!form.name.trim() || submitting}
            style={{
              padding: "8px 16px",
              background: "#0070f3",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 14,
              cursor: !form.name.trim() || submitting ? "not-allowed" : "pointer",
              opacity: !form.name.trim() || submitting ? 0.5 : 1,
            }}
          >
            {submitting ? "Starting…" : "Start Run"}
          </button>
          <button onClick={onCancel} style={ghostBtnStyleModal}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Hoisted style used by modal (before ghostBtnStyle is defined at module level)
const ghostBtnStyleModal: React.CSSProperties = {
  padding: "8px 16px",
  background: "transparent",
  color: "#aaa",
  border: "1px solid #333",
  borderRadius: 4,
  fontSize: 14,
  cursor: "pointer",
};

// ── Sidebar items ─────────────────────────────────────────────────────────────

function SidebarItem({
  label, count, active, onClick,
}: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "8px 16px",
        background: active ? "#0d1f33" : "transparent",
        border: "none",
        borderLeft: active ? "2px solid #0070f3" : "2px solid transparent",
        color: active ? "#fff" : "#aaa",
        cursor: "pointer",
        fontSize: 14,
        textAlign: "left",
        boxSizing: "border-box",
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 12, background: "#222", padding: "1px 7px", borderRadius: 10, color: "#666" }}>
        {count}
      </span>
    </button>
  );
}

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
  const indent = depth * 12;
  const depthColors = ["#0070f3", "#a855f7", "#f59e0b"];
  const activeColor = depthColors[depth] ?? "#0070f3";

  return (
    <div>
      <div
        onClick={() => onSelect(suite.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDragEnter={(e) => { e.preventDefault(); onDragEnter(suite.id); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(suite.id); }}
        style={{
          display: "flex",
          alignItems: "center",
          padding: `6px 8px 6px ${16 + indent}px`,
          background: isDragOver ? "#0d2d1a" : active ? "#0d1f33" : "transparent",
          borderLeft: active ? `3px solid ${activeColor}` : "3px solid transparent",
          outline: isDragOver ? "1px dashed #4caf50" : "none",
          cursor: "pointer",
          gap: 4,
          boxSizing: "border-box",
        }}
      >
        {/* Collapse toggle */}
        <span
          onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
          style={{
            fontSize: 10,
            color: "#555",
            width: 12,
            flexShrink: 0,
            cursor: hasChildren ? "pointer" : "default",
          }}
        >
          {hasChildren ? (collapsed ? "▶" : "▼") : "•"}
        </span>

        {/* Suite icon by depth */}
        <span style={{ fontSize: 12, flexShrink: 0 }}>
          {depth === 0 ? "📁" : depth === 1 ? "📂" : "📋"}
        </span>

        {/* Suite name */}
        <span
          title={suite.name}
          style={{
            flex: 1,
            fontSize: 13,
            color: active ? activeColor : "#bbb",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {suite.name}
        </span>

        {/* Test case count badge */}
        <span style={{
          fontSize: 11,
          background: "#222",
          padding: "1px 5px",
          borderRadius: 10,
          color: "#666",
          flexShrink: 0,
        }}>
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
              style={{
                background: "#111",
                border: "1px solid #0070f3",
                borderRadius: 4,
                padding: "2px 6px",
                color: "#eee",
                fontSize: 12,
                width: 120,
                outline: "none",
                flexShrink: 0,
              }}
            />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAddingChild(true);
              }}
              title={depth === 0 ? "Add Sub-suite" : "Add Group"}
              style={{
                background: "transparent",
                border: "1px solid #333",
                color: "#888",
                borderRadius: 3,
                padding: "1px 4px",
                fontSize: 11,
                cursor: "pointer",
                flexShrink: 0,
                visibility: hovered ? "visible" : "hidden",
              }}
            >
              +
            </button>
          )
        )}

        {/* BRD button */}
        <button
          onClick={(e) => { e.stopPropagation(); onBrd(suite.id); }}
          title="Generate from BRD into this suite"
          style={{
            background: "#1a1a2e",
            border: "1px solid #2a2a5a",
            color: "#818cf8",
            borderRadius: 3,
            padding: "2px 5px",
            fontSize: 11,
            cursor: "pointer",
            flexShrink: 0,
            visibility: hovered ? "visible" : "hidden",
          }}
        >
          📄
        </button>

        {/* Run button */}
        <button
          onClick={(e) => { e.stopPropagation(); onRun(suite.id, suite.name); }}
          title="Run suite"
          style={{
            background: "#0a2a0a",
            border: "1px solid #1a5a1a",
            color: "#4caf50",
            borderRadius: 3,
            padding: "2px 6px",
            fontSize: 11,
            cursor: "pointer",
            flexShrink: 0,
            visibility: hovered ? "visible" : "hidden",
          }}
        >
          ▶
        </button>

        {/* Delete button — admin only */}
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(suite.id, suite.name); }}
            title="Delete suite"
            style={{
              background: "transparent",
              border: "1px solid #3d1a1a",
              color: "#f87171",
              borderRadius: 3,
              padding: "2px 5px",
              fontSize: 11,
              cursor: "pointer",
              flexShrink: 0,
              visibility: hovered ? "visible" : "hidden",
            }}
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

// ── Filter bar ────────────────────────────────────────────────────────────────

const filterSelectStyle: React.CSSProperties = {
  background: "#161616",
  border: "1px solid #2a2a2a",
  color: "#aaa",
  borderRadius: 4,
  padding: "5px 8px",
  fontSize: 13,
  cursor: "pointer",
};

// ── Main component ────────────────────────────────────────────────────────────

type Selection = string | null;

type ActiveFilters = Pick<TestCaseFilters, "search" | "category" | "severity" | "priority" | "status">;

export default function TestCasesClient() {
  const { loading: authLoading, user } = useRequireAuth();
  const isAdmin = user?.role === "admin";
  const { can } = usePermission();
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

  const buildBreadcrumb = (suiteId: string, tree: TestSuite[], path: string[] = []): string[] | null => {
    for (const s of tree) {
      if (s.id === suiteId) return [...path, s.name];
      if (s.children?.length) {
        const found = buildBreadcrumb(suiteId, s.children, [...path, s.name]);
        if (found) return found;
      }
    }
    return null;
  };

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
    getSuites()
      .then((data) => {
        setSuites(data);
        setSuitesError(null);
      })
      .catch((err) => {
        console.error("Failed to load suites:", err);
        setSuitesError("Could not load suites. Please refresh.");
      });
    // Sidebar counts from two cheap count-only calls
    Promise.all([
      getTestCases({ limit: 1 }),
      getTestCases({ suiteId: "unassigned", limit: 1 }),
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
        // Resolve createdBy IDs → display names (cached — no duplicate fetches)
        const ids = [...new Set(result.data.map((tc) => tc.createdBy).filter(Boolean))] as string[];
        if (ids.length > 0) {
          Promise.all(ids.map((id) => getUser(id).then((u) => [id, u.name] as const)))
            .then((pairs) => setUserNames((prev) => ({ ...prev, ...Object.fromEntries(pairs) })))
            .catch(() => {}); // silent — never break the list
        }
        // Fetch project members for the assign dropdown
        const projectId = getActiveProjectId();
        if (projectId && token) {
          getProjectMembers(projectId, token).then(setMembers).catch(() => {});
        }
      })
      .catch(() => setLoadError("Could not reach backend. Make sure it is running on port 3001."))
      .finally(() => setLoading(false));
  }, [selectedId, activeFilters, page, limit, refreshKey]);

  // ── Focus new suite input when shown ──────────────────────────────────────
  useEffect(() => {
    if (showNewSuite) newSuiteInputRef.current?.focus();
  }, [showNewSuite]);

  // ── Sync filter state → URL (skip initial mount to avoid redundant replace) ─
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
    // keep filters across suite changes — user can clear manually
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
      const result = await getTestCases({ suiteId, fields: "id", limit: 1000 });
      if (result.data.length === 0) { alert("No test cases in this suite."); return; }
      setRunModal({
        caseIds: result.data.map((c) => c.id),
        defaultName: `${suiteName} — ${new Date().toLocaleDateString()}`,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load suite cases");
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
      alert(err instanceof Error ? err.message : "Failed to create run");
      setStarting(false);
    }
  }

  // ── Run all matching results (fields=id fast path) ────────────────────────

  async function handleRunAllMatching() {
    try {
      const result = await getTestCases({
        ...(selectedId !== null ? { suiteId: selectedId } : {}),
        ...activeFilters,
        fields: "id",
        limit: 1000,
      });
      if (result.data.length === 0) { alert("No test cases match the current filters."); return; }
      const filterDesc = activeFilters.search
        ? `"${activeFilters.search}"`
        : activeFilters.category ?? activeFilters.severity ?? activeFilters.priority ?? "filtered";
      setRunModal({
        caseIds: result.data.map((c) => c.id),
        defaultName: `${filterDesc} — ${new Date().toLocaleDateString()}`,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load matching cases");
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
      alert(err instanceof Error ? err.message : "Export failed");
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
      const token = getStoredToken();
      const res = await fetch(`${base}/test-cases/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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
      // Refresh current page
      const filters: TestCaseFilters = {
        ...(selectedId !== null ? { suiteId: selectedId } : {}),
        ...activeFilters,
        page,
        limit,
      };
      const result = await getTestCases(filters);
      setTestCases(result.data);
      // Refresh sidebar counts
      const [all, unassigned] = await Promise.all([
        getTestCases({ limit: 1 }),
        getTestCases({ suiteId: "unassigned", limit: 1 }),
      ]);
      setTotalCount(all.total);
      setUnassignedCount(unassigned.total);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update suite");
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
      await createSuite(newSuiteName.trim());
      // Refetch instead of local append — ensures _count
      // and ordering are correct from the server
      const updated = await getSuites();
      setSuites(updated);
      setNewSuiteName("");
      setShowNewSuite(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create suite");
    } finally {
      setSavingSuite(false);
    }
  }

  const handleAddChild = async (
    parentId: string,
    parentDepth: number,
    name: string
  ) => {
    await createSuite(name, undefined, parentId);
    const updated = await getSuites();
    setSuites(updated);
  };

  const handleDrop = async (suiteId: string) => {
    if (!draggingTcId) return;
    setDragOverSuiteId(null);
    setDraggingTcId(null);
    await handleSuiteChange(draggingTcId, suiteId);
  };

  // ── Suite delete (admin only) ──────────────────────────────────────────────

  async function handleDeleteSuite(suiteId: string, suiteName: string) {
    if (!confirm(`Delete suite "${suiteName}"? Test cases will become unassigned.`)) return;
    try {
      await deleteSuite(suiteId);
      setSuites((prev) => prev.filter((s) => s.id !== suiteId));
      if (selectedId === suiteId) selectSuite(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete suite");
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

  const selectedSuite = selectedId && selectedId !== "unassigned"
    ? suites.find((s) => s.id === selectedId)
    : null;

  const colCount = 11;

  const heading =
    selectedSuite ? selectedSuite.name
    : selectedId === "unassigned" ? "Unassigned"
    : "Test Cases";

  // ── Render ─────────────────────────────────────────────────────────────────

  const errorParam = searchParams.get("error");
  if (authLoading) return null;

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 45px)" }}>

      {/* Admin-required banner */}
      {errorParam === "admin-required" && (
        <div style={{
          position: "fixed", top: 48, left: 0, right: 0, zIndex: 100,
          background: "#3d1414", borderBottom: "1px solid #7f2020",
          padding: "12px 32px", color: "#fca5a5", fontSize: 14, textAlign: "center",
        }}>
          Admin access required. You have been redirected.
        </div>
      )}

      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 260,
          minWidth: 260,
          borderRight: "1px solid #1e1e1e",
          display: "flex",
          flexDirection: "column",
          paddingTop: 12,
          overflowY: "auto",
          background: "#0a0a0a",
        }}
      >
        {draggingTcId && (
          <div style={{
            padding: "6px 12px",
            background: "#0d2d1a",
            border: "1px dashed #4caf50",
            borderRadius: 6,
            margin: "4px 8px",
            fontSize: 11,
            color: "#4caf50",
            textAlign: "center",
          }}>
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

        <div style={{ borderTop: "1px solid #1e1e1e", margin: "8px 0" }} />

        {suitesError && (
          <p style={{ color: "#f87171", fontSize: 12, padding: "4px 8px" }}>
            {suitesError}
          </p>
        )}

        <div style={{ padding: "8px 12px" }}>
          {showNewSuite ? (
            <input
              ref={newSuiteInputRef}
              value={newSuiteName}
              onChange={(e) => setNewSuiteName(e.target.value)}
              onKeyDown={handleNewSuiteKeyDown}
              onBlur={() => { setShowNewSuite(false); setNewSuiteName(""); }}
              placeholder="Suite name…"
              disabled={savingSuite}
              style={{
                width: "100%",
                background: "#161616",
                border: "1px solid #444",
                borderRadius: 4,
                color: "#eee",
                padding: "6px 8px",
                fontSize: 13,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          ) : (
            <button
              onClick={() => setShowNewSuite(true)}
              style={{
                width: "100%",
                background: "transparent",
                border: "1px dashed #333",
                color: "#666",
                borderRadius: 4,
                padding: "6px 8px",
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
                boxSizing: "border-box",
              }}
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
      <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{heading}</h1>
          <div style={{ display: "flex", gap: 8 }}>
            {selected.size > 0 && (
              <button
                onClick={() => handleStartRun(Array.from(selected), `Run ${new Date().toLocaleDateString()}`)}
                disabled={starting}
                style={runBtnStyle}
              >
                {starting ? "Starting…" : `▶ Start Run (${selected.size})`}
              </button>
            )}
            {selected.size === 0 && hasActiveFilters && totalResults > 0 && (
              <button
                onClick={handleRunAllMatching}
                disabled={starting}
                title={`Fetch all ${totalResults} matching IDs and start a run`}
                style={runBtnStyle}
              >
                {starting ? "Starting…" : `▶ Run all filtered (${totalResults})`}
              </button>
            )}
            <button
              onClick={() => { setImportResult(null); setImportError(""); setImportFile(null); setShowImportModal(true); }}
              style={ghostBtnStyle}
            >
              Import CSV
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              style={ghostBtnStyle}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            {can("create", "test_case") && (
              <Link
                href={
                  selectedId && selectedId !== "unassigned"
                    ? `/test-cases/new?suiteId=${selectedId}`
                    : "/test-cases/new"
                }
                style={linkBtnStyle}
              >
                + New
              </Link>
            )}
          </div>
        </div>

        {/* ── Bulk assign bar ── */}
        {selected.size > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px", background: "#1a1a2e",
            border: "1px solid #2563eb44", borderRadius: 8,
            marginBottom: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 13, color: "#60a5fa", fontWeight: 600 }}>
              {selected.size} selected
            </span>

            <button
              onClick={handleAssignToMe}
              disabled={assigning}
              style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 12,
                fontWeight: 500, cursor: "pointer",
                background: "#1e3a5f", color: "#60a5fa",
                border: "1px solid #2563eb44",
              }}
            >
              {assigning ? "Assigning…" : "Assign to Me"}
            </button>

            {can("assign_others", "test_case") && (
              <>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowAssignDropdown(p => !p)}
                    disabled={assigning}
                    style={{
                      padding: "5px 12px", borderRadius: 6, fontSize: 12,
                      fontWeight: 500, cursor: "pointer",
                      background: "transparent", color: "#eee",
                      border: "1px solid #333",
                    }}
                  >
                    Assign to… ▾
                  </button>
                  {showAssignDropdown && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, zIndex: 50,
                      background: "#1a1a1a", border: "1px solid #2a2a2a",
                      borderRadius: 8, padding: 8, minWidth: 220, marginTop: 4,
                    }}>
                      {members.length === 0 && (
                        <div style={{ fontSize: 13, color: "#555", padding: "8px 12px" }}>
                          No members found
                        </div>
                      )}
                      {members.map(m => (
                        <div
                          key={m.userId}
                          onClick={() => handleAssign(m.userId)}
                          style={{
                            padding: "8px 12px", cursor: "pointer",
                            fontSize: 13, color: "#eee", borderRadius: 4,
                            display: "flex", alignItems: "center", gap: 8,
                          }}
                          onMouseEnter={e =>
                            (e.currentTarget.style.background = "#2a2a2a")}
                          onMouseLeave={e =>
                            (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: "#1e3a5f", color: "#60a5fa",
                            display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 10, fontWeight: 600,
                          }}>
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
                  style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 12,
                    fontWeight: 500, cursor: "pointer",
                    background: "transparent", color: "#f87171",
                    border: "1px solid #5c202044",
                  }}
                >
                  Unassign
                </button>
              </>
            )}

            <button
              onClick={() => setSelected(new Set())}
              style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 12,
                cursor: "pointer", background: "transparent",
                color: "#666", border: "1px solid #333", marginLeft: "auto",
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* ── Filter bar ── */}
        <div style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
          padding: "10px 14px",
          background: "#111",
          border: "1px solid #1e1e1e",
          borderRadius: 6,
        }}>
          {/* Search */}
          <input
            type="search"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search title or description…"
            style={{
              flex: "1 1 200px",
              minWidth: 160,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              color: "#eee",
              borderRadius: 4,
              padding: "5px 10px",
              fontSize: 13,
            }}
          />

          {/* Category */}
          <select
            value={activeFilters.category ?? ""}
            onChange={(e) => setFilter("category", e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">Category</option>
            <option value="functional">Functional</option>
            <option value="e2e">E2E</option>
            <option value="integration">Integration</option>
            <option value="smoke">Smoke</option>
            <option value="sanity">Sanity</option>
            <option value="regression">Regression</option>
          </select>

          {/* Severity */}
          <select
            value={activeFilters.severity ?? ""}
            onChange={(e) => setFilter("severity", e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Priority */}
          <select
            value={activeFilters.priority ?? ""}
            onChange={(e) => setFilter("priority", e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">Priority</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
            <option value="P4">P4</option>
          </select>

          {/* Status */}
          <select
            value={activeFilters.status ?? ""}
            onChange={(e) => setFilter("status", e.target.value)}
            style={filterSelectStyle}
          >
            <option value="">Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="draft">Draft</option>
          </select>

          {/* Result count + clear */}
          <span style={{ fontSize: 12, color: "#555", marginLeft: "auto", whiteSpace: "nowrap" }}>
            {loading ? "…" : `${totalResults} result${totalResults !== 1 ? "s" : ""}`}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                background: "transparent",
                border: "1px solid #333",
                color: "#888",
                borderRadius: 4,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Error / loading / empty states */}
        {loadError && <p style={{ color: "#f44336" }}>{loadError}</p>}
        {loading && <p style={{ color: "#666" }}>Loading…</p>}
        {!loading && !loadError && testCases.length === 0 && (
          <p style={{ color: "#666" }}>
            {hasActiveFilters ? "No test cases match the current filters." : "No test cases."}
          </p>
        )}

        {/* Table */}
        {!loading && !loadError && testCases.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2a2a2a", textAlign: "left", color: "#777" }}>
                <th style={th}>
                  <input
                    type="checkbox"
                    checked={selected.size === testCases.length && testCases.length > 0}
                    onChange={toggleAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={{ ...th, color: "#555", fontSize: 11, width: 80 }}>ID</th>
                <th style={th}>Title</th>
                <th style={th}>Category</th>
                <th style={th}>Suite</th>
                <th style={th}>Status</th>
                <th style={th}>Assignee</th>
                <th style={th}>Severity</th>
                <th style={th}>Last Run</th>
                <th style={th}>Created</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {categories.flatMap((cat) => [
                <tr key={`cat-${cat}`} style={{ background: "#131313" }}>
                  <td
                    colSpan={colCount}
                    style={{
                      padding: "5px 12px",
                      fontWeight: 700,
                      color: "#777",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {cat}
                  </td>
                </tr>,
                ...grouped[cat].map((tc) => (
                  <tr
                    key={tc.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingTcId(tc.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("tcId", tc.id);
                    }}
                    onDragEnd={() => setDraggingTcId(null)}
                    style={{
                      borderBottom: "1px solid #1e1e1e",
                      background: selected.has(tc.id) ? "#0d1f33" : "transparent",
                      opacity: draggingTcId === tc.id ? 0.4 : 1,
                      cursor: "grab",
                    }}
                  >
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={selected.has(tc.id)}
                        onChange={() => toggleSelect(tc.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: "#555",
                        background: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        borderRadius: 3,
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                      }}>
                        {tc.tcId || "—"}
                      </span>
                    </td>
                    <td style={td}>
                      <div>{tc.title}</div>
                      {tc.suiteId && (() => {
                        const crumbs = buildBreadcrumb(tc.suiteId, suites);
                        return crumbs ? (
                          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                            {crumbs.join(" › ")}
                          </div>
                        ) : null;
                      })()}
                      {tc.createdBy && (
                        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                          Added by {userNames[tc.createdBy] || tc.createdBy}
                        </div>
                      )}
                    </td>
                    <td style={td}>{tc.category}</td>
                    <td style={{ ...td, padding: "6px 12px" }}>
                      <select
                        value={tc.suiteId ?? ""}
                        onChange={(e) => handleSuiteChange(tc.id, e.target.value || null)}
                        style={{
                          background: "#161616",
                          border: "1px solid #2a2a2a",
                          color: tc.suiteId ? "#5b9bd5" : "#555",
                          borderRadius: 3,
                          padding: "3px 6px",
                          fontSize: 12,
                          cursor: "pointer",
                          maxWidth: 150,
                        }}
                      >
                        <option value="">No suite</option>
                        {flatSuites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {"  ".repeat(s.depth)}{s.depth > 0 ? "└ " : ""}{s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: 12,
                          background: tc.status === "active" ? "#0a3d0a" : "#3d1a0a",
                          color: tc.status === "active" ? "#4caf50" : "#ff8a50",
                        }}
                      >
                        {tc.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {(tc as any).assignee ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: "#1e3a5f", color: "#60a5fa",
                            display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 10, fontWeight: 600,
                          }}>
                            {((tc as any).assignee?.name ?? (tc as any).assignee?.email ?? "?")
                              .slice(0, 2).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 12, color: "#888" }}>
                            {(tc as any).assignee?.name ?? (tc as any).assignee?.email}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "#444" }}>—</span>
                      )}
                    </td>
                    <td style={td}><SeverityBadge severity={tc.severity} /></td>
                    <td style={td}><LastRunCell results={tc.results} /></td>
                    <td style={td}>{new Date(tc.createdAt).toLocaleDateString()}</td>
                    <td style={td}>
                      {can("edit", "test_case") && (
                        <Link href={`/test-cases/${tc.id}`} style={{ color: "#0070f3", textDecoration: "none" }}>
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        )}

        {/* ── Pagination ── */}
        {!loading && !loadError && totalResults > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid #1e1e1e",
            fontSize: 13,
          }}>
            {/* Showing X–Y of Z */}
            <span style={{ color: "#666", whiteSpace: "nowrap" }}>
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, totalResults)} of {totalResults} case{totalResults !== 1 ? "s" : ""}
            </span>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Page navigation — only when multiple pages */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  style={pageBtnStyle(page === 1)}
                  title="First page"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 1}
                  style={pageBtnStyle(page === 1)}
                >
                  ‹ Prev
                </button>

                {/* Page number pills — first + last always shown, ±1 around current */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} style={{ color: "#555", padding: "0 2px" }}>…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        style={{
                          ...pageBtnStyle(false),
                          background: p === page ? "#0070f3" : "transparent",
                          color: p === page ? "#fff" : "#aaa",
                          borderColor: p === page ? "#0070f3" : "#333",
                          minWidth: 32,
                          fontWeight: p === page ? 600 : 400,
                        }}
                      >
                        {p}
                      </button>
                    ),
                  )}

                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page === totalPages}
                  style={pageBtnStyle(page === totalPages)}
                >
                  Next ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  style={pageBtnStyle(page === totalPages)}
                  title="Last page"
                >
                  »
                </button>
              </div>
            )}

            {/* Page size selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
              <span style={{ color: "#555", whiteSpace: "nowrap" }}>Per page:</span>
              {([20, 50, 100] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => { setLimit(n); setPage(1); }}
                  style={{
                    padding: "3px 9px",
                    fontSize: 12,
                    background: limit === n ? "#0070f3" : "transparent",
                    color: limit === n ? "#fff" : "#888",
                    border: `1px solid ${limit === n ? "#0070f3" : "#333"}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: limit === n ? 600 : 400,
                  }}
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
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: 8,
              padding: 28,
              width: 440,
              maxWidth: "92vw",
            }}
          >
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>Import CSV</h2>

            {importResult ? (
              <>
                <p style={{ color: "#4caf50", margin: "0 0 10px", fontSize: 15 }}>
                  ✓ {importResult.imported} case{importResult.imported !== 1 ? "s" : ""} imported
                  {importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}
                </p>
                {importResult.suiteCreated.length > 0 && (
                  <div style={{ margin: "8px 0 18px" }}>
                    <p style={{ color: "#888", fontSize: 13, margin: "0 0 6px" }}>New suites created:</p>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "#bbb", fontSize: 13, lineHeight: 1.7 }}>
                      {importResult.suiteCreated.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={() => { closeImportModal(); setRefreshKey((k) => k + 1); }}
                  style={{ ...linkBtnStyleBtn, marginTop: 8 }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                {importError && (
                  <p style={{ color: "#f44336", fontSize: 13, margin: "0 0 14px" }}>{importError}</p>
                )}

                <label style={{ display: "block", marginBottom: 16 }}>
                  <span style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>CSV File</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    style={{ color: "#eee", fontSize: 14, width: "100%" }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: 22 }}>
                  <span style={{ display: "block", fontSize: 13, color: "#aaa", marginBottom: 6 }}>Format</span>
                  <select
                    value={importFormat}
                    onChange={(e) => setImportFormat(e.target.value as "qavibe" | "testrail")}
                    style={{
                      width: "100%",
                      background: "#111",
                      border: "1px solid #444",
                      color: "#eee",
                      borderRadius: 4,
                      padding: "7px 10px",
                      fontSize: 14,
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="qavibe">QAVibe CSV</option>
                    <option value="testrail">TestRail CSV</option>
                  </select>
                </label>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleImport}
                    disabled={!importFile || importing}
                    style={{
                      ...linkBtnStyleBtn,
                      opacity: !importFile || importing ? 0.5 : 1,
                      cursor: !importFile || importing ? "not-allowed" : "pointer",
                    }}
                  >
                    {importing ? "Importing…" : "Import"}
                  </button>
                  <button onClick={closeImportModal} style={ghostBtnStyle}>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px 12px" };

const linkBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#0070f3",
  color: "#fff",
  borderRadius: 4,
  textDecoration: "none",
  fontSize: 14,
};

const linkBtnStyleBtn: React.CSSProperties = {
  padding: "8px 16px",
  background: "#0070f3",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontSize: 14,
  cursor: "pointer",
};

const runBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#1a6b1a",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  fontSize: 14,
  cursor: "pointer",
};

const ghostBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "transparent",
  color: "#aaa",
  border: "1px solid #333",
  borderRadius: 4,
  fontSize: 14,
  cursor: "pointer",
};

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    background: "transparent",
    color: disabled ? "#444" : "#aaa",
    border: "1px solid #333",
    borderRadius: 4,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
