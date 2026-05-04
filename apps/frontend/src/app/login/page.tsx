"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const { login } = useAuth();
  const router    = useRouter();
  const { toast } = useToast();

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
      toast({ title: "Welcome back!" });
      const stored = localStorage.getItem("activeProject");
      router.push(stored ? "/dashboard" : "/projects");
    } catch (err: any) {
      const msg = err?.message ?? "Invalid credentials";
      setError(msg);
      toast({ variant: "destructive", title: "Login failed", description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-45px)] flex items-center justify-center px-4">
      {/* Subtle radial glow behind the card */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 50% 38%, rgba(139,92,246,0.15) 0%, rgba(20,184,166,0.04) 55%, transparent 75%)",
        }}
      />

      <Card className="w-full max-w-[400px] border-border/60 bg-card shadow-2xl shadow-black/40">
        <CardHeader className="pb-6 pt-8 px-8 space-y-1">
          {/* Brand mark */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <span className="text-primary text-sm font-bold">Q</span>
            </div>
            <span className="text-sm font-semibold text-muted-foreground tracking-wide">
              QAVibe
            </span>
          </div>

          <CardTitle className="text-2xl font-bold text-foreground">
            Sign in
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Welcome back — enter your credentials to continue
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="px-8 space-y-5">
            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-red-400 animate-fade-in">
                <span className="mt-px leading-none text-base">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="bg-background/60 border-border focus-visible:ring-primary/50"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-background/60 border-border focus-visible:ring-primary/50"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>

            <p className="text-sm text-muted-foreground text-center">
              No account?{" "}
              <Link
                href="/register"
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Register
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
