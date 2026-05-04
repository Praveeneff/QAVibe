"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function RegisterPage() {
  const { register } = useAuth();
  const router       = useRouter();
  const { toast }    = useToast();

  const [name,            setName]            = useState("");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState<string | null>(null);
  const [loading,         setLoading]         = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!name.trim()) {
      setError("Name cannot be blank or whitespace only");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim());
      toast({ title: "Account created!" });
      router.push("/");
    } catch (err: any) {
      const msg = err?.message ?? "Registration failed";
      setError(msg);
      toast({ variant: "destructive", title: "Registration failed", description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form
        onSubmit={handleSubmit}
        className="bg-card border border-slate-800 rounded-xl px-12 py-10 w-[360px] flex flex-col gap-5"
      >
        <div>
          <h1 className="m-0 text-[22px] font-bold text-foreground">Create account</h1>
          <p className="mt-1.5 mb-0 text-[13px] text-slate-500">
            First user becomes admin automatically
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-red-900 rounded-md px-3.5 py-2.5 text-red-400 text-[13px]">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400 uppercase tracking-[0.06em]">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            className="bg-background border border-border rounded-md px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400 uppercase tracking-[0.06em]">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="bg-background border border-border rounded-md px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary transition-colors"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-slate-400 uppercase tracking-[0.06em]">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="bg-background border border-border rounded-md px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary transition-colors"
          />
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            className="bg-background border border-border rounded-md px-3 py-2.5 text-foreground text-sm outline-none focus:border-primary transition-colors"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 disabled:bg-blue-900 border-none rounded-lg py-3 text-white text-sm font-semibold cursor-pointer disabled:cursor-not-allowed transition-colors hover:bg-blue-500 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="m-0 text-[13px] text-slate-500 text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-400 no-underline hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
