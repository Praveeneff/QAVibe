"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

export default function UserMenu() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex items-center gap-2.5">
        <Link href="/login" className="text-slate-400 no-underline text-[13px] hover:text-foreground transition-colors">
          Sign in
        </Link>
        <Link
          href="/register"
          className="bg-blue-600 text-white no-underline text-xs font-semibold px-3.5 py-1 rounded-md hover:bg-blue-500 transition-colors"
        >
          Register
        </Link>
      </div>
    );
  }

  const isAdmin = user.role === "admin";

  function handleLogout() {
    setOpen(false);
    logout();
    router.push("/login");
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-transparent border border-slate-800 rounded-lg px-3 py-[5px] cursor-pointer text-slate-300 text-[13px] hover:border-slate-600 transition-colors"
      >
        {/* Avatar circle */}
        <span className={cn(
          "w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
          isAdmin ? "bg-red-900" : "bg-blue-900"
        )}>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span>{user.name}</span>
        {/* Role pill */}
        <span className={cn(
          "text-[10px] font-bold uppercase tracking-[0.07em] px-[7px] py-0.5 rounded-full border",
          isAdmin
            ? "bg-red-950 text-red-400 border-red-800"
            : "bg-blue-950 text-blue-400 border-blue-800"
        )}>
          {user.role}
        </span>
        <span className="text-[10px] text-slate-500 ml-0.5">▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 bg-popover border border-slate-800 rounded-lg min-w-[200px] z-dropdown shadow-[0_8px_24px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="px-4 py-3 pb-2.5 text-xs text-slate-500 border-b border-slate-800 break-all">
            {user.email}
          </div>
          <button
            onClick={handleLogout}
            className="block w-full px-4 py-[11px] bg-transparent border-none text-left text-red-400 text-[13px] cursor-pointer hover:bg-slate-800/40 transition-colors"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
