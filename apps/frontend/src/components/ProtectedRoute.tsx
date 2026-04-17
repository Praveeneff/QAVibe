"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({
  children
}: {
  children: React.ReactNode
}) {
  const { user, loading, activeProject } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isExempt = pathname.startsWith("/projects");

  // All hooks must be called unconditionally — before any early returns.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && !isExempt && !activeProject) {
      router.replace("/projects");
    }
  }, [loading, user, isExempt, activeProject, router]);

  // While loading, render nothing to prevent flash
  if (loading) return null;

  // If not authenticated, render nothing (redirect fires above)
  if (!user) return null;

  // Project guard — render nothing while redirect fires
  if (!isExempt && !activeProject) return null;

  return <>{children}</>;
}
