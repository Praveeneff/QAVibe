"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getStoredToken } from "@/context/AuthContext";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "tester";
  createdAt: string;
  tokenUsed: number;
}

async function fetchUsers(): Promise<AdminUser[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/auth/admin/users`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function setRole(id: string, role: "admin" | "tester"): Promise<AdminUser> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/auth/admin/users/${id}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function RolePill({ role }: { role: "admin" | "tester" }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border",
      role === "admin"
        ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
        : "bg-slate-700/40 text-slate-400 border-slate-600/30",
    )}>
      {role}
    </span>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-lg bg-white/[0.04] animate-pulse", className)} />;
}

export default function UserManagementPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleToggle(user: AdminUser) {
    const newRole = user.role === "admin" ? "tester" : "admin";
    setChanging((p) => ({ ...p, [user.id]: true }));
    try {
      const updated = await setRole(user.id, newRole);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, role: updated.role } : u)));
      toast({ title: `${user.name} is now ${newRole}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Role change failed", description: err.message });
    } finally {
      setChanging((p) => ({ ...p, [user.id]: false }));
    }
  }

  return (
    <>
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-600/5 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-teal-500/4 blur-[100px]" />
      </div>

      <main className="px-8 py-8 min-h-screen">
        <div className="max-w-[900px]">
          <h1 className="m-0 mb-1 text-2xl font-bold text-foreground">User Management</h1>
          <p className="mt-0 mb-8 text-[13px] text-slate-500">
            Manage roles and review token usage across all accounts.
          </p>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 text-sm">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-white/[0.06] bg-[rgba(15,15,20,0.65)] backdrop-blur-sm overflow-hidden">
            {/* Table header */}
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-gradient-to-b from-violet-500 to-teal-500 inline-block shrink-0" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.07em]">
                {loading ? "Loading…" : `${users.length} user${users.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {loading ? (
              <div className="p-5 flex flex-col gap-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className={thClass}>User</th>
                    <th className={thClass}>Role</th>
                    <th className={thClass}>Tokens used</th>
                    <th className={thClass}>Joined</th>
                    <th className={cn(thClass, "text-right")}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isMe = u.id === me?.id;
                    const busy = changing[u.id] ?? false;
                    return (
                      <tr
                        key={u.id}
                        className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className={tdClass}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-violet-900/50 border border-violet-500/20 flex items-center justify-center text-[12px] font-bold text-violet-300 shrink-0">
                              {u.name.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-[13px] font-medium text-slate-200">
                                {u.name}
                                {isMe && (
                                  <span className="ml-2 text-[10px] font-semibold text-teal-500 uppercase tracking-wide">you</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-600">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className={tdClass}>
                          <RolePill role={u.role} />
                        </td>
                        <td className={tdClass}>
                          <span className="text-[13px] text-slate-400 tabular-nums">
                            {u.tokenUsed.toLocaleString()}
                          </span>
                        </td>
                        <td className={cn(tdClass, "text-[13px] text-slate-600")}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className={cn(tdClass, "text-right")}>
                          {isMe ? (
                            <span className="text-[12px] text-slate-700">—</span>
                          ) : (
                            <button
                              onClick={() => handleRoleToggle(u)}
                              disabled={busy}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors",
                                busy
                                  ? "border-slate-700 text-slate-600 cursor-not-allowed"
                                  : u.role === "admin"
                                    ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                                    : "border-violet-500/30 text-violet-400 hover:bg-violet-500/10 cursor-pointer",
                              )}
                            >
                              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                              {busy ? "Saving…" : u.role === "admin" ? "Demote" : "Promote"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

const thClass = "px-4 py-3 text-[11px] font-semibold text-slate-600 uppercase tracking-[0.06em] text-left";
const tdClass = "px-4 py-3.5";
