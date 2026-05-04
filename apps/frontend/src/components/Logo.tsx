"use client";

import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// LogoIcon
// A custom Q-mark glyph on a purple→violet gradient rounded square.
// Built entirely from inline SVG so it renders crisply at any size and requires
// no image assets, web fonts, or external requests.
//
// Design details (36×36 viewBox):
//   • Gradient background #8b5cf6 → #a78bfa (top-left → bottom-right)
//   • Frosted top-half highlight (white 12% → 0%)
//   • Q glyph: a white donut ring (outer r=8.5, inner r=5) centred at (17,17)
//     using SVG even-odd fill to punch the hole, plus a diagonal tail stroke
// ─────────────────────────────────────────────────────────────────────────────

export interface LogoIconProps {
  /** Rendered size in px — icon is always square. Default: 36 */
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 36, className }: LogoIconProps) {
  // useId gives a stable unique string; colons are invalid in SVG id attributes.
  const uid      = useId().replace(/:/g, "");
  const gradId   = `qv-g-${uid}`;
  const glowId   = `qv-h-${uid}`;
  const clipId   = `qv-c-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-label="Quality Vibe"
      className={cn("shrink-0", className)}
    >
      <defs>
        {/* Primary gradient: purple → violet */}
        <linearGradient id={gradId} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>

        {/* Inner highlight: white top-half glow */}
        <linearGradient id={glowId} x1="18" y1="0" x2="18" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="white" stopOpacity="0.00" />
        </linearGradient>

        {/* Clip to rounded square so tail doesn't escape corners */}
        <clipPath id={clipId}>
          <rect width="36" height="36" rx="9" />
        </clipPath>
      </defs>

      {/* ── Background ── */}
      <rect width="36" height="36" rx="9" fill={`url(#${gradId})`} />
      <rect width="36" height="36" rx="9" fill={`url(#${glowId})`} />

      {/* ── Q glyph ── */}
      <g clipPath={`url(#${clipId})`}>
        {/*
          Ring — two concentric circles as a single even-odd path.
          Outer: center (17,17) r=8.5   Inner: center (17,17) r=5
          Even-odd fill rule punches the inner circle out as a hole.
        */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="white"
          d={[
            // Outer circle (clockwise, two half-arcs)
            "M 17 8.5",
            "A 8.5 8.5 0 1 0 17 25.5",
            "A 8.5 8.5 0 1 0 17 8.5",
            "Z",
            // Inner circle — same direction; evenodd cancels overlap
            "M 17 12",
            "A 5 5 0 1 0 17 22",
            "A 5 5 0 1 0 17 12",
            "Z",
          ].join(" ")}
        />

        {/*
          Tail — a short diagonal stroke extending from the lower-right of
          the ring, like the leg of a traditional Q letterform.
          Start point (23, 22) sits on the outer ring edge at ~39°.
        */}
        <path
          d="M 23 22 L 28.5 29"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LogoFull — icon + wordmark side by side
// ─────────────────────────────────────────────────────────────────────────────

export interface LogoFullProps {
  /** Icon size in px. Default: 30 */
  iconSize?: number;
  /** Text size Tailwind class. Default: "text-base" */
  textSize?: string;
  /** If provided, the whole logo is wrapped in a Next.js Link */
  href?: string;
  className?: string;
}

export function LogoFull({
  iconSize = 30,
  textSize = "text-base",
  href = "/",
  className,
}: LogoFullProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5 group select-none", className)}>
      <LogoIcon
        size={iconSize}
        className="transition-transform duration-200 group-hover:scale-105"
      />
      <span className={cn("leading-none font-sans", textSize)}>
        <span className="font-bold   text-foreground tracking-tight">Quality</span>
        <span className="font-light  text-primary    tracking-tight"> Vibe</span>
      </span>
    </span>
  );

  return href ? (
    <Link href={href} className="no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
      {content}
    </Link>
  ) : (
    content
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LogoWordmark — text only, no icon
// ─────────────────────────────────────────────────────────────────────────────

export interface LogoWordmarkProps {
  size?: "sm" | "md" | "lg" | "xl";
  href?: string;
  className?: string;
}

const sizeMap: Record<NonNullable<LogoWordmarkProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
  xl: "text-5xl",
};

export function LogoWordmark({ size = "md", href, className }: LogoWordmarkProps) {
  const content = (
    <span className={cn("inline font-sans leading-none select-none", sizeMap[size], className)}>
      <span className="font-bold  text-foreground tracking-tight">Quality</span>
      <span className="font-light text-primary    tracking-tight"> Vibe</span>
    </span>
  );

  return href ? (
    <Link href={href} className="no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
      {content}
    </Link>
  ) : (
    content
  );
}
