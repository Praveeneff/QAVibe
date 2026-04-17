"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

      // Determine the caller's role from the members array
      let role: "OWNER" | "MEMBER" = "OWNER"; // creator is always OWNER
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
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Back link */}
        <Link href="/projects" style={styles.backLink}>
          ← Back to Projects
        </Link>

        <div style={{ marginTop: 20 }}>
          <h1 style={styles.title}>New Project</h1>
          <p style={styles.subtitle}>Create a project to organise your test work</p>
        </div>

        {error && (
          <div style={styles.errorBox}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.fieldWrap}>
            <span style={styles.label}>Project Name *</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bank App"
              style={styles.input}
            />
          </label>

          <label style={styles.fieldWrap}>
            <span style={styles.label}>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what is this project about?"
              rows={3}
              style={{ ...styles.input, resize: "vertical", lineHeight: 1.5 }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitBtn,
              background: loading ? "#1d3a5c" : "#2563eb",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating…" : "Create Project"}
          </button>
        </form>
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
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
  },
  card: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 12,
    padding: "40px 48px",
    width: "100%",
    maxWidth: 480,
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  backLink: {
    fontSize: 13,
    color: "#60a5fa",
    textDecoration: "none",
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#fff",
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#666",
  },
  errorBox: {
    marginTop: 20,
    background: "#2d1414",
    border: "1px solid #5c2020",
    borderRadius: 6,
    padding: "10px 14px",
    color: "#f87171",
    fontSize: 13,
  },
  form: {
    marginTop: 24,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  input: {
    background: "#111",
    border: "1px solid #333",
    borderRadius: 6,
    padding: "9px 12px",
    color: "#eee",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  submitBtn: {
    border: "none",
    borderRadius: 7,
    padding: "11px 0",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    transition: "background 0.15s",
  },
};
