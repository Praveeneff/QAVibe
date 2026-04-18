import { getStoredToken } from "@/context/AuthContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeader },
    ...init,
  });

  // Token expiry — silently log out and redirect to /login.
  // Exclude POST /auth/login: a 401 there is a legitimate wrong-password response.
  if (res.status === 401 && path !== "/auth/login") {
    if (typeof window !== "undefined") {
      localStorage.removeItem("qavibe_token");
      localStorage.removeItem("qavibe_user");
      window.location.href = "/login";
    }
    return undefined as T; // never reached after redirect
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface TestCase {
  id: string;
  tcId: string;
  title: string;
  description?: string;
  category: string;
  executionType: string;
  priority: string;
  severity: string;
  steps?: string;
  expectedResult?: string;
  status: string;
  preconditions?: string | null;
  tags?: string | null;
  automationId?: string | null;
  suiteId?: string | null;
  suite?: { id: string; name: string } | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  results?: {
    status: string;
    createdAt: string;
    testRunId: string;
  }[];
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string | null;
  depth: number;
  parentId?: string | null;
  createdAt: string;
  _count: { testCases: number };
  children?: TestSuite[];
}

export interface TestCasePayload {
  title: string;
  description?: string;
  category?: string;
  executionType?: string;
  priority?: string;
  severity?: string;
  steps?: string;
  expectedResult?: string;
  preconditions?: string;
  tags?: string;
  automationId?: string;
  status?: string;
  suiteId?: string | null;
  assignedTo?: string | null;
}

export interface TestCasePage {
  data: TestCase[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TestCaseFilters {
  suiteId?: string;
  search?: string;
  category?: string;
  severity?: string;
  priority?: string;
  status?: string;
  page?: number;
  limit?: number;
  fields?: string;
  projectId?: string;
  assignedTo?: string;
}

export const getTestCases = (filters: TestCaseFilters = {}) => {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== "") params.set(key, String(val));
  }
  const qs = params.toString();
  return request<TestCasePage>(qs ? `/test-cases?${qs}` : "/test-cases");
};

// ── Test Suites ───────────────────────────────────────────────────────────────

export const getSuites = () => request<TestSuite[]>("/test-suites");

export const createSuite = (name: string, description?: string, parentId?: string) =>
  request<TestSuite>("/test-suites", { method: "POST", body: JSON.stringify({ name, description, parentId }) });

export const deleteSuite = (id: string) =>
  request<void>(`/test-suites/${id}`, { method: "DELETE" });

export const assignCase = (suiteId: string, testCaseId: string) =>
  request<TestCase>(`/test-suites/${suiteId}/assign/${testCaseId}`, { method: "PATCH" });

export const removeFromSuite = (testCaseId: string) =>
  request<TestCase>(`/test-cases/${testCaseId}/remove-suite`, { method: "PATCH" });

export const getTestCase = (id: string) => request<TestCase>(`/test-cases/${id}`);

// ── Test Case History ─────────────────────────────────────────────────────────

export interface HistoryEntry {
  id:         string;
  version:    number;
  changedBy:  string | null;
  changeType: "manual" | "ai" | "restore";
  changedAt:  string;
  snapshot:   TestCase;
}

export const getTestCaseHistory = (id: string) =>
  request<HistoryEntry[]>(`/test-cases/${id}/history`);

export const restoreTestCaseVersion = (id: string, historyId: string) =>
  request<TestCase>(`/test-cases/${id}/history/${historyId}/restore`, { method: "POST" });

export const createTestCase = (data: TestCasePayload) =>
  request<TestCase>("/test-cases", { method: "POST", body: JSON.stringify(data) });

export const updateTestCase = (id: string, data: Partial<TestCasePayload>) =>
  request<TestCase>(`/test-cases/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteTestCase = (id: string) =>
  request<void>(`/test-cases/${id}`, { method: "DELETE" });

// ── Test Runs ────────────────────────────────────────────────────────────────

export interface TestResult {
  id: string;
  testCaseId: string;
  testRunId: string;
  status: string;
  notes: string | null;
  screenshotUrl: string | null;
  createdAt: string;
  updatedAt: string;
  testCase: {
    id: string;
    tcId?: string;
    title: string;
    severity: string;
    description?: string | null;
    steps?: string | null;
    expectedResult?: string | null;
    preconditions?: string | null;
    tags?: string | null;
    automationId?: string | null;
  };
}

export interface TestRun {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  environment: string;
  browser: string | null;
  buildVersion: string | null;
  device: string | null;
  results: TestResult[];
}

export const createTestRun = (
  name: string,
  testCaseIds: string[],
  environment: string,
  browser?: string,
  buildVersion?: string,
  device?: string,
  projectId?: string,
) =>
  request<TestRun>("/test-runs", {
    method: "POST",
    body: JSON.stringify({ name, testCaseIds, environment, browser, buildVersion, device, ...(projectId ? { projectId } : {}) }),
  });

export const getTestRun = (id: string) =>
  request<TestRun>(`/test-runs/${id}`);

export async function updateTestResult(
  runId: string,
  resultId: string,
  status: string,
  notes: string | undefined,
  token: string,
): Promise<any> {
  const res = await fetch(
    `${BASE_URL}/test-runs/${runId}/results/${resultId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status,
        ...(notes ? { notes } : {}),
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to update result (${res.status})`);
  return res.json();
}

export async function uploadScreenshot(runId: string, resultId: string, file: File): Promise<{ screenshotUrl: string }> {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/test-runs/${runId}/results/${resultId}/screenshot`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export const completeTestRun = (runId: string) =>
  request<TestRun>(`/test-runs/${runId}/complete`, { method: "PATCH", body: JSON.stringify({}) });

export interface RunSummary {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  total: number;
  passRate: number;
  resultCounts: { pass: number; fail: number; blocked: number; skip: number; pending: number };
  environment: string;
  browser: string | null;
  buildVersion: string | null;
  device: string | null;
  createdBy?: string | null;
  sourceRunId?: string | null;
  sourceRunName?: string | null;
}

export const getAllRuns = (projectId?: string) =>
  request<RunSummary[]>(projectId ? `/test-runs?projectId=${encodeURIComponent(projectId)}` : "/test-runs");

export interface RunStats {
  totalRuns: number;
  avgPassRate: number;
  totalCasesExecuted: number;
  flakyTests: {
    testCaseId: string;
    title: string;
    passCount: number;
    failCount: number;
  }[];
}

export interface TrendPoint {
  runId: string;
  name: string;
  passRate: number;
  createdAt: string;
}

export const getRunStats = (environment?: string) =>
  request<RunStats>(environment ? `/test-runs/stats?environment=${encodeURIComponent(environment)}` : "/test-runs/stats");

export const getRunTrend = (environment?: string) =>
  request<TrendPoint[]>(environment ? `/test-runs/trend?environment=${encodeURIComponent(environment)}` : "/test-runs/trend");

// ── AI Logs ───────────────────────────────────────────────────────────────────

export interface AiLogSummary {
  totalGenerations: number;
  totalCasesGenerated: number;
  avgLatencyMs: number;
  fallbackRate: number;
  providerBreakdown: {
    provider: string;
    count: number;
    avgLatencyMs: number;
    avgCaseCount: number;
    failureCount: number;
  }[];
}

export interface AiLogTrendPoint {
  provider: string;
  latencyMs: number;
  caseCount: number;
  createdAt: string;
}

export interface AiRecentLog {
  id: string;
  provider: string;
  promptTokens: number | null;
  latencyMs: number;
  caseCount: number;
  fallbackFrom: string | null;
  createdAt: string;
}

// ── Duplicate detection ───────────────────────────────────────────────────────

export interface DuplicateMatch {
  id:         string;
  title:      string;
  similarity: "high" | "medium";
  reason:     string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicates:  DuplicateMatch[];
}

export const checkDuplicate = (body: {
  title:      string;
  steps:      string;
  suiteId?:   string;
  excludeId?: string;
}) =>
  request<DuplicateCheckResult>("/ai/check-duplicate", {
    method: "POST",
    body:   JSON.stringify(body),
  });

export const getAiLogSummary = () => request<AiLogSummary>("/ai-logs/summary");
export const getAiLogTrend   = () => request<AiLogTrendPoint[]>("/ai-logs/trend");
export const getAiRecentLogs = () => request<AiRecentLog[]>("/ai-logs/recent");

// ── User lookup ───────────────────────────────────────────────────────────────

export interface UserProfile {
  id:    string;
  name:  string;
  email: string;
  role:  string;
}

// In-memory cache — survives page navigation, cleared on tab close
const userCache: Record<string, UserProfile> = {};

export async function getUser(id: string): Promise<UserProfile> {
  if (userCache[id]) return userCache[id];
  try {
    const profile = await request<UserProfile>(`/auth/users/${id}`);
    userCache[id] = profile;
    return profile;
  } catch {
    // Never let a user lookup break a page
    return { id, name: "Unknown", email: "", role: "" };
  }
}

export function getActiveProjectId(): string | null {
  try {
    const stored = localStorage.getItem("qavibe_project");
    return stored ? JSON.parse(stored).id : null;
  } catch { return null; }
}

export async function getProjectMembers(
  projectId: string,
  token: string,
): Promise<{ userId: string; role: string; user: { id: string; email: string; name?: string } }[]> {
  const res = await fetch(
    `${BASE_URL}/projects/${projectId}/members`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  return res.json();
}
