"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth, getStoredToken } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import MembersTab from "./MembersTab";
import TokenLimitsTab from "./TokenLimitsTab";
import TokenUsageTab from "./TokenUsageTab";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Tab = "members" | "token-limits" | "token-usage" | "permissions";

const TABS: { key: Tab; label: string }[] = [
  { key: "members",      label: "Members" },
  { key: "token-limits", label: "Token Limits" },
  { key: "token-usage",  label: "Token Usage" },
  { key: "permissions",  label: "Permissions" },
];

function SettingsContent() {
  const { id: projectId } = useParams<{ id: string }>();
  const { activeProject, user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<Tab>("members");

  useEffect(() => {
    if (user !== null && !isAdmin) {
      router.replace("/projects");
    }
  }, [isAdmin, user, router]);

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background px-8 py-12">
      <div className="w-full max-w-[900px] mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="m-0 text-[26px] font-bold text-foreground">Project Settings</h1>
          <p className="mt-1.5 mb-0 text-[13px] text-slate-400">
            {activeProject?.name}
            {activeProject?.role && (
              <span className="text-slate-600 ml-1.5">· {activeProject.role}</span>
            )}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-800">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "bg-transparent border-none border-b-2 px-[18px] py-2.5 text-[13px] font-medium cursor-pointer -mb-px transition-colors",
                activeTab === key
                  ? "text-foreground border-b-blue-600"
                  : "text-slate-500 border-b-transparent hover:text-slate-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-7">
          {activeTab === "members"      && <MembersTab     projectId={projectId} />}
          {activeTab === "token-limits" && <TokenLimitsTab projectId={projectId} />}
          {activeTab === "token-usage"  && <TokenUsageTab  projectId={projectId} />}
          {activeTab === "permissions"  && <PermissionsTab projectId={projectId} />}
        </div>

      </div>
    </div>
  );
}

export default function ProjectSettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}

// ── Permissions Tab ───────────────────────────────────────────────────────────

function PermissionsTab({ projectId }: { projectId: string }) {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = getStoredToken();

  useEffect(() => {
    if (!projectId || !token) return;
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/admin/projects/${projectId}/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load permissions (${res.status})`);
        return res.json();
      })
      .then(setPermissions)
      .catch((e) => {
        setError(e.message);
        setPermissions([]);
      })
      .finally(() => setLoading(false));
  }, [projectId, token]);

  async function togglePermission(resource: string, action: string, currentValue: boolean) {
    if (!projectId || !token) return;
    const key = `${resource}-${action}`;
    setSaving(key);
    try {
      await fetch(`${BASE_URL}/admin/projects/${projectId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: "tester", resource, action, allowed: !currentValue }),
      });
      setPermissions((prev) =>
        prev.map((p) =>
          p.resource === resource && p.action === action
            ? { ...p, allowed: !currentValue }
            : p
        )
      );
    } finally {
      setSaving(null);
    }
  }

  if (error) return <div className={errorBoxClass}>{error}</div>;
  if (loading) return <p className="text-slate-500 text-sm">Loading permissions…</p>;

  const grouped = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) acc[perm.resource] = [];
    acc[perm.resource].push(perm);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-slate-400 m-0">
        Configure what testers can do in this project. Admin always has full access.
      </p>

      {Object.entries(grouped).map(([resource, perms]) => (
        <div key={resource} className="bg-card border border-slate-800 rounded-lg p-5">
          <h3 className="m-0 mb-4 text-sm font-semibold text-foreground capitalize">
            {resource.replace("_", " ")}
          </h3>

          <div className="flex flex-col gap-3">
            {(perms as any[]).map((perm) => {
              const key = `${perm.resource}-${perm.action}`;
              const isSaving = saving === key;
              return (
                <label
                  key={key}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 bg-[#111] rounded-md",
                    isSaving ? "cursor-wait opacity-60" : "cursor-pointer",
                  )}
                >
                  <span className="text-[13px] text-muted-foreground">
                    {formatAction(perm.action)}
                  </span>
                  <input
                    type="checkbox"
                    checked={perm.allowed}
                    disabled={isSaving}
                    onChange={() => togglePermission(perm.resource, perm.action, perm.allowed)}
                    className="w-4 h-4 cursor-pointer disabled:cursor-wait"
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatAction(action: string): string {
  const labels: Record<string, string> = {
    create:        "Create",
    edit:          "Edit",
    delete:        "Delete",
    assign_self:   "Assign to self",
    assign_others: "Assign to others",
    execute:       "Execute",
    view_all:      "View all runs",
    view_own:      "View own runs only",
    view_report:   "View reports",
  };
  return labels[action] ?? action;
}

const errorBoxClass = "bg-destructive/10 border border-red-900 rounded-md px-4 py-3 text-red-400 text-[13px]";
