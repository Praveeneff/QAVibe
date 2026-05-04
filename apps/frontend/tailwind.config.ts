import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── shadcn/ui CSS-variable tokens ───────────────────────────────────
        border:      "hsl(var(--border))",
        input:       "hsl(var(--input))",
        ring:        "hsl(var(--ring))",
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ── QAVibe semantic palette — Purple & Teal ──────────────────────────
        // Use these directly: bg-qv-purple, text-qv-teal, border-qv-slate, etc.
        qv: {
          // Backgrounds
          navy:          "#0a0f1e",   // page bg
          "navy-2":      "#0d1526",   // slightly lighter
          slate:         "#1e293b",   // card / elevated surface
          "slate-2":     "#0f172a",   // deeper surface

          // Brand
          purple:        "#8b5cf6",   // primary — violet-500
          "purple-dim":  "#2e1065",   // purple-950 — dark tint for bg
          "purple-glow": "rgba(139,92,246,0.15)",
          violet:        "#a78bfa",   // violet-400 — hover/accent
          teal:          "#14b8a6",   // teal-500 — secondary
          "teal-dim":    "#042f2e",   // teal-950 — dark tint

          // Status
          emerald:       "#10b981",   // pass / success
          amber:         "#f59e0b",   // warning / blocked
          red:           "#ef4444",   // fail / destructive
          cyan:          "#06b6d4",   // info

          // Text
          ice:           "#f1f5f9",   // primary text
          muted:         "#94a3b8",   // secondary text
        },
      },
      fontSize: {
        // QAVibe typography scale [size, line-height]
        'xs':   ['0.6875rem', { lineHeight: '1rem' }],      // 11px - labels, timestamps
        'sm':   ['0.8125rem', { lineHeight: '1.25rem' }],   // 13px - body, descriptions
        'base': ['0.875rem',  { lineHeight: '1.5rem' }],    // 14px - default
        'lg':   ['1rem',      { lineHeight: '1.5rem' }],    // 16px - headings
        'xl':   ['1.125rem',  { lineHeight: '1.75rem' }],   // 18px - page titles
        '2xl':  ['1.375rem',  { lineHeight: '2rem' }],      // 22px - hero headings
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-from-top": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down":      "accordion-down 0.2s ease-out",
        "accordion-up":        "accordion-up 0.2s ease-out",
        "fade-in":             "fade-in 0.15s ease-out",
        "slide-in-from-top":   "slide-in-from-top 0.2s ease-out",
      },
      zIndex: {
        // ── QAVibe layer stack ───────────────────────────────────────────────
        // Use these instead of z-[N] magic numbers:
        //   z-banner   → fixed notification banners (below nav)
        //   z-dropdown → menus, popovers, comboboxes
        //   z-modal    → full-screen overlays and dialogs
        banner:   "100",
        dropdown: "200",
        modal:    "1000",
      },
      boxShadow: {
        "glow-purple": "0 0 24px rgba(139,92,246,0.25)",
        "glow-teal":   "0 0 24px rgba(20,184,166,0.20)",
        "card":        "0 4px 24px rgba(0,0,0,0.40)",
        "card-hover":  "0 8px 40px rgba(0,0,0,0.55)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
