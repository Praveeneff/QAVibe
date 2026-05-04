import Link from "next/link";
import { LogoWordmark } from "@/components/Logo";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-45px)] flex flex-col items-center justify-center gap-6 px-8 text-center">
      <LogoWordmark size="lg" />
      <p className="text-muted-foreground text-lg max-w-sm">
        AI-powered QA management for modern engineering teams.
      </p>
      <Link
        href="/test-cases"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-md font-medium text-sm hover:bg-primary/90 transition-colors"
      >
        View Test Cases →
      </Link>
    </main>
  );
}
