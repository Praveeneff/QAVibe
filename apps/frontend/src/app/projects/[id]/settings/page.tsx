"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={styles.title}>Project Settings</h1>
          <p style={styles.subtitle}>
            {activeProject?.name}
            {activeProject?.role && (
              <span style={{ color: "#555", marginLeft: 6 }}>
                · {activeProject.role}
              </span>
            )}
          </p>
        </div>

        {/* Tab bar */}
        <div style={styles.tabBar}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                ...styles.tabBtn,
                color:        activeTab === key ? "#fff"    : "#666",
                borderBottom: activeTab === key ? "2px solid #2563eb" : "2px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ marginTop: 28 }}>
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
        if (!res.ok) {
          throw new Error(`Failed to load permissions (${res.status})`);
        }
        return res.json();
      })
      .then(setPermissions)
      .catch((e) => {
        setError(e.message);
        setPermissions([]);
      })
      .finally(() => setLoading(false));
  }, [projectId, token]);

  async function togglePermission(
    resource: string,
    action: string,
    currentValue: boolean,
  ) {
    if (!projectId || !token) return;
    const key = `${resource}-${action}`;
    setSaving(key);
    try {
      await fetch(`${BASE_URL}/admin/projects/${projectId}/permissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: "tester",
          resource,
          action,
          allowed: !currentValue,
        }),
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

  if (error) {
    return (
      <div style={{
        background: "#2d1414",
        border: "1px solid #5c2020",
        borderRadius: 6,
        padding: "12px 16px",
        color: "#f87171",
        fontSize: 13,
      }}>
        {error}
      </div>
    );
  }

  if (loading) {
    return <p style={{ color: "#666", fontSize: 14 }}>Loading permissions…</p>;
  }

  const grouped = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) acc[perm.resource] = [];
    acc[perm.resource].push(perm);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
        Configure what testers can do in this project. Admin always has full access.
      </p>

      {Object.entries(grouped).map(([resource, perms]) => (
        <div
          key={resource}
          style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: 20,
          }}
        >
          <h3 style={{
            margin: "0 0 16px",
            fontSize: 14,
            fontWeight: 600,
            color: "#eee",
            textTransform: "capitalize",
          }}>
            {resource.replace("_", " ")}
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(perms as any[]).map((perm) => {
              const key = `${perm.resource}-${perm.action}`;
              const isSaving = saving === key;
              return (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "#111",
                    borderRadius: 6,
                    cursor: isSaving ? "wait" : "pointer",
                    opacity: isSaving ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#ccc" }}>
                    {formatAction(perm.action)}
                  </span>
                  <input
                    type="checkbox"
                    checked={perm.allowed}
                    disabled={isSaving}
                    onChange={() =>
                      togglePermission(perm.resource, perm.action, perm.allowed)
                    }
                    style={{ width: 18, height: 18, cursor: isSaving ? "wait" : "pointer" }}
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#111",
    padding: "48px 32px",
  },
  container: {
    width: "100%",
    maxWidth: 900,
    margin: "0 auto",
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: "#fff",
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#888",
  },
  tabBar: {
    display: "flex",
    gap: 4,
    borderBottom: "1px solid #2a2a2a",
  },
  tabBtn: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    marginBottom: -1,
  },
};
