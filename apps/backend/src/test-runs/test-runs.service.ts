import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function computeCounts(statuses: string[]): Record<string, number> {
  const counts: Record<string, number> = { pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0 };
  for (const s of statuses) {
    if (s in counts) counts[s]++;
    else counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}

function computePassRate(counts: Record<string, number>, total: number): number {
  if (total === 0) return 0;
  return Math.round(((counts.pass ?? 0) / total) * 1000) / 10;
}

@Injectable()
export class TestRunsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllRuns(projectId?: string) {
    const runs = await this.prisma.testRun.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        environment: true,
        browser: true,
        buildVersion: true,
        device: true,
        createdBy: true,
        sourceRunId: true,
        results: { select: { status: true } },
      },
    });

    // Build a lookup of id → name for any sourceRunId references
    const sourceIds = runs.map((r) => r.sourceRunId).filter((id): id is string => !!id);
    const sourceLookup = new Map<string, string>();
    if (sourceIds.length > 0) {
      const sourceRuns = await this.prisma.testRun.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, name: true },
      });
      for (const s of sourceRuns) sourceLookup.set(s.id, s.name);
    }

    return runs.map((run) => {
      const statuses = run.results.map((r) => r.status);
      const total = statuses.length;
      const resultCounts = computeCounts(statuses);
      const passRate = computePassRate(resultCounts, total);
      const { results: _, ...rest } = run;
      return {
        ...rest,
        resultCounts,
        passRate,
        total,
        sourceRunName: run.sourceRunId ? (sourceLookup.get(run.sourceRunId) ?? null) : null,
      };
    });
  }

  async getRunStats(environment?: string) {
    const envFilter = environment ? { environment } : {};
    const [totalRuns, totalCasesExecuted, doneRuns, flakyGroups] = await Promise.all([
      // Count of completed runs (scoped to env if provided)
      this.prisma.testRun.count({ where: { status: "done", ...envFilter } }),

      // Total result rows for matching runs
      this.prisma.testResult.count({
        where: environment
          ? { testRun: { environment } }
          : undefined,
      }),

      // All done runs with their result statuses for avgPassRate
      this.prisma.testRun.findMany({
        where: { status: "done", ...envFilter },
        select: { results: { select: { status: true } } },
      }),

      // GroupBy testCaseId + status to find flaky tests (scoped to env)
      this.prisma.testResult.groupBy({
        by: ["testCaseId", "status"],
        _count: { status: true },
        where: {
          status: { in: ["pass", "fail"] },
          ...(environment ? { testRun: { environment } } : {}),
        },
      }),
    ]);

    // avgPassRate across completed runs
    const avgPassRate = (() => {
      if (doneRuns.length === 0) return 0;
      const sum = doneRuns.reduce((acc, run) => {
        const statuses = run.results.map((r) => r.status);
        const counts = computeCounts(statuses);
        return acc + computePassRate(counts, statuses.length);
      }, 0);
      return Math.round((sum / doneRuns.length) * 10) / 10;
    })();

    // Pivot groupBy rows into per-testCaseId { pass, fail } map
    const pivot = new Map<string, { pass: number; fail: number }>();
    for (const row of flakyGroups) {
      const entry = pivot.get(row.testCaseId) ?? { pass: 0, fail: 0 };
      if (row.status === "pass") entry.pass = row._count.status;
      if (row.status === "fail") entry.fail = row._count.status;
      pivot.set(row.testCaseId, entry);
    }

    // Flaky = has both pass and fail; sort by fail count desc, top 5
    const flakyCandidates = Array.from(pivot.entries())
      .filter(([, v]) => v.pass > 0 && v.fail > 0)
      .sort((a, b) => b[1].fail - a[1].fail)
      .slice(0, 5);

    // Fetch titles for the flaky candidates
    const flakyTestCaseIds = flakyCandidates.map(([id]) => id);
    const flakyCases = flakyTestCaseIds.length > 0
      ? await this.prisma.testCase.findMany({
          where: { id: { in: flakyTestCaseIds } },
          select: { id: true, title: true },
        })
      : [];

    const titleMap = new Map(flakyCases.map((tc) => [tc.id, tc.title]));

    const flakyTests = flakyCandidates.map(([testCaseId, counts]) => ({
      testCaseId,
      title: titleMap.get(testCaseId) ?? testCaseId,
      passCount: counts.pass,
      failCount: counts.fail,
    }));

    return { totalRuns, avgPassRate, totalCasesExecuted, flakyTests };
  }

  async getPassRateTrend(environment?: string) {
    const runs = await this.prisma.testRun.findMany({
      where: { status: "done", ...(environment ? { environment } : {}) },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: {
        id: true,
        name: true,
        createdAt: true,
        results: { select: { status: true } },
      },
    });

    return runs.map((run) => {
      const statuses = run.results.map((r) => r.status);
      const counts = computeCounts(statuses);
      const passRate = computePassRate(counts, statuses.length);
      return { runId: run.id, name: run.name, passRate, createdAt: run.createdAt };
    });
  }

  async createRun(
    name: string,
    testCaseIds: string[],
    environment: string,
    browser?: string,
    buildVersion?: string,
    device?: string,
    projectId?: string,
  ) {
    return this.prisma.testRun.create({
      data: {
        name,
        status: "pending",
        environment,
        browser: browser || null,
        buildVersion: buildVersion || null,
        device: device || null,
        ...(projectId ? { projectId } : {}),
        results: {
          create: testCaseIds.map((testCaseId) => ({
            testCaseId,
            status: "pending",
          })),
        },
      },
      include: {
        results: { include: { testCase: { select: { id: true, title: true, severity: true } } } },
      },
    });
  }

  async getRun(id: string) {
    const run = await this.prisma.testRun.findUnique({
      where: { id },
      include: {
        results: {
          include: {
            testCase: {
              select: {
                id: true,
                tcId: true,
                title: true,
                severity: true,
                description: true,
                steps: true,
                expectedResult: true,
                preconditions: true,
                tags: true,
                automationId: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!run) throw new NotFoundException(`TestRun ${id} not found`);
    return run;
  }

  async updateResult(
    resultId: string,
    status: string,
    notes?: string,
    screenshotUrl?: string,
  ) {
    return this.prisma.testResult.update({
      where: { id: resultId },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
        ...(screenshotUrl !== undefined ? { screenshotUrl } : {}),
      },
    });
  }

  async completeRun(runId: string) {
    const run = await this.prisma.testRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException(`TestRun ${runId} not found`);
    return this.prisma.testRun.update({
      where: { id: runId },
      data: { status: "done" },
    });
  }

  async uploadScreenshot(
    file: Express.Multer.File,
    resultId: string,
  ): Promise<string> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY
      ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials not configured");
    }

    const ext = file.originalname.split(".").pop() ?? "png";
    const fileName = `${resultId}-${Date.now()}.${ext}`;

    const uploadUrl = `${supabaseUrl}/storage/v1/object/screenshots/${fileName}`;

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": file.mimetype,
        "x-upsert": "true",
      },
      body: file.buffer as unknown as BodyInit,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Upload failed: ${err}`);
    }

    return `${supabaseUrl}/storage/v1/object/public/screenshots/${fileName}`;
  }

  async assignRun(id: string, assignedTo: string | null) {
    return this.prisma.testRun.update({
      where: { id },
      data: { assignedTo },
    });
  }

  async createRerun(sourceRunId: string, userId?: string) {
    const sourceRun = await this.prisma.testRun.findUnique({
      where: { id: sourceRunId },
      include: {
        results: {
          include: { testCase: { select: { id: true } } },
        },
      },
    });

    if (!sourceRun) throw new NotFoundException(`TestRun ${sourceRunId} not found`);

    const failedResults = sourceRun.results.filter(
      (r) => r.status === "fail" || r.status === "blocked",
    );

    if (failedResults.length === 0) {
      throw new BadRequestException("No failed or blocked cases to rerun");
    }

    const newRun = await this.prisma.testRun.create({
      data: {
        name: `Rerun: ${sourceRun.name} (${new Date().toLocaleDateString()})`,
        status: "pending",
        environment:  sourceRun.environment,
        browser:      sourceRun.browser,
        buildVersion: sourceRun.buildVersion,
        device:       sourceRun.device,
        sourceRunId:  sourceRunId,
        ...(userId ? { createdBy: userId } : {}),
        results: {
          create: failedResults.map((r) => ({
            testCaseId: r.testCase.id,
            status: "pending",
          })),
        },
      },
      include: {
        results: { include: { testCase: { select: { id: true, title: true, severity: true } } } },
      },
    });

    return newRun;
  }
}
