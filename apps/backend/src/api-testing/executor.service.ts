import { Injectable } from "@nestjs/common";
import axios, { type AxiosRequestConfig } from "axios";

// ── Assertion shape ───────────────────────────────────────────────────────────

export type AssertionOperator = "exists" | "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan";

export interface Assertion {
  type: "status" | "jsonPath" | "responseTime" | "header";
  // status
  value?: number | string;
  // jsonPath
  path?: string;
  operator?: AssertionOperator;
  // responseTime
  maxMs?: number;
  // header
  name?: string;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actual: unknown;
  expected: unknown;
  message: string;
}

// ── Execution result ──────────────────────────────────────────────────────────

export interface ExecutionResult {
  status: "pass" | "fail" | "error";
  responseStatus?: number;
  responseTime?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  assertionResults: AssertionResult[];
  error?: string;
  errorStack?: string;
}

// ── Executor ──────────────────────────────────────────────────────────────────

@Injectable()
export class ExecutorService {
  // ── Public entry point ──────────────────────────────────────────────────────

  async execute(
    method: string,
    url: string,
    headers: Record<string, string> | null | undefined,
    queryParams: Record<string, string> | null | undefined,
    body: unknown,
    assertions: Assertion[],
    variables: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const vars = variables ?? {};

    const resolvedUrl     = this.substituteVariables(url, vars) as string;
    const resolvedHeaders = this.substituteVariables(headers ?? {}, vars) as Record<string, string>;
    const resolvedParams  = this.substituteVariables(queryParams ?? {}, vars) as Record<string, string>;
    const resolvedBody    = body != null ? this.substituteVariables(body, vars) : undefined;

    const config: AxiosRequestConfig = {
      method: method.toLowerCase(),
      url: resolvedUrl,
      headers: resolvedHeaders,
      params: Object.keys(resolvedParams).length ? resolvedParams : undefined,
      data: resolvedBody,
      timeout: 30_000,
      validateStatus: () => true, // never throw on HTTP error codes
    };

    const start = Date.now();

    try {
      const response = await axios(config);
      const responseTime = Date.now() - start;

      const responseHeaders = Object.fromEntries(
        Object.entries(response.headers).map(([k, v]) => [k, String(v)]),
      );

      const assertionResults = assertions.map((a) =>
        this.evaluate(a, response.status, responseTime, responseHeaders, response.data),
      );

      const allPassed = assertionResults.every((r) => r.passed);

      return {
        status: allPassed ? "pass" : "fail",
        responseStatus: response.status,
        responseTime,
        responseHeaders,
        responseBody: response.data,
        assertionResults,
      };
    } catch (err: any) {
      return {
        status: "error",
        responseTime: Date.now() - start,
        assertionResults: [],
        error: err?.message ?? "Request failed",
        errorStack: err?.stack,
      };
    }
  }

  // ── Variable substitution ───────────────────────────────────────────────────

  substituteVariables(template: unknown, variables: Record<string, unknown>): unknown {
    if (typeof template === "string") {
      return template.replace(/\$\{(\w+)\}/g, (_, key) =>
        key in variables ? String(variables[key]) : `\${${key}}`,
      );
    }
    if (Array.isArray(template)) {
      return template.map((item) => this.substituteVariables(item, variables));
    }
    if (template !== null && typeof template === "object") {
      return Object.fromEntries(
        Object.entries(template as Record<string, unknown>).map(([k, v]) => [
          k,
          this.substituteVariables(v, variables),
        ]),
      );
    }
    return template;
  }

  // ── Assertion evaluation ────────────────────────────────────────────────────

  private evaluate(
    assertion: Assertion,
    responseStatus: number,
    responseTime: number,
    responseHeaders: Record<string, string>,
    responseBody: unknown,
  ): AssertionResult {
    switch (assertion.type) {
      case "status":
        return this.assertStatus(assertion, responseStatus);
      case "jsonPath":
        return this.assertJsonPath(assertion, responseBody);
      case "responseTime":
        return this.assertResponseTime(assertion, responseTime);
      case "header":
        return this.assertHeader(assertion, responseHeaders);
      default:
        return {
          assertion,
          passed: false,
          actual: undefined,
          expected: undefined,
          message: `Unknown assertion type: ${(assertion as any).type}`,
        };
    }
  }

