import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface GenerationContext {
  totalCases: number;
  tagDistribution: Record<string, number>;
  priorityDistribution: Record<string, number>;
  recentTitles: string[];
  coveredAreas: string[];
}

export function buildSystemPrompt(ctx: GenerationContext): string {
  const tagStr = Object.entries(ctx.tagDistribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none yet";
  const priStr = Object.entries(ctx.priorityDistribution).map(([k, v]) => `${k}: ${v}`).join(", ") || "none yet";
  const titlesStr = ctx.recentTitles.length ? ctx.recentTitles.map((t) => `- ${t}`).join("\n") : "  (none yet)";
  const areasStr = ctx.coveredAreas.length ? ctx.coveredAreas.join(", ") : "none yet";

  return `You are a senior QA engineer generating test cases for a software project.

Project context:
- Total existing test cases: ${ctx.totalCases}
- Coverage by category: ${tagStr}
- Coverage by priority: ${priStr}
- Recently added test titles:
${titlesStr}
- Areas already covered: ${areasStr}

Rules you must follow:
1. Do NOT generate test cases that duplicate or closely resemble the recent titles above.
2. Focus on GAPS — areas not yet covered based on the context above.
3. Each test case must have: title, steps, expectedResult, category, executionType, priority, severity.
4. steps MUST be a JSON array of strings. Each step is one clear action. Minimum 3 steps per test case. Example: "steps": ["Navigate to the login page", "Enter valid email in the email field", "Enter valid password in the password field", "Click the Login button", "Verify the user is redirected to the dashboard"]
5. Return ONLY a valid JSON object. No markdown, no explanation, no preamble.
6. Also include a "suggestedSuite" field at the ROOT level of your JSON response (not inside each case). This should be a short 1-3 word name for a test suite that best groups these test cases. Example: "Login Flow", "Payment Gateway", "User Profile"
7. Final response shape: { "suggestedSuite": "Login Flow", "cases": [ { "title": "string", "steps": ["Step 1 description", "Step 2 description", "Step 3 description"], "expectedResult": "string", "category": "smoke|sanity|regression|functional|e2e|integration|performance|security|ui|api", "executionType": "manual|automated|api|exploratory", "priority": "P1|P2|P3|P4 (P1=critical/highest risk, P2=high, P3=medium, P4=low)", "severity": "critical|high|medium|low (impact if this test fails)" }, ... ] }`;
}

@Injectable()
export class AiGenerationContext {
  constructor(private readonly prisma: PrismaService) {}

  buildModuleExtractionPrompt(): string {
    return `You are a business analyst reading a BRD document.
Your task is to identify all distinct functional modules or sections in the document.

Rules:
1. Return ONLY a valid JSON array — no markdown, no explanation, no preamble.
2. Identify between 2–10 top-level functional modules.
3. For each module include a short description of what it covers.
4. Response shape (array directly, not wrapped in object):
[
  {
    "name": "User Authentication",
    "description": "Login, registration, password reset",
    "keywords": ["login", "register", "password", "auth"]
  }
]`;
  }

  buildModuleTestCasePrompt(
    moduleName: string,
    moduleDescription: string,
    caseCount: number,
  ): string {
    return `You are a senior QA engineer generating test cases for a software project.

Focus ONLY on the "${moduleName}" module.
Module scope: ${moduleDescription}

Rules you must follow:
1. Generate exactly ${caseCount} test cases that cover this module thoroughly.
2. Include positive, negative, and edge cases.
3. Each test case must have: title, steps, expectedResult, category, executionType, priority, severity.
4. steps MUST be a JSON array of strings. Each step is one clear action. Minimum 3 steps per test case. Example: "steps": ["Navigate to the feature", "Perform the action", "Verify the expected outcome"]
5. Return ONLY a valid JSON object. No markdown, no explanation, no preamble.
6. Response shape: { "suggestedSuite": "${moduleName}", "cases": [ { "title": "string", "steps": ["Step 1 description", "Step 2 description", "Step 3 description"], "expectedResult": "string", "category": "smoke|sanity|regression|functional|e2e|integration|performance|security|ui|api", "executionType": "manual|automated|api|exploratory", "priority": "P1|P2|P3|P4", "severity": "critical|high|medium|low" }, ... ] }`;
  }

  async buildGenerationContext(): Promise<GenerationContext> {
    const [tagGroups, priorityGroups, recentCases] = await Promise.all([
      this.prisma.testCase.groupBy({
        by: ["category"],
        _count: { category: true },
      }),
      this.prisma.testCase.groupBy({
        by: ["priority"],
        _count: { priority: true },
      }),
      this.prisma.testCase.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { title: true },
      }),
    ]);

    const totalCases = tagGroups.reduce((sum, g) => sum + g._count.category, 0);

    const tagDistribution: Record<string, number> = {};
    for (const g of tagGroups) {
      tagDistribution[g.category] = g._count.category;
    }

    const priorityDistribution: Record<string, number> = {};
    for (const g of priorityGroups) {
      priorityDistribution[g.priority] = g._count.priority;
    }

    const recentTitles = recentCases.map((tc) => tc.title);

    // Covered areas: distinct first words of all recent titles as a cheap feature-area heuristic
    const coveredAreas = Array.from(
      new Set(recentTitles.map((t) => t.split(" ")[0]).filter(Boolean)),
    );

    return { totalCases, tagDistribution, priorityDistribution, recentTitles, coveredAreas };
  }
}
