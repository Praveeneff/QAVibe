"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function UserMenu() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/login" style={{ color: "#888", textDecoration: "none", fontSize: 13 }}>
          Sign in
        </Link>
        <Link
          href="/register"
          style={{
            background: "#2563eb",
            color: "#fff",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 14px",
            borderRadius: 6,
          }}
        >
          Register
        </Link>
      </div>
    );
  }

  const isAdmin = user.role === "admin";
  const roleBg    = isAdmin ? "#3b0f0f" : "#0f1f3b";
  const roleFg    = isAdmin ? "#f87171" : "#60a5fa";
  const roleBorder = isAdmin ? "#7f2020" : "#1d4ed8";

  function handleLogout() {
    setOpen(false);
    logout();
    router.push("/login");
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          padding: "5px 12px 5px 8px",
          cursor: "pointer",
          color: "#ccc",
          fontSize: 13,
        }}
      >
        {/* Avatar circle */}
        <span style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: isAdmin ? "#7f1d1d" : "#1e3a5f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          flexShrink: 0,
        }}>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span>{user.name}</span>
        {/* Role pill */}
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          padding: "2px 7px",
          borderRadius: 20,
          background: roleBg,
          color: roleFg,
          border: `1px solid ${roleBorder}`,
        }}>
          {user.role}
        </span>
        <span style={{ fontSize: 10, color: "#555", marginLeft: 2 }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          background: "#161616",
          border: "1px solid #2a2a2a",
          borderRadius: 8,
          minWidth: 200,
          zIndex: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}>
          {/* Email — muted, non-clickable */}
          <div style={{
            padding: "12px 16px 10px",
            fontSize: 12,
            color: "#555",
            borderBottom: "1px solid #222",
            wordBreak: "break-all",
          }}>
            {user.email}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              display: "block",
              width: "100%",
              padding: "11px 16px",
              background: "transparent",
              border: "none",
              textAlign: "left",
              color: "#f87171",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
