"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

const BASE_URL   = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TOKEN_KEY  = "qavibe_token";
const USER_KEY   = "qavibe_user";
const PROJECT_KEY = "qavibe_project";

export interface AuthUser {
  id:        string;
  email:     string;
  name:      string;
  role:      "admin" | "tester";
  createdAt: string;
  updatedAt: string;
}

export interface ActiveProject {
  id:          string;
  name:        string;
  description: string | null;
  role:        "OWNER" | "MEMBER";
}

interface AuthState {
  user:             AuthUser | null;
  token:            string | null;
  loading:          boolean;
  activeProject:    ActiveProject | null;
  setActiveProject: (project: ActiveProject | null) => void;
  login:            (email: string, password: string) => Promise<void>;
  register:         (email: string, password: string, name: string) => Promise<void>;
  logout:           () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,          setUser]          = useState<AuthUser | null>(null);
  const [token,         setToken]         = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true); // true until localStorage is read
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);

  // Rehydrate from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser  = localStorage.getItem(USER_KEY);
      let parsedUser: AuthUser | null = null;
      if (storedToken && storedUser) {
        parsedUser = JSON.parse(storedUser) as AuthUser;
        setToken(storedToken);
        setUser(parsedUser);
      }
      const storedProject = localStorage.getItem(PROJECT_KEY);
      if (storedProject) {
        const parsed = JSON.parse(storedProject);
        const storedUserId = localStorage.getItem("qavibe_project_user");
        if (storedUserId && storedUserId === parsedUser?.id) {
          setActiveProject(parsed);
        } else {
          localStorage.removeItem(PROJECT_KEY);
          localStorage.removeItem("qavibe_project_user");
        }
      }
    } catch {
      // Corrupted storage — clear it
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSetActiveProject(project: ActiveProject | null) {
    if (project) {
      localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          localStorage.setItem("qavibe_project_user", payload.sub);
        } catch { /* ignore */ }
      }
    } else {
      localStorage.removeItem(PROJECT_KEY);
      localStorage.removeItem("qavibe_project_user");
    }
    setActiveProject(project);
  }

  const persist = useCallback((t: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUser(u);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? "Login failed");
    persist(data.token, data.user);
  }, [persist]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password, name }),
    });
    const raw = await res.text();
    const data = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
    // Fixes: (1) non-JSON crash → readable fallback, (2) NestJS array message → joined string
    if (!res.ok) {
      const msg = Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message ?? `Server error (${res.status})`;
      throw new Error(msg);
    }
    persist(data.token, data.user);
  }, [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PROJECT_KEY);
    localStorage.removeItem("qavibe_project_user");
    setToken(null);
    setUser(null);
    setActiveProject(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, activeProject, setActiveProject: handleSetActiveProject, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Returns the stored JWT token without triggering a React render. */
export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
