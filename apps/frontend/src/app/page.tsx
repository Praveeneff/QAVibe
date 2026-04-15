import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 32, fontFamily: "sans-serif", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1>QAVibe</h1>
      <p style={{ color: "#888" }}>Quality Assurance Management</p>
      <Link
        href="/test-cases"
        style={{
          display: "inline-block",
          marginTop: 16,
          padding: "10px 20px",
          background: "#0070f3",
          color: "#fff",
          borderRadius: 4,
          textDecoration: "none",
          fontSize: 14,
        }}
      >
        View Test Cases →
      </Link>
    </main>
  );
}
