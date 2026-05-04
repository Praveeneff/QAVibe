"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth, getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function NewProjectPage() {
  const router = useRouter();
  const { setActiveProject } = useAuth();

  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Project name is required"); return; }

    setError(null);
    setLoading(true);

    try {
      const token = getStoredToken();
      if (!token) { router.push("/login"); return; }

      const res = await fetch(`${BASE_URL}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }

      const project = await res.json();

      let role: "OWNER" | "MEMBER" = "OWNER";
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const me = project.members?.find((m: any) => m.userId === payload.sub);
        if (me) role = me.role;
      } catch { /* use default OWNER */ }

      setActiveProject({ id: project.id, name: project.name, description: project.description ?? null, role });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <div className="bg-card border border-slate-800 rounded-xl px-12 py-10 w-full max-w-[480px] flex flex-col">

        <Link href="/projects" className="text-[13px] text-blue-400 no-underline hover:text-blue-300">
          ← Back to Projects
        </Link>

        <div className="mt-5">
          <h1 className="m-0 text-[22px] font-bold text-foreground">New Project</h1>
          <p className="mt-1.5 mb-0 text-[13px] text-slate-500">Create a project to organise your test work</p>
        </div>

        {error && (
          <div className="mt-5 bg-destructive/10 border border-red-900 rounded-md px-3.5 py-2.5 text-red-400 text-[13px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Project Name *</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bank App"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what is this project about?"
              rows={3}
              className={cn(inputClass, "resize-y leading-relaxed")}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "bg-blue-600 text-white border-none rounded-lg py-[11px] text-sm font-semibold transition-colors",
              loading ? "opacity-70 cursor-not-allowed" : "cursor-pointer hover:bg-blue-500",
            )}
          >
            {loading ? "Creating…" : "Create Project"}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelClass = "text-xs text-slate-400 uppercase tracking-[0.06em]";
const inputClass = "bg-background border border-border rounded-md px-3 py-[9px] text-foreground text-sm outline-none w-full box-border font-inherit focus:border-primary transition-colors";
