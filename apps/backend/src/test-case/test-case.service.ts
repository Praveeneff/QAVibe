import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { HistoryService } from "./history.service";

// Note: SQLite does not support Prisma Json type.
// `steps` is stored as a JSON string; serialize/deserialize at the service layer.

@Injectable()
export class TestCaseService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly history:  HistoryService,
  ) {}

  async findAll(params: {
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
  } = {}) {
    const {
      suiteId,
      search,
      category,
      severity,
      priority,
      status,
      page = 1,
      limit = 20,
      fields,
      projectId,
      assignedTo,
    } = params;

    const idOnly = fields === "id";
    const safePage  = Math.max(1, page);
    // ID-only requests may fetch up to 1000; full requests cap at 100
    const safeLimit = idOnly
      ? Math.min(1000, Math.max(1, limit))
      : Math.min(100, Math.max(1, limit));

    // ── Suite filter ──────────────────────────────────────────────────────────
    const suiteFilter: Prisma.TestCaseWhereInput =
      suiteId === undefined ? {}
      : suiteId === "unassigned" ? { suiteId: null }
      : { suiteId: { in: await this.getAllDescendantSuiteIds(suiteId) } };

    // ── Search (title OR description, SQLite LIKE is ASCII-case-insensitive) ─
    const searchFilter: Prisma.TestCaseWhereInput = search
      ? { OR: [{ title: { contains: search } }, { description: { contains: search } }] }
      : {};

    // ── Exact-match filters ───────────────────────────────────────────────────
    const exactFilters: Prisma.TestCaseWhereInput = {
      ...(category   ? { category   } : {}),
      ...(severity   ? { severity   } : {}),
      ...(priority   ? { priority   } : {}),
      ...(status     ? { status     } : {}),
      ...(projectId  ? { projectId  } : {}),
      ...(assignedTo ? { assignedTo } : {}),
    };

    const where: Prisma.TestCaseWhereInput = {
      ...suiteFilter,
      ...searchFilter,
      ...exactFilters,
    };

    const [total, data] = await Promise.all([
      this.prisma.testCase.count({ where }),
      idOnly
        ? this.prisma.testCase.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (safePage - 1) * safeLimit,
            take: safeLimit,
            select: { id: true },
          })
        : this.prisma.testCase.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (safePage - 1) * safeLimit,
            take: safeLimit,
            include: {
              suite: { select: { id: true, name: true } },
              results: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  status: true,
                  createdAt: true,
                  testRunId: true,
                },
              },
            },
          }),
    ]);

    return {
      data,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  private async getAllDescendantSuiteIds(
    suiteId: string
  ): Promise<string[]> {
    // Fetch the suite and its nested children (2 levels)
    const suite = await this.prisma.testSuite.findUnique({
      where: { id: suiteId },
      select: {
        id: true,
        children: {
          select: {
            id: true,
            children: {
              select: { id: true },
            },
          },
        },
      },
    });
    if (!suite) return [suiteId];

    const ids: string[] = [suite.id];
    for (const child of suite.children ?? []) {
      ids.push(child.id);
      for (const grandchild of child.children ?? []) {
        ids.push(grandchild.id);
      }
    }
    return ids;
  }

  findForExport(params: {
    suiteId?: string;
    search?: string;
    category?: string;
    severity?: string;
    priority?: string;
    status?: string;
  } = {}) {
    const { suiteId, search, category, severity, priority, status } = params;

    const suiteFilter: Prisma.TestCaseWhereInput =
      suiteId === undefined ? {}
      : suiteId === "unassigned" ? { suiteId: null }
      : { suiteId };

    const searchFilter: Prisma.TestCaseWhereInput = search
      ? { OR: [{ title: { contains: search } }, { description: { contains: search } }] }
      : {};

    const exactFilters: Prisma.TestCaseWhereInput = {
      ...(category ? { category } : {}),
      ...(severity ? { severity } : {}),
      ...(priority ? { priority } : {}),
      ...(status   ? { status   } : {}),
    };

    const where: Prisma.TestCaseWhereInput = {
      ...suiteFilter,
      ...searchFilter,
      ...exactFilters,
    };

    return this.prisma.testCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { suite: { select: { name: true } } },
    });
  }

  findOne(id: string) {
    return this.prisma.testCase.findUniqueOrThrow({ where: { id } });
  }

  private async generateTcId(): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('tc_id_seq')
    `;
    const nextSeq = Number(result[0].nextval);
    return `TC-${String(nextSeq).padStart(4, "0")}`;
  }

  async create(data: Prisma.TestCaseCreateInput, createdBy?: string, retries = 3): Promise<any> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const tcId = await this.generateTcId();
        return await this.prisma.testCase.create({
          data: { ...data, tcId, ...(createdBy ? { createdBy } : {}) },
        });
      } catch (err: any) {
        if (
          attempt < retries - 1 &&
          err?.code === "P2002" &&
          err?.meta?.target?.includes("tcId")
        ) {
          const baseDelay = 50 * (attempt + 1);
          const jitter = Math.floor(Math.random() * 50);
          await new Promise((r) => setTimeout(r, baseDelay + jitter));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed to generate unique tcId after ${retries} attempts`);
  }

  async update(
    id: string,
    data: Prisma.TestCaseUpdateInput,
    changedBy?: string,
    changeType: "manual" | "ai" = "manual",
  ) {
    // Snapshot the current state before overwriting it
    const current = await this.prisma.testCase.findUnique({ where: { id } });
    if (current) {
      await this.history.saveSnapshot(id, current, changedBy, changeType);
    }
    return this.prisma.testCase.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.testCase.delete({ where: { id } });
  }

  async assignTestCase(id: string, assignedTo: string | null): Promise<any> {
    return this.prisma.testCase.update({
      where: { id },
      data: { assignedTo },
    });
  }

  async importFromCsv(
    buffer: Buffer,
  ): Promise<{ imported: number; skipped: number; suiteCreated: string[] }> {
    let records: Record<string, string>[];
    try {
      records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[];
    } catch {
      throw new BadRequestException("Could not parse CSV file");
    }

    // Auto-detect TestRail format: headers contain "section"
    const firstRowKeys =
      records.length > 0
        ? Object.keys(records[0]).map((k) => k.toLowerCase().trim())
        : [];
    const isTestRail = firstRowKeys.includes("section");

    // Load all existing suites once for case-insensitive lookup
    // (SQLite does not support Prisma mode:"insensitive")
    const existingSuites = await this.prisma.testSuite.findMany({
      select: { id: true, name: true },
    });
    const suiteMap = new Map<string, string>(
      existingSuites.map((s) => [s.name.toLowerCase(), s.id]),
    );

    let imported = 0;
    let skipped = 0;
    const suiteCreated: string[] = [];

    for (const rawRow of records) {
      try {
        // Normalise keys to lowercase so header matching is case-insensitive
        const row: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawRow)) {
          row[k.toLowerCase().trim()] = String(v ?? "").trim();
        }

        // ── Field extraction (format-specific) ───────────────────────────────
        let title: string;
        let suiteName: string;
        let category: string;
        let priority: string;
        let rawSteps: string;
        let expectedResult: string;
        let description: string;
        let executionType: string;
        let status: string;
        let severity: string;

        if (isTestRail) {
          const trTypeMap: Record<string, string> = {
            functional: "functional",
            automated: "functional",
          };
          const trPriorityMap: Record<string, string> = {
            critical: "P1",
            high: "P2",
            medium: "P3",
            low: "P4",
          };

          title = row["title"] ?? "";
          suiteName = row["section"] ?? "";
          category = trTypeMap[(row["type"] ?? "").toLowerCase()] ?? "functional";
          priority = trPriorityMap[(row["priority"] ?? "").toLowerCase()] ?? "P2";
          rawSteps = row["steps"] ?? "";
          // TestRail header "Expected Result" → lowercased key has a space
          expectedResult = row["expected result"] ?? "";
          description = "";
          executionType = "manual";
          status = "active";
          severity = "medium";
        } else {
          title = row["title"] ?? "";
          suiteName = row["suitename"] ?? "";
          category = row["category"] || "functional";
          priority = row["priority"] || "P2";
          rawSteps = row["steps"] ?? "";
          expectedResult = row["expectedresult"] ?? "";
          description = row["description"] ?? "";
          executionType = row["executiontype"] || "manual";
          status = row["status"] || "active";
          severity = (row["severity"] ?? row["Severity"] ?? "medium").toLowerCase().trim();
        }

        if (!title) { skipped++; continue; }

        // ── Suite: find existing by name or create ────────────────────────────
        let suiteId: string | null = null;
        if (suiteName) {
          const key = suiteName.toLowerCase();
          if (suiteMap.has(key)) {
            suiteId = suiteMap.get(key)!;
          } else {
            const suite = await this.prisma.testSuite.create({
              data: { name: suiteName },
            });
            suiteMap.set(key, suite.id);
            suiteCreated.push(suiteName);
            suiteId = suite.id;
          }
        }

        // ── Steps: restore array from " | " join if applicable ────────────────
        const steps = rawSteps.includes(" | ")
          ? JSON.stringify(rawSteps.split(" | "))
          : rawSteps || null;

        await this.create({
          title,
          description: description || null,
          steps,
          expectedResult: expectedResult || null,
          category,
          executionType,
          priority,
          severity: severity || "medium",
          suite: suiteId ? { connect: { id: suiteId } } : undefined,
          status,
        });

        imported++;
      } catch {
        skipped++;
      }
    }

    return { imported, skipped, suiteCreated };
  }
}
