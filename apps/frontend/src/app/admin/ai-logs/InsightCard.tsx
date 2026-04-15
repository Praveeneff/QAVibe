"use client";

import { useState } from "react";

const DISPLAY_NAMES: Record<string, string> = {
  gemini:     "Gemini",
  openai:     "OpenAI",
  claude:     "Claude",
  openrouter: "OpenRouter",
};

function display(provider: string): string {
  return DISPLAY_NAMES[provider.toLowerCase()] ?? provider;
}

interface Props {
  /** Provider names in recommended order (already sorted by page). Empty = no data. */
  ranked: string[];
}

export default function InsightCard({ ranked }: Props) {
  const [copied, setCopied] = useState(false);

  // Hide entirely when no logs
  if (ranked.length === 0) return null;

  async function handleCopy() {
    const text = ranked.map((p, i) => `${i + 1}. ${display(p)}`).join("  ");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for non-secure contexts
      prompt("Copy this:", text);
    }
  }

  return (
    <div
      style={{
        background: "#161b2e",
        border: "1px solid #2a3a5a",
        borderLeft: "3px solid #3b82f6",
        borderRadius: 8,
        padding: "16px 20px",
        marginTop: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <p style={{ margin: 0, fontSize: 14, color: "#bbb", lineHeight: 1.6 }}>
        {ranked.length === 1 ? (
          "Only one provider has data — generate more to get ranking insights"
        ) : (
          <>
            Based on your generation history, recommended provider order is:{" "}
            {ranked.map((p, i) => (
              <span key={p}>
                <strong style={{ color: "#eee" }}>
                  {i + 1}.&nbsp;{display(p)}
                </strong>
                {i < ranked.length - 1 && (
                  <span style={{ color: "#444" }}> &nbsp;&nbsp;</span>
                )}
              </span>
            ))}
          </>
        )}
      </p>

      {ranked.length > 1 && (
        <button
          onClick={handleCopy}
          style={{
            flexShrink: 0,
            padding: "6px 14px",
            background: copied ? "#1a3a1a" : "transparent",
            border: `1px solid ${copied ? "#4caf50" : "#3b82f6"}`,
            color: copied ? "#4caf50" : "#5b9bd5",
            borderRadius: 4,
            fontSize: 13,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {copied ? "✓ Copied!" : "Copy order"}
        </button>
      )}
    </div>
  );
}
