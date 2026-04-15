"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.role !== "admin") {
      router.replace("/test-cases?error=admin-required");
    }
  }, [loading, user, router]);

  if (loading) return null;

  if (!user || user.role !== "admin") {
    return null; // redirect in-flight — render nothing
  }

  return <>{children}</>;
}
