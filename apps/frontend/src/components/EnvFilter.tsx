"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const ENVS = ["", "staging", "production", "dev", "qa"] as const;

export default function EnvFilter({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(env: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (env) {
      params.set("environment", env);
    } else {
      params.delete("environment");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13, color: "#666" }}>Env:</span>
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          background: "#1a1a1a",
          border: "1px solid #333",
          color: current ? "#eee" : "#666",
          borderRadius: 4,
          padding: "5px 10px",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <option value="">All</option>
        {ENVS.filter(Boolean).map((env) => (
          <option key={env} value={env}>{env}</option>
        ))}
      </select>
    </div>
  );
}
