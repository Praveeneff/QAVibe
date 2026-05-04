"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import UserMenu from "./UserMenu";
import { LogoFull } from "./Logo";

const links = [
  { href: "/test-cases", label: "Test Cases" },
  { href: "/runs",       label: "Runs" },
  { href: "/api-tests",  label: "API Tests" },
  { href: "/my-tasks",   label: "My Tasks" },
];

const linksAfterUsage = [
  { href: "/dashboard",  label: "Dashboard" },
];

const aiLinks = [
  { href: "/generate-brd",      label: "Generate from BRD" },
  { href: "/generate-codebase", label: "Generate from Codebase" },
];

const adminLinks = [
  { href: "/admin/ai-logs",    label: "AI Logs" },
  { href: "/admin/duplicates", label: "Duplicate Scanner" },
  { href: "/admin/users",      label: "Users" },
];

// Shared link class — muted default, foreground on hover, smooth transition
const navLink =
  "text-muted-foreground hover:text-foreground transition-colors duration-150 text-sm";

export default function Nav() {
  const { user, loading, activeProject } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-5 px-6 py-0 h-[45px] border-b border-border/60 bg-background/95 backdrop-blur-sm text-sm">

      {/* ── Brand ── */}
      <Link
        href="/"
        className="flex items-center gap-2 mr-1 font-bold text-primary hover:text-primary/80 transition-colors shrink-0"
      >
        <span className="w-6 h-6 rounded bg-primary/15 border border-primary/25 flex items-center justify-center text-xs font-bold text-primary">
          Q
        </span>
        QAVibe
      </Link>

      {/* ── Active project badge ── */}
      {!loading && user && (
        <div className="flex items-center gap-2 mr-1">
          {activeProject ? (
            <span className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1 text-xs leading-none">
              <span className="text-primary font-bold leading-none">▶</span>
              <span className="text-foreground font-medium max-w-[140px] truncate">
                {activeProject.name}
              </span>
              <Link
                href="/projects"
                className="text-muted-foreground/60 hover:text-muted-foreground transition-colors ml-0.5"
              >
                Switch
              </Link>
            </span>
          ) : (
            <Link
              href="/projects"
              className="flex items-center gap-1 bg-muted/50 border border-border hover:border-primary/30 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              No project
              <span className="text-muted-foreground/50 ml-0.5">→ Select</span>
            </Link>
          )}
        </div>
      )}

      {/* ── Nav links (only when project is active) ── */}
      {!loading && user && (
        activeProject ? (
          <>
            {links.map(({ href, label }) => (
              <Link key={href} href={href} className={navLink}>
                {label}
              </Link>
            ))}

            {!isAdmin && (
              <Link href="/my-usage" className={navLink}>
                My Usage
              </Link>
            )}

            {linksAfterUsage.map(({ href, label }) => (
              <Link key={href} href={href} className={navLink}>
                {label}
              </Link>
            ))}

            {/* ── AI section ── */}
            <span className="text-border/80 select-none" aria-hidden>|</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
              AI
            </span>
            {aiLinks.map(({ href, label }) => (
              <Link key={href} href={href} className={navLink}>
                {label}
              </Link>
            ))}

            {/* ── Admin section ── */}
            {isAdmin && (
              <>
                <span className="text-border/80 select-none" aria-hidden>|</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
                  Admin
                </span>
                {adminLinks.map(({ href, label }) => (
                  <Link key={href} href={href} className={navLink}>
                    {label}
                  </Link>
                ))}
                {activeProject && (
                  <Link
                    href={`/projects/${activeProject.id}/settings`}
                    className={navLink}
                  >
                    Settings
                  </Link>
                )}
              </>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground/60">
            Select a project to get started
          </span>
        )
      )}

      {/* ── Spacer ── */}
      <span className="flex-1" />

      {/* ── User menu ── */}
      <UserMenu />
    </nav>
  );
}
