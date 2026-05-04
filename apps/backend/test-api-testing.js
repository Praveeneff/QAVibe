#!/usr/bin/env node
/**
 * API Testing Backend Verification Script
 * Usage: node apps/backend/test-api-testing.js
 *   or:  EMAIL=user@example.com PASSWORD=pass node apps/backend/test-api-testing.js
 */

const axios = require("axios");

const BASE_URL = process.env.API_URL ?? "http://localhost:3001";
const EMAIL    = process.env.EMAIL    ?? "praveenkumareff195@gmail.com";
const PASSWORD = process.env.PASSWORD ?? "PraveenKumar@1998";

// ── Test runner ───────────────────────────────────────────────────────────────

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    const msg = err?.response?.data
      ? JSON.stringify(err.response.data)
      : (err?.message ?? String(err));
    results.push({ name, passed: false, error: msg });
    console.log(`  ✗ ${name} — FAILED: ${msg}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

let token = "";
const api = axios.create({ baseURL: BASE_URL, validateStatus: () => true });

const auth  = () => ({ Authorization: `Bearer ${token}` });
const json  = () => ({ ...auth(), "Content-Type": "application/json" });

async function req(method, path, data, headers) {
  const res = await api.request({
    method,
    url: path,
    data,
    headers: headers ?? json(),
  });
  return res;
}

// ── State shared across steps ─────────────────────────────────────────────────

let projectId     = "";
let apiTestId     = "";
let varTestId     = "";
let failTestId    = "";
let jsonPathTestId = "";
let rtTestId      = "";
const createdIds  = [];

// ── Step 1: Setup ─────────────────────────────────────────────────────────────

async function step1_setup() {
  console.log("\nStep 1 — Setup");

  await test("Login and obtain JWT", async () => {
    const res = await req("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
    assert(res.status === 200 || res.status === 201, `Login failed (${res.status}): ${JSON.stringify(res.data)}`);
    token = res.data.token;
    assert(token, "No token in response");
  });

  await test("Fetch or create a project", async () => {
    const res = await req("GET", "/projects");
    assert(res.status === 200, `GET /projects failed: ${res.status}`);
    const projects = Array.isArray(res.data) ? res.data : (res.data.data ?? []);
    if (projects.length > 0) {
      projectId = projects[0].id;
    } else {
      const create = await req("POST", "/projects", {
        name: "Test Project for API Testing",
        description: "Auto-created by test-api-testing.js",
      });
      assert(create.status === 201, `Project creation failed: ${create.status}`);
      projectId = create.data.id;
    }
    assert(projectId, "No projectId obtained");
  });
}

// ── Step 2: Create API Test ───────────────────────────────────────────────────

async function step2_create() {
  console.log("\nStep 2 — Create API Test");

  await test("POST /api/api-tests — create GitHub zen test", async () => {
    const res = await req("POST", "/api/api-tests", {
      projectId,
      name:   "GitHub Zen Test",
      method: "GET",
      url:    "https://api.github.com/zen",
      assertions: [
        { type: "status",       value: 200 },
        { type: "responseTime", maxMs: 3000 },
      ],
    });
    assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert(res.data.id,   "Response missing id");
    assert(res.data.name, "Response missing name");
    assertEq(res.data.method, "GET",                           "method");
    assertEq(res.data.url,    "https://api.github.com/zen",    "url");
    apiTestId = res.data.id;
    createdIds.push(apiTestId);
  });

  await test("POST /api/api-tests — rejects missing projectId", async () => {
    const res = await req("POST", "/api/api-tests", {
      name: "Bad test", method: "GET", url: "https://example.com", assertions: [],
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("POST /api/api-tests — rejects invalid method", async () => {
    const res = await req("POST", "/api/api-tests", {
      projectId, name: "Bad test", method: "CONNECT", url: "https://example.com", assertions: [],
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });
}

// ── Step 3: List API Tests ────────────────────────────────────────────────────

async function step3_list() {
  console.log("\nStep 3 — List API Tests");

  await test("GET /api/api-tests?projectId — created test appears", async () => {
    const res = await req("GET", `/api/api-tests?projectId=${projectId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), "Response should be an array");
    const found = res.data.find((t) => t.id === apiTestId);
    assert(found, "Created test not found in list");
    assert("lastExecution" in found, "lastExecution field missing");
    assert(found.lastExecution === null, "lastExecution should be null before first run");
  });

  await test("GET /api/api-tests?projectId — rejects missing projectId", async () => {
    const res = await req("GET", "/api/api-tests");
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });
}

