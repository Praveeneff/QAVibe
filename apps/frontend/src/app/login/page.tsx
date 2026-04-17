"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const router    = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      const stored = localStorage.getItem("activeProject");
      router.push(stored ? "/dashboard" : "/projects");
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#111",
    }}>
      <form onSubmit={handleSubmit} style={{
        background: "#1a1a1a",
        border: "1px solid #2a2a2a",
        borderRadius: 12,
        padding: "40px 48px",
        width: 360,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff" }}>Sign in</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#666" }}>
            Welcome back to QAVibe
          </p>
        </div>

        {error && (
          <div style={{
            background: "#2d1414",
            border: "1px solid #5c2020",
            borderRadius: 6,
            padding: "10px 14px",
            color: "#f87171",
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 6,
              padding: "9px 12px",
              color: "#eee",
              fontSize: 14,
              outline: "none",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Password
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 6,
              padding: "9px 12px",
              color: "#eee",
              fontSize: 14,
              outline: "none",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? "#1d3a5c" : "#2563eb",
            border: "none",
            borderRadius: 7,
            padding: "11px 0",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ margin: 0, fontSize: 13, color: "#666", textAlign: "center" }}>
          No account?{" "}
          <Link href="/register" style={{ color: "#60a5fa", textDecoration: "none" }}>
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
