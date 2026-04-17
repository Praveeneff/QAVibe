"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  members: { userId: string; role: "OWNER" | "MEMBER" }[];
}

function myRole(project: Project, userId: string): "OWNER" | "MEMBER" {
  const m = project.members.find((m) => m.userId === userId);
  return m?.role ?? "MEMBER";
}

export default function ProjectsClient() {
  const router = useRouter();
  const { user, activeProject, setActiveProject } = useAuth();
  const isAdmin = user?.role === "admin";
  const [projects, setProjects] = useState<Project[]>([]);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { router.push("/login"); return; }

    // Decode userId from JWT payload (base64 middle segment)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserId(payload.sub ?? null);
    } catch { /* ignore — role badge will just show MEMBER */ }

    fetch(`${BASE_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
        return res.json();
      })
      .then((data) => setProjects(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  function selectProject(project: Project) {
    const role = userId ? myRole(project, userId) : "MEMBER";
    const ap = {
      id:          project.id,
      name:        project.name,
      description: project.description ?? null,
      role,
    };
    setActiveProject(ap);
    router.push("/dashboard");
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.page}>
        <p style={{ color: "#666", fontSize: 14 }}>Loading projects…</p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Switch project</h1>
            <p style={styles.subtitle}>Select a workspace to continue</p>
          </div>
          {isAdmin && (
            <Link href="/projects/new" style={styles.newBtn}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              New project
            </Link>
          )}
        </div>

        {/* Empty state */}
        {projects.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={{ margin: "0 0 16px", fontSize: 15, color: "#888" }}>
              {isAdmin
                ? "No projects yet — create your first one"
                : "No projects assigned to you yet. Contact your admin."}
            </p>
            {isAdmin && (
              <Link href="/projects/new" style={styles.newBtn}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                New project
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Section label */}
            <div style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 12,
            }}>
              Your projects — {projects.length}
            </div>

            {/* Grid */}
            <div style={styles.grid}>
              {projects.map((project) => {
                const role = userId ? myRole(project, userId) : "MEMBER";
                const isActive = activeProject?.id === project.id;
                const initials = project.name.slice(0, 2).toUpperCase();

                return (
                  <div
                    key={project.id}
                    style={{
                      ...styles.card,
                      border: isActive ? "1px solid #2563eb" : "1px solid #2a2a2a",
                    }}
                  >
                    {/* Avatar + role badge row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: isActive ? "#1e3a5f" : "#1a1a2e",
                        color: "#60a5fa",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 500,
                        border: "1px solid #1e3a5f",
                        flexShrink: 0,
                      }}>
                        {initials}
                      </div>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 4,
                        padding: "2px 8px",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        background: role === "OWNER" ? "#1e3a5f" : "#1a2a1a",
                        color:      role === "OWNER" ? "#60a5fa" : "#4ade80",
                        border:     role === "OWNER" ? "1px solid #2563eb44" : "1px solid #16a34a44",
                      }}>
                        {role}
                      </span>
                    </div>

                    {/* Project name */}
                    <h2 style={styles.cardName}>{project.name}</h2>

                    {/* Description */}
                    {project.description && (
                      <p style={styles.cardDesc}>{project.description}</p>
                    )}

                    {/* Divider */}
                    <div style={{ height: 1, background: "#1e1e1e", margin: "12px 0" }} />

                    {/* Footer row */}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "#555" }}>
                        Created {new Date(project.createdAt).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </span>
                      <span style={{ fontSize: 12, color: "#555" }}>0 test cases</span>
                    </div>

                    {/* Select / Currently active button */}
                    <button
                      onClick={isActive ? undefined : () => selectProject(project)}
                      style={{
                        width: "100%",
                        padding: "8px 0",
                        borderRadius: 7,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: isActive ? "default" : "pointer",
                        background: isActive ? "#1e3a5f" : "transparent",
                        border:     isActive ? "1px solid #2563eb44" : "1px solid #333",
                        color:      isActive ? "#60a5fa" : "#eee",
                      }}
                    >
                      {isActive ? "Currently active" : "Select"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#111",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "48px 32px",
  },
  container: {
    width: "100%",
    maxWidth: 880,
  },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 32,
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
    color: "#666",
  },
  newBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
  },
  emptyState: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    padding: "60px 40px",
    textAlign: "center",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  cardName: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
  },
  cardDesc: {
    margin: 0,
    fontSize: 13,
    color: "#888",
    lineHeight: 1.5,
  },
  errorBox: {
    background: "#2d1414",
    border: "1px solid #5c2020",
    borderRadius: 6,
    padding: "12px 16px",
    color: "#f87171",
    fontSize: 13,
  },
};
