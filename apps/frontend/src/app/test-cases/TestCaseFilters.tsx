"use client";

import { cn } from "@/lib/utils";
import type { TestCaseFilters as ApiFilters } from "@/lib/api";

export type ActiveFilters = Pick<ApiFilters, "search" | "category" | "severity" | "priority" | "status">;

export interface TestCaseFiltersProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  activeFilters: ActiveFilters;
  onFilterChange: (key: keyof ActiveFilters, value: string) => void;
  hasActiveFilters: boolean;
  totalResults: number;
  loading: boolean;
  onClear: () => void;
}

const filterSelectClass =
  "bg-popover border border-slate-800 text-muted-foreground rounded px-2 py-1 text-[13px] cursor-pointer focus:outline-none focus:border-primary transition-colors";

export default function TestCaseFilters({
  searchInput,
  onSearchChange,
  activeFilters,
  onFilterChange,
  hasActiveFilters,
  totalResults,
  loading,
  onClear,
}: TestCaseFiltersProps) {
  return (
    <div className="flex gap-2 items-center flex-wrap mb-5 px-3.5 py-2.5 bg-background border border-slate-900 rounded-md">
      <input
        type="search"
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search title or description…"
        className="flex-[1_1_200px] min-w-40 bg-card border border-slate-800 text-foreground rounded px-2.5 py-1 text-[13px] outline-none focus:border-primary transition-colors"
      />

      <select
        value={activeFilters.category ?? ""}
        onChange={(e) => onFilterChange("category", e.target.value)}
        className={filterSelectClass}
      >
        <option value="">Category</option>
        <option value="functional">Functional</option>
        <option value="e2e">E2E</option>
        <option value="integration">Integration</option>
        <option value="smoke">Smoke</option>
        <option value="sanity">Sanity</option>
        <option value="regression">Regression</option>
      </select>

      <select
        value={activeFilters.severity ?? ""}
        onChange={(e) => onFilterChange("severity", e.target.value)}
        className={filterSelectClass}
      >
        <option value="">Severity</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      <select
        value={activeFilters.priority ?? ""}
        onChange={(e) => onFilterChange("priority", e.target.value)}
        className={filterSelectClass}
      >
        <option value="">Priority</option>
        <option value="P1">P1</option>
        <option value="P2">P2</option>
        <option value="P3">P3</option>
        <option value="P4">P4</option>
      </select>

      <select
        value={activeFilters.status ?? ""}
        onChange={(e) => onFilterChange("status", e.target.value)}
        className={filterSelectClass}
      >
        <option value="">Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="draft">Draft</option>
      </select>

      <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">
        {loading ? "…" : `${totalResults} result${totalResults !== 1 ? "s" : ""}`}
      </span>

      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="bg-transparent border border-border text-slate-400 rounded px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap hover:text-foreground transition-colors"
        >
          ✕ Clear
        </button>
      )}
    </div>
  );
}