  // status ─────────────────────────────────────────────────────────────────────

  private assertStatus(assertion: Assertion, actual: number): AssertionResult {
    const expected = Number(assertion.value);
    const passed = actual === expected;
    return {
      assertion,
      passed,
      actual,
      expected,
      message: passed
        ? `Status is ${actual}`
        : `Expected status ${expected}, got ${actual}`,
    };
  }

  // jsonPath ────────────────────────────────────────────────────────────────────

  private assertJsonPath(assertion: Assertion, body: unknown): AssertionResult {
    const path = assertion.path ?? "";
    const actual = this.extractJsonPath(path, body);
    const operator = assertion.operator ?? "exists";
    const expected = assertion.value;

    const { passed, message } = this.applyOperator(operator, actual, expected, `jsonPath(${path})`);
    return { assertion, passed, actual, expected, message };
  }

  private extractJsonPath(path: string, data: unknown): unknown {
    // Supports: $ | $.key | $.key.nested | $.arr[0] | $.arr[0].key
    if (path === "$") return data;

    const segments = path
      .replace(/^\$\.?/, "")
      .split(/\.|\[(\d+)\]/)
      .filter(Boolean);

    let current: unknown = data;
    for (const seg of segments) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[seg];
      } else {
        return undefined;
      }
    }
    return current;
  }

  // responseTime ───────────────────────────────────────────────────────────────

  private assertResponseTime(assertion: Assertion, actual: number): AssertionResult {
    const maxMs = assertion.maxMs ?? 0;
    const passed = actual <= maxMs;
    return {
      assertion,
      passed,
      actual,
      expected: maxMs,
      message: passed
        ? `Response time ${actual}ms is within ${maxMs}ms`
        : `Response time ${actual}ms exceeded limit of ${maxMs}ms`,
    };
  }

  // header ─────────────────────────────────────────────────────────────────────

  private assertHeader(assertion: Assertion, headers: Record<string, string>): AssertionResult {
    const headerName = (assertion.name ?? "").toLowerCase();
    const actual = headers[headerName] ?? headers[assertion.name ?? ""];
    const operator = assertion.operator ?? "exists";
    const expected = assertion.value;

    const { passed, message } = this.applyOperator(operator, actual, expected, `header(${assertion.name})`);
    return { assertion, passed, actual, expected, message };
  }

  // operator helper ─────────────────────────────────────────────────────────────

  private applyOperator(
    operator: AssertionOperator,
    actual: unknown,
    expected: unknown,
    label: string,
  ): { passed: boolean; message: string } {
    switch (operator) {
      case "exists": {
        const passed = actual !== undefined && actual !== null;
        return {
          passed,
          message: passed ? `${label} exists` : `${label} does not exist`,
        };
      }
      case "equals": {
        // eslint-disable-next-line eqeqeq
        const passed = actual == expected; // loose equality handles "200" == 200
        return {
          passed,
          message: passed
            ? `${label} equals ${expected}`
            : `Expected ${label} to equal ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        };
      }
      case "notEquals": {
        // eslint-disable-next-line eqeqeq
        const passed = actual != expected;
        return {
          passed,
          message: passed
            ? `${label} does not equal ${expected}`
            : `Expected ${label} to not equal ${JSON.stringify(expected)}`,
        };
      }
      case "contains": {
        const passed =
          typeof actual === "string" &&
          typeof expected === "string" &&
          actual.includes(expected);
        return {
          passed,
          message: passed
            ? `${label} contains "${expected}"`
            : `Expected ${label} to contain "${expected}", got ${JSON.stringify(actual)}`,
        };
      }
      case "greaterThan": {
        const passed = Number(actual) > Number(expected);
        return {
          passed,
          message: passed
            ? `${label} (${actual}) > ${expected}`
            : `Expected ${label} to be > ${expected}, got ${actual}`,
        };
      }
      case "lessThan": {
        const passed = Number(actual) < Number(expected);
        return {
          passed,
          message: passed
            ? `${label} (${actual}) < ${expected}`
            : `Expected ${label} to be < ${expected}, got ${actual}`,
        };
      }
      default:
        return { passed: false, message: `Unknown operator: ${operator}` };
    }
  }
}
