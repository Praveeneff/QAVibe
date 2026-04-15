"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import UserMenu from "./UserMenu";

const links = [
  { href: "/test-cases",    label: "Test Cases" },
  { href: "/runs",          label: "Runs" },
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
  const { user, loading } = useAuth();
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

      {!loading && user && (
        <>
          {links.map(({ href, label }) => (
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
            </>
          )}
        </>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      <UserMenu />
    </nav>
  );
}
