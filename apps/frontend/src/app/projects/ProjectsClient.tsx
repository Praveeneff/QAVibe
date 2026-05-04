"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
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
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUserId(payload.sub ?? null);
    } catch { /* ignore */ }
    fetch(`${BASE_URL}/projects`, { headers: { Authorization: `Bearer ${token}` } })
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
    setActiveProject({ id: project.id, name: project.name, description: project.description ?? null, role });
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-start justify-center px-8 py-12">
        <p className="text-slate-500 text-sm">Loading projects…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-start justify-center px-8 py-12">
        <div className="bg-destructive/10 border border-red-900 rounded-md px-4 py-3 text-red-400 text-[13px]">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-8 py-12">
      <div className="w-full max-w-[880px]">

        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="m-0 text-[26px] font-bold text-foreground">Switch project</h1>
            <p className="mt-1.5 mb-0 text-[13px] text-slate-500">Select a workspace to continue</p>
          </div>
          {isAdmin && (
            <Link href="/projects/new" className={newBtnClass}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              New project
            </Link>
          )}
        </div>

        {/* Empty state */}
        {projects.length === 0 ? (
          <div className="bg-card border border-slate-800 rounded-xl px-10 py-15 text-center">
            <p className="m-0 mb-4 text-[15px] text-slate-400">
              {isAdmin
                ? "No projects yet — create your first one"
                : "No projects assigned to you yet. Contact your admin."}
            </p>
            {isAdmin && (
              <Link href="/projects/new" className={newBtnClass}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                  <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                New project
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-[0.07em] mb-3">
              Your projects — {projects.length}
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {projects.map((project) => {
                const role = userId ? myRole(project, userId) : "MEMBER";
                const isActive = activeProject?.id === project.id;
                const initials = project.name.slice(0, 2).toUpperCase();

                return (
                  <div
                    key={project.id}
                    className={cn(
                      "bg-card rounded-xl p-5 flex flex-col gap-3 border",
                      isActive ? "border-blue-600" : "border-slate-800"
                    )}
                  >
                    {/* Avatar + role badge row */}
                    <div className="flex items-center justify-between">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-medium text-blue-400 border border-blue-900 shrink-0",
                        isActive ? "bg-blue-900/40" : "bg-blue-950/30"
                      )}>
                        {initials}
                      </div>
                      <span className={cn(
                        "text-[11px] font-semibold rounded px-2 py-0.5 uppercase tracking-[0.05em] border",
                        role === "OWNER"
                          ? "bg-blue-950/40 text-blue-400 border-blue-800/30"
                          : "bg-emerald-950/30 text-emerald-400 border-emerald-800/30"
                      )}>
                        {role}
                      </span>
                    </div>

                    {/* Project name */}
                    <h2 className="m-0 text-base font-bold text-foreground">{project.name}</h2>

                    {/* Description */}
                    {project.description && (
                      <p className="m-0 text-[13px] text-slate-400 leading-relaxed">{project.description}</p>
                    )}

                    {/* Divider */}
                    <div className="h-px bg-slate-900" />

                    {/* Footer row */}
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500">
                        Created {new Date(project.createdAt).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </span>
                      <span className="text-xs text-slate-500">0 test cases</span>
                    </div>

                    {/* Select / Currently active button */}
                    <button
                      onClick={isActive ? undefined : () => selectProject(project)}
                      className={cn(
                        "w-full py-2 rounded-lg text-[13px] font-medium border transition-colors",
                        isActive
                          ? "bg-blue-950/40 border-blue-800/30 text-blue-400 cursor-default"
                          : "bg-transparent border-border text-foreground cursor-pointer hover:bg-slate-700/30"
                      )}
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

const newBtnClass =
  "bg-blue-600 text-white border-none rounded-lg px-4 py-2 text-[13px] font-semibold cursor-pointer no-underline inline-flex items-center gap-1.5 hover:bg-blue-500 transition-colors";
