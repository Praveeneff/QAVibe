"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { TestCase, TestSuite } from "@/lib/api";

// ── Severity badge ────────────────────────────────────────────────────────────

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-950 text-red-500",
  high:     "bg-amber-950 text-amber-500",
  medium:   "bg-blue-950 text-blue-400",
  low:      "bg-slate-800 text-slate-400",
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold", SEVERITY_CLASSES[severity] ?? "bg-slate-800 text-slate-400")}>
      {severity}
    </span>
  );
}

// ── Last-run cell ─────────────────────────────────────────────────────────────

const STATUS_DOT_CLASSES: Record<string, string> = {
  pass:    "text-emerald-500",
  fail:    "text-red-500",
  blocked: "text-amber-400",
  skip:    "text-slate-500",
  pending: "text-slate-500",
};

function LastRunCell({
  results,
}: {
  results?: { status: string; createdAt: string; testRunId: string }[];
}) {
  const last = results?.[0];
  if (!last) return <span className="text-xs text-slate-600">— Never run</span>;

  const colorClass = STATUS_DOT_CLASSES[last.status] ?? "text-slate-500";
  const formatted = new Date(last.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", colorClass)}>
        <span className="w-2 h-2 rounded-full shrink-0 inline-block bg-current" />
        {last.status}
      </span>
      <span className="text-[11px] text-slate-500">{formatted}</span>
    </div>
  );
}

// ── Breadcrumb helper ─────────────────────────────────────────────────────────

function buildBreadcrumb(suiteId: string, tree: TestSuite[], path: string[] = []): string[] | null {
  for (const s of tree) {
    if (s.id === suiteId) return [...path, s.name];
    if (s.children?.length) {
      const found = buildBreadcrumb(suiteId, s.children, [...path, s.name]);
      if (found) return found;
    }
  }
  return null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FlatSuite {
  id: string;
  name: string;
  depth: number;
}

export interface TestCaseTableRowProps {
  tc: TestCase;
  selected: boolean;
  dragging: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.DragEvent) => void;
  onDragEnd: () => void;
  can: (action: string, resource: string) => boolean;
  userNames: Record<string, string>;
  suites: TestSuite[];
  flatSuites: FlatSuite[];
  onSuiteChange: (tcId: string, suiteId: string | null) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const tdClass = "px-3 py-2.5";

export default function TestCaseTableRow({
  tc,
  selected,
  dragging,
  onSelect,
  onDragStart,
  onDragEnd,
  can,
  userNames,
  suites,
  flatSuites,
  onSuiteChange,
}: TestCaseTableRowProps) {
  const breadcrumbs = tc.suiteId ? buildBreadcrumb(tc.suiteId, suites) : null;
  const assignee = (tc as any).assignee;

  return (
    <tr
      draggable
      onDragStart={(e) => onDragStart(tc.id, e)}
      onDragEnd={onDragEnd}
      className={cn(
        "border-b border-slate-900 cursor-grab transition-opacity",
        selected ? "bg-blue-950/30" : "bg-transparent hover:bg-slate-900/30",
        dragging && "opacity-40",
      )}
    >
      {/* Checkbox */}
      <td className={tdClass}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(tc.id)}
          className="cursor-pointer"
        />
      </td>

      {/* TC ID */}
      <td className={tdClass}>
        <span className="text-[11px] font-mono text-slate-500 bg-card border border-slate-800 rounded px-1.5 py-0.5 whitespace-nowrap">
          {tc.tcId || "—"}
        </span>
      </td>

      {/* Title + breadcrumbs + creator */}
      <td className={tdClass}>
        <div>{tc.title}</div>
        {breadcrumbs && (
          <div className="text-[11px] text-slate-500 mt-0.5">
            {breadcrumbs.join(" › ")}
          </div>
        )}
        {tc.createdBy && (
          <div className="text-[11px] text-slate-500 mt-0.5">
            Added by {userNames[tc.createdBy] || tc.createdBy}
          </div>
        )}
      </td>

      {/* Category */}
      <td className={tdClass}>{tc.category}</td>

      {/* Suite dropdown */}
      <td className="px-3 py-1.5">
        <select
          value={tc.suiteId ?? ""}
          onChange={(e) => onSuiteChange(tc.id, e.target.value || null)}
          className={cn(
            "bg-popover border border-slate-800 rounded px-1.5 py-0.5 text-xs cursor-pointer max-w-[150px]",
            tc.suiteId ? "text-blue-400" : "text-slate-500",
          )}
        >
          <option value="">No suite</option>
          {flatSuites.map((s) => (
            <option key={s.id} value={s.id}>
              {"  ".repeat(s.depth)}{s.depth > 0 ? "└ " : ""}{s.name}
            </option>
          ))}
        </select>
      </td>

      {/* Status */}
      <td className={tdClass}>
        <span
          className={cn(
            "px-2 py-0.5 rounded-full text-xs",
            tc.status === "active"
              ? "bg-emerald-950 text-emerald-400"
              : "bg-orange-950 text-orange-400",
          )}
        >
          {tc.status}
        </span>
      </td>

      {/* Assignee */}
      <td className={tdClass}>
        {assignee ? (
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full bg-blue-900/60 text-blue-400 flex items-center justify-center text-[10px] font-semibold shrink-0">
              {(assignee?.name ?? assignee?.email ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <span className="text-xs text-slate-400">
              {assignee?.name ?? assignee?.email}
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Severity */}
      <td className={tdClass}><SeverityBadge severity={tc.severity} /></td>

      {/* Last run */}
      <td className={tdClass}><LastRunCell results={tc.results} /></td>

      {/* Created date */}
      <td className={tdClass}>{new Date(tc.createdAt).toLocaleDateString()}</td>

      {/* Edit link */}
      <td className={tdClass}>
        {can("edit", "test_case") && (
          <Link href={`/test-cases/${tc.id}`} className="text-primary hover:underline no-underline">
            Edit
          </Link>
        )}
      </td>
    </tr>
  );
}
