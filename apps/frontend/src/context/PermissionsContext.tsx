"use client";

import React, {
  createContext, useContext, useState, useEffect
} from "react";
import { useAuth, getStoredToken } from "./AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Permission {
  resource: string;
  action: string;
  allowed: boolean;
}

interface PermissionsContextType {
  permissions: Permission[];
  can: (action: string, resource: string) => boolean;
  loading: boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: [],
  can: () => false,
  loading: true,
});

export function PermissionsProvider({
  children
}: {
  children: React.ReactNode
}) {
  const { user, activeProject } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Admin has all permissions
    if (user?.role === "admin") {
      setPermissions([]);
      setLoading(false);
      return;
    }

    // Fetch tester permissions for active project
    const projectId = activeProject?.id;
    const token = getStoredToken();

    if (!projectId || !token) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${BASE_URL}/projects/${projectId}/my-permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { setPermissions(data); })
      .catch(() => setPermissions([]))
      .finally(() => setLoading(false));
  }, [user?.role, activeProject?.id]);

  function can(action: string, resource: string): boolean {
    // Admin can do everything
    if (user?.role === "admin") return true;

    // Tester: check permissions
    const perm = permissions.find(
      (p) => p.resource === resource && p.action === action
    );
    return perm?.allowed ?? false;
  }

  return (
    <PermissionsContext.Provider value={{ permissions, can, loading }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermission() {
  return useContext(PermissionsContext);
}