// ── Step 4: Get Single ────────────────────────────────────────────────────────

async function step4_getOne() {
  console.log("\nStep 4 — Get Single API Test");

  await test("GET /api/api-tests/:id — returns correct test", async () => {
    const res = await req("GET", `/api/api-tests/${apiTestId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assertEq(res.data.id,   apiTestId,                       "id");
    assertEq(res.data.name, "GitHub Zen Test",               "name");
    assertEq(res.data.url,  "https://api.github.com/zen",   "url");
    assert(Array.isArray(res.data.executions), "executions should be an array");
    assertEq(res.data.executions.length, 0, "executions should be empty before first run");
  });

  await test("GET /api/api-tests/:id — 404 for unknown id", async () => {
    const res = await req("GET", "/api/api-tests/nonexistent-id-xyz");
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });
}

// ── Step 5: Execute ───────────────────────────────────────────────────────────

let firstExecutionId = "";

async function step5_execute() {
  console.log("\nStep 5 — Execute API Test");

  await test("POST /api/api-tests/:id/execute — GitHub zen passes", async () => {
    const res = await req("POST", `/api/api-tests/${apiTestId}/execute`, { environment: "test" });
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assertEq(res.data.status,         "pass",  "status");
    assertEq(res.data.responseStatus, 200,     "responseStatus");
    assert(typeof res.data.responseTime === "number", "responseTime should be a number");
    assert(res.data.responseTime > 0,               "responseTime should be > 0");
    assert(res.data.responseBody !== undefined,      "responseBody should be present");
    assert(Array.isArray(res.data.assertionResults), "assertionResults should be array");
    assertEq(res.data.assertionResults.length, 2, "should have 2 assertion results");
    assert(res.data.assertionResults.every((r) => r.passed), "all assertions should pass");
    assert(res.data.executionId, "executionId should be returned");
    firstExecutionId = res.data.executionId;
  });
}

// ── Step 6: Execution History ─────────────────────────────────────────────────

async function step6_history() {
  console.log("\nStep 6 — Execution History");

  await test("GET /api/api-tests/:id/executions — 1 execution exists", async () => {
    const res = await req("GET", `/api/api-tests/${apiTestId}/executions`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), "Should return an array");
    assertEq(res.data.length, 1, "Should have exactly 1 execution");
    assertEq(res.data[0].id, firstExecutionId, "Execution id should match");
    assertEq(res.data[0].status, "pass", "Execution status should be pass");
  });
}

// ── Step 7: Execute Again (Test History) ─────────────────────────────────────

async function step7_executeAgain() {
  console.log("\nStep 7 — Execute Again (History Growth)");

  await test("Execute twice, history returns 2 items newest-first", async () => {
    await req("POST", `/api/api-tests/${apiTestId}/execute`, {});

    const res = await req("GET", `/api/api-tests/${apiTestId}/executions`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assertEq(res.data.length, 2, "Should have 2 executions");
    // Newest first — second execution executedAt should be >= first
    const t0 = new Date(res.data[0].executedAt).getTime();
    const t1 = new Date(res.data[1].executedAt).getTime();
    assert(t0 >= t1, "Executions should be ordered newest-first");
  });
}

// ── Step 8: Update ────────────────────────────────────────────────────────────

async function step8_update() {
  console.log("\nStep 8 — Update API Test");

  await test("PUT /api/api-tests/:id — name update persisted", async () => {
    const putRes = await req("PUT", `/api/api-tests/${apiTestId}`, { name: "Updated API Test" });
    assert(putRes.status === 200, `Expected 200, got ${putRes.status}: ${JSON.stringify(putRes.data)}`);
    assertEq(putRes.data.name, "Updated API Test", "name in update response");

    const getRes = await req("GET", `/api/api-tests/${apiTestId}`);
    assertEq(getRes.data.name, "Updated API Test", "name after re-fetch");
  });
}

// ── Step 9: Variable Substitution ────────────────────────────────────────────

async function step9_variables() {
  console.log("\nStep 9 — Variable Substitution");

  await test("${username} in URL is substituted and call succeeds", async () => {
    const create = await req("POST", "/api/api-tests", {
      projectId,
      name:   "GitHub User Variable Test",
      method: "GET",
      url:    "https://api.github.com/users/${username}",
      variables: { username: "github" },
      assertions: [
        { type: "status", value: 200 },
        { type: "jsonPath", path: "$.login", operator: "equals", value: "github" },
      ],
    });
    assert(create.status === 201, `Create failed: ${create.status}`);
    varTestId = create.data.id;
    createdIds.push(varTestId);

    const exec = await req("POST", `/api/api-tests/${varTestId}/execute`, {});
    assert(exec.status === 200, `Execute failed: ${exec.status}`);
    assertEq(exec.data.status, "pass", "Variable substitution test should pass");
    assert(
      exec.data.responseBody?.login === "github",
      `Expected login=github, got ${exec.data.responseBody?.login}`,
    );
  });
}

// ── Step 10: Failed Assertions ────────────────────────────────────────────────

async function step10_failedAssertions() {
  console.log("\nStep 10 — Failed Assertions");

  await test("Assertion failure returns status:fail, passed:false", async () => {
    const create = await req("POST", "/api/api-tests", {
      projectId,
      name:   "Intentional Failure Test",
      method: "GET",
      url:    "https://api.github.com/zen",
      assertions: [{ type: "status", value: 404 }], // zen returns 200, not 404
    });
    assert(create.status === 201, `Create failed: ${create.status}`);
    failTestId = create.data.id;
    createdIds.push(failTestId);

    const exec = await req("POST", `/api/api-tests/${failTestId}/execute`, {});
    assert(exec.status === 200, `Execute request failed: ${exec.status}`);
    assertEq(exec.data.status, "fail", "Overall status should be fail");
    assert(Array.isArray(exec.data.assertionResults), "assertionResults present");
    assertEq(exec.data.assertionResults[0].passed, false, "assertion[0].passed should be false");
    assertEq(exec.data.responseStatus, 200, "Actual HTTP status still captured as 200");
  });
}

// ── Step 11: JSONPath Assertions ──────────────────────────────────────────────

async function step11_jsonPath() {
  console.log("\nStep 11 — JSONPath Assertions");

  await test("JSONPath equals/exists assertions on GitHub user", async () => {
    const create = await req("POST", "/api/api-tests", {
      projectId,
      name:   "JSONPath Assertion Test",
      method: "GET",
      url:    "https://api.github.com/users/github",
      assertions: [
        { type: "jsonPath", path: "$.login",        operator: "equals", value: "github" },
        { type: "jsonPath", path: "$.type",         operator: "equals", value: "Organization" },
        { type: "jsonPath", path: "$.public_repos", operator: "exists" },
      ],
    });
    assert(create.status === 201, `Create failed: ${create.status}`);
    jsonPathTestId = create.data.id;
    createdIds.push(jsonPathTestId);

    const exec = await req("POST", `/api/api-tests/${jsonPathTestId}/execute`, {});
    assert(exec.status === 200, `Execute failed: ${exec.status}`);
    assertEq(exec.data.status, "pass", "JSONPath test should pass");
    assertEq(exec.data.assertionResults.length, 3, "Should have 3 assertion results");
    assert(
      exec.data.assertionResults.every((r) => r.passed),
      "All JSONPath assertions should pass: " +
        exec.data.assertionResults.filter((r) => !r.passed).map((r) => r.message).join("; "),
    );
  });
}

// ── Step 12: Response Time Assertion ─────────────────────────────────────────

async function step12_responseTime() {
  console.log("\nStep 12 — Response Time Assertion");

  await test("responseTime < 1ms assertion fails (impossible threshold)", async () => {
    const create = await req("POST", "/api/api-tests", {
      projectId,
      name:   "Impossible Response Time Test",
      method: "GET",
      url:    "https://api.github.com/zen",
      assertions: [
        { type: "status",       value: 200 },
        { type: "responseTime", maxMs: 1 }, // 1ms is impossible over network
      ],
    });
    assert(create.status === 201, `Create failed: ${create.status}`);
    rtTestId = create.data.id;
    createdIds.push(rtTestId);

    const exec = await req("POST", `/api/api-tests/${rtTestId}/execute`, {});
    assert(exec.status === 200, `Execute failed: ${exec.status}`);
    assertEq(exec.data.status, "fail", "Should fail due to response time");
    const rtResult = exec.data.assertionResults.find((r) => r.assertion.type === "responseTime");
    assert(rtResult, "responseTime assertion result should exist");
    assertEq(rtResult.passed, false, "responseTime assertion should be false");
  });
}

// ── Step 13: Delete ───────────────────────────────────────────────────────────

async function step13_delete() {
  console.log("\nStep 13 — Delete API Test");

  await test("DELETE /api/api-tests/:id — returns { success: true }", async () => {
    const del = await req("DELETE", `/api/api-tests/${apiTestId}`);
    assert(del.status === 200, `Expected 200, got ${del.status}`);
    assertEq(del.data.success, true, "should return { success: true }");
    // Remove from cleanup list since already deleted
    const idx = createdIds.indexOf(apiTestId);
    if (idx !== -1) createdIds.splice(idx, 1);
  });

  await test("GET /api/api-tests/:id — 404 after deletion", async () => {
    const get = await req("GET", `/api/api-tests/${apiTestId}`);
    assert(get.status === 404, `Expected 404 after delete, got ${get.status}`);
  });
}

// ── Step 14: Cleanup ──────────────────────────────────────────────────────────

async function step14_cleanup() {
  console.log("\nStep 14 — Cleanup");

  await test("Delete all remaining test API tests", async () => {
    const remaining = [...createdIds];
    const errors = [];
    for (const id of remaining) {
      const res = await req("DELETE", `/api/api-tests/${id}`);
      if (res.status !== 200 && res.status !== 404) {
        errors.push(`DELETE ${id}: ${res.status}`);
      }
    }
    if (errors.length) throw new Error(errors.join(", "));
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  API Testing Backend Verification");
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  User:   ${EMAIL}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await step1_setup();
  if (!token || !projectId) {
    console.log("\n✗ Setup failed — cannot continue.\n");
    process.exit(1);
  }

  await step2_create();
  if (!apiTestId) {
    console.log("\n✗ Create test failed — skipping execution steps.\n");
  } else {
    await step3_list();
    await step4_getOne();
    await step5_execute();
    await step6_history();
    await step7_executeAgain();
    await step8_update();
  }

  await step9_variables();
  await step10_failedAssertions();
  await step11_jsonPath();
  await step12_responseTime();

  if (apiTestId && createdIds.includes(apiTestId)) {
    await step13_delete();
  } else if (apiTestId) {
    // apiTestId already removed (step13 ran), create a fresh one to delete
    await step13_delete();
  }

  await step14_cleanup();

  // ── Summary ──────────────────────────────────────────────────────────────────

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  API Testing Backend Verification");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Total Tests : ${results.length}`);
  console.log(`  Passed      : ${passed}`);
  console.log(`  Failed      : ${failed}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  ✗ ${r.name}\n      ${r.error}`));
    console.log("");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected fatal error:", err);
  process.exit(1);
});
