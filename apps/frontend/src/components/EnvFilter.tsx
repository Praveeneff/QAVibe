"use client";

import { cn } from "@/lib/utils";
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
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-slate-500">Env:</span>
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        className={cn(
          "bg-card border border-border rounded px-2.5 py-1 text-[13px] cursor-pointer focus:outline-none focus:border-primary transition-colors",
          current ? "text-foreground" : "text-slate-500"
        )}
      >
        <option value="">All</option>
        {ENVS.filter(Boolean).map((env) => (
          <option key={env} value={env}>{env}</option>
        ))}
      </select>
    </div>
  );
}
