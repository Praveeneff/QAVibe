"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import MembersTab from "./MembersTab";
import TokenLimitsTab from "./TokenLimitsTab";
import TokenUsageTab from "./TokenUsageTab";

type Tab = "members" | "token-limits" | "token-usage";

const TABS: { key: Tab; label: string }[] = [
  { key: "members",      label: "Members" },
  { key: "token-limits", label: "Token Limits" },
  { key: "token-usage",  label: "Token Usage" },
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
