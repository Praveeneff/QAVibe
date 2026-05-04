"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const DISPLAY_NAMES: Record<string, string> = {
  gemini:     "Gemini",
  openai:     "OpenAI",
  claude:     "Claude",
  groq:       "Groq",
};

function display(provider: string): string {
  const key = provider.toLowerCase().split("/")[0];
  return DISPLAY_NAMES[key] ?? provider;
}

interface Props { ranked: string[] }

export default function InsightCard({ ranked }: Props) {
  const [copied, setCopied] = useState(false);
  if (ranked.length === 0) return null;

  async function handleCopy() {
    const text = ranked.map((p, i) => `${i + 1}. ${display(p)}`).join("  ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this:", text);
    }
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-4 flex-wrap px-4 py-3.5 rounded-lg border border-violet-500/15 bg-violet-500/5">
      <p className="m-0 text-[13px] text-slate-400 leading-relaxed">
        {ranked.length === 1 ? (
          "Only one provider has data — generate more to get ranking insights."
        ) : (
          <>
            Recommended provider order based on your history:{" "}
            {ranked.map((p, i) => (
              <span key={p}>
                <strong className="text-violet-300">{i + 1}.&nbsp;{display(p)}</strong>
                {i < ranked.length - 1 && <span className="text-slate-700">{"  "}</span>}
              </span>
            ))}
          </>
        )}
      </p>

      {ranked.length > 1 && (
        <button
          onClick={handleCopy}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-all cursor-pointer",
            copied
              ? "border-teal-500/30 bg-teal-500/10 text-teal-400"
              : "border-violet-500/30 text-violet-400 hover:bg-violet-500/10",
          )}
        >
          {copied ? "✓ Copied" : "Copy order"}
        </button>
      )}
    </div>
  );
}
