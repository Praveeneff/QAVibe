"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import UserMenu from "./UserMenu";

const links = [
  { href: "/test-cases",    label: "Test Cases" },
  { href: "/runs",          label: "Runs" },
  { href: "/my-tasks",      label: "My Tasks" },
];

const linksAfterUsage = [
  { href: "/dashboard",     label: "Dashboard" },
];

const aiLinks = [
  { href: "/generate-brd",       label: "Generate from BRD" },
  { href: "/generate-codebase",  label: "Generate from Codebase" },
];

const adminLinks = [
  { href: "/admin/ai-logs",    label: "AI Logs" },
  { href: "/admin/duplicates", label: "Duplicate Scanner" },
];

export default function Nav() {
  const { user, loading, activeProject } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      gap: 24,
      padding: "12px 32px",
      borderBottom: "1px solid #222",
      background: "#0a0a0a",
      fontSize: 14,
    }}>
      <Link href="/" style={{ color: "#fff", textDecoration: "none", fontWeight: 600, marginRight: 8 }}>
        QAVibe
      </Link>

      {/* Project indicator */}
      {!loading && user && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
          {activeProject ? (
            <span style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#1a1a2e", border: "1px solid #2a2a4a",
              borderRadius: 6, padding: "3px 10px", fontSize: 12,
            }}>
              <span style={{ color: "#60a5fa", fontWeight: 600 }}>▶</span>
              <span style={{ color: "#ddd", fontWeight: 500 }}>{activeProject.name}</span>
              <Link href="/projects" style={{ color: "#555", textDecoration: "none", fontSize: 11, marginLeft: 2 }}>
                Switch
              </Link>
            </span>
          ) : (
            <Link href="/projects" style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "#1a1a1a", border: "1px solid #333",
              borderRadius: 6, padding: "3px 10px", fontSize: 12,
              color: "#666", textDecoration: "none",
            }}>
              No project
              <span style={{ color: "#444", fontSize: 11 }}>→ Select</span>
            </Link>
          )}
        </div>
      )}

      {!loading && user && (
        activeProject ? (
          <>
            {links.map(({ href, label }) => (
              <Link key={href} href={href} style={{ color: "#aaa", textDecoration: "none" }}>
                {label}
              </Link>
            ))}

            {!isAdmin && (
              <Link href="/my-usage" style={{ color: "#aaa", textDecoration: "none" }}>
                My Usage
              </Link>
            )}

            {linksAfterUsage.map(({ href, label }) => (
              <Link key={href} href={href} style={{ color: "#aaa", textDecoration: "none" }}>
                {label}
              </Link>
            ))}

            {/* AI section — visible to all authenticated users */}
            <span style={{ color: "#333", userSelect: "none" }}>|</span>
            <span style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              AI
            </span>
            {aiLinks.map(({ href, label }) => (
              <Link key={href} href={href} style={{ color: "#aaa", textDecoration: "none" }}>
                {label}
              </Link>
            ))}

            {/* Admin section — only admins */}
            {isAdmin && (
              <>
                <span style={{ color: "#333", userSelect: "none" }}>|</span>
                <span style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Admin
                </span>
                {adminLinks.map(({ href, label }) => (
                  <Link key={href} href={href} style={{ color: "#aaa", textDecoration: "none" }}>
                    {label}
                  </Link>
                ))}
                {activeProject && (
                  <Link
                    href={`/projects/${activeProject.id}/settings`}
                    style={{ color: "#aaa", textDecoration: "none" }}
                  >
                    Settings
                  </Link>
                )}
              </>
            )}
          </>
        ) : (
          <span style={{ fontSize: 13, color: "#555" }}>
            Select a project to get started
          </span>
        )
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      <UserMenu />
    </nav>
  );
}
