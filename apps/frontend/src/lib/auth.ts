const USER_KEY = "qavibe_user";

export interface StoredUser {
  id:    string;
  email: string;
  name:  string;
  role:  "admin" | "tester";
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

/** Synchronous admin check from localStorage — use inside React with useAuth() instead when possible. */
export function isAdmin(): boolean {
  return getStoredUser()?.role === "admin";
}
