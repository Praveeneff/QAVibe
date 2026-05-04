import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Req,
  UseGuards, NotFoundException, ForbiddenException, BadRequestException,
  HttpCode, HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ExecutorService, type Assertion } from "./executor.service";

// ── DTOs ──────────────────────────────────────────────────────────────────────

interface CreateCollectionDto {
  projectId:   string;
  name:        string;
  description?: string;
  variables?:  Record<string, unknown>;
  testIds?:    string[]; // ordered list of ApiTest ids to add immediately
}

interface UpdateCollectionDto {
  name?:        string;
  description?: string;
  variables?:   Record<string, unknown>;
}

interface SetTestsDto {
  testIds: string[]; // full ordered replacement
}

interface RunCollectionDto {
  variables?:   Record<string, unknown>; // runtime overrides, highest priority
  environment?: string;
  stopOnFail?:  boolean; // default false — run all regardless
}

// ── Per-test run result ───────────────────────────────────────────────────────

export interface CollectionTestResult {
  order:          number;
  apiTestId:      string;
  name:           string;
  method:         string;
  url:            string;
  status:         "pass" | "fail" | "error" | "skipped";
  responseStatus: number | null;
  responseTime:   number | null;
  assertionResults: unknown[];
  error?:         string;
  executionId?:   string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller("api/collections")
export class CollectionsController {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly executor:  ExecutorService,
  ) {}

  // ── POST /api/collections ──────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCollectionDto, @Req() req: any) {
    if (!dto.projectId) throw new BadRequestException("projectId is required");
    if (!dto.name?.trim()) throw new BadRequestException("name is required");
    await this.requireProjectAccess(dto.projectId, req.user.id);

    const collection = await this.prisma.apiCollection.create({
      data: {
        projectId:   dto.projectId,
        name:        dto.name.trim(),
        description: dto.description ?? null,
        variables:   (dto.variables ?? undefined) as any,
        createdBy:   req.user.id,
      },
    });

    // Optionally seed with initial tests
    if (dto.testIds?.length) {
      await this.prisma.apiCollectionTest.createMany({
        data: dto.testIds.map((apiTestId, order) => ({
          collectionId: collection.id,
          apiTestId,
          order,
        })),
        skipDuplicates: true,
      });
    }

    return this.loadCollection(collection.id);
  }

  // ── GET /api/collections?projectId=xxx ────────────────────────────────────

  @Get()
  async list(@Query("projectId") projectId: string, @Req() req: any) {
    if (!projectId) throw new BadRequestException("projectId query param is required");
    await this.requireProjectAccess(projectId, req.user.id);

    const collections = await this.prisma.apiCollection.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { tests: true } },
      },
    });

    return collections;
  }

  // ── GET /api/collections/:id ──────────────────────────────────────────────

  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: any) {
    const col = await this.loadCollection(id);
    await this.requireProjectAccess(col.projectId, req.user.id);
    return col;
  }

  // ── PUT /api/collections/:id ──────────────────────────────────────────────

  @Put(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateCollectionDto, @Req() req: any) {
    const col = await this.prisma.apiCollection.findUnique({ where: { id } });
    if (!col) throw new NotFoundException("Collection not found");
    await this.requireProjectAccess(col.projectId, req.user.id);

    await this.prisma.apiCollection.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name:        dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.variables   !== undefined && { variables:   dto.variables as any }),
      },
    });

    return this.loadCollection(id);
  }

  // ── DELETE /api/collections/:id ───────────────────────────────────────────

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: any) {
    const col = await this.prisma.apiCollection.findUnique({ where: { id } });
    if (!col) throw new NotFoundException("Collection not found");
    await this.requireProjectAccess(col.projectId, req.user.id);
    await this.prisma.apiCollection.delete({ where: { id } });
    return { success: true };
  }

  // ── PUT /api/collections/:id/tests — set ordered test list ────────────────

  @Put(":id/tests")
  async setTests(@Param("id") id: string, @Body() dto: SetTestsDto, @Req() req: any) {
    const col = await this.prisma.apiCollection.findUnique({ where: { id } });
    if (!col) throw new NotFoundException("Collection not found");
    await this.requireProjectAccess(col.projectId, req.user.id);
    if (!Array.isArray(dto.testIds)) throw new BadRequestException("testIds must be an array");

    // Full replacement: delete existing, insert new ordered set
    await this.prisma.$transaction([
      this.prisma.apiCollectionTest.deleteMany({ where: { collectionId: id } }),
      this.prisma.apiCollectionTest.createMany({
        data: dto.testIds.map((apiTestId, order) => ({ collectionId: id, apiTestId, order })),
      }),
    ]);

    return this.loadCollection(id);
  }

  // ── POST /api/collections/:id/run ─────────────────────────────────────────

  @Post(":id/run")
  async run(@Param("id") id: string, @Body() dto: RunCollectionDto, @Req() req: any) {
    const col = await this.loadCollection(id);
    await this.requireProjectAccess(col.projectId, req.user.id);

    const stopOnFail     = dto.stopOnFail ?? false;
    const runtimeVars    = dto.variables  ?? {};

    // Collection-level vars are the base; test-level vars override; runtime overrides all
    const collectionVars = (col.variables as Record<string, unknown>) ?? {};

    const startedAt  = new Date();
    const testResults: CollectionTestResult[] = [];
    let   skippedDueToFail = false;

    for (const ct of col.tests) {
      const test = ct.apiTest;

      if (skippedDueToFail) {
        testResults.push({
          order:            ct.order,
          apiTestId:        test.id,
          name:             test.name,
          method:           test.method,
          url:              test.url,
          status:           "skipped",
          responseStatus:   null,
          responseTime:     null,
          assertionResults: [],
        });
        continue;
      }

      // Variable merge: collection → test → runtime (highest wins)
      const variables: Record<string, unknown> = {
        ...collectionVars,
        ...((test.variables as Record<string, unknown>) ?? {}),
        ...runtimeVars,
      };

      const result = await this.executor.execute(
        test.method,
        test.url,
        test.headers     as any,
        test.queryParams as any,
        test.body,
        test.assertions  as unknown as Assertion[],
        variables,
      );

      console.log(
        `[Collection] ${col.name} › ${test.name} — ${result.status} ` +
        `${result.responseStatus ?? "ERR"} ${result.responseTime ?? "?"}ms`,
      );

      // Persist individual execution record
      const execution = await this.prisma.apiExecution.create({
        data: {
          apiTestId:        test.id,
          status:           result.status,
          responseStatus:   result.responseStatus  ?? null,
          responseTime:     result.responseTime    ?? null,
          responseHeaders:  result.responseHeaders  ?? undefined,
          responseBody:     (result.responseBody    ?? undefined) as any,
          assertionResults: result.assertionResults as any[],
          error:            result.error            ?? null,
          errorStack:       result.errorStack       ?? null,
          environment:      dto.environment         ?? null,
          executedBy:       req.user.id,
        },
      });

      testResults.push({
        order:            ct.order,
        apiTestId:        test.id,
        name:             test.name,
        method:           test.method,
        url:              test.url,
        status:           result.status,
        responseStatus:   result.responseStatus   ?? null,
        responseTime:     result.responseTime     ?? null,
        assertionResults: result.assertionResults,
        error:            result.error,
        executionId:      execution.id,
      });

      if (stopOnFail && result.status !== "pass") {
        skippedDueToFail = true;
      }
    }

    const passed   = testResults.filter((r) => r.status === "pass").length;
    const failed   = testResults.filter((r) => r.status === "fail" || r.status === "error").length;
    const skipped  = testResults.filter((r) => r.status === "skipped").length;
    const duration = Date.now() - startedAt.getTime();

    return {
      collectionId:  col.id,
      collectionName: col.name,
      status:        failed > 0 ? "fail" : "pass",
      passed,
      failed,
      skipped,
      total:         testResults.length,
      duration,
      startedAt:     startedAt.toISOString(),
      results:       testResults,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadCollection(id: string) {
    const col = await this.prisma.apiCollection.findUnique({
      where: { id },
      include: {
        tests: {
          orderBy: { order: "asc" },
          include: {
            apiTest: {
              include: {
                executions: {
                  orderBy: { executedAt: "desc" },
                  take: 1,
                  select: { id: true, status: true, responseTime: true, executedAt: true },
                },
              },
            },
          },
        },
      },
    });
    if (!col) throw new NotFoundException("Collection not found");
    return col;
  }

  private async requireProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { userId } } },
    });
    if (!project) throw new NotFoundException("Project not found");
    if (project.members.length === 0 && project.createdBy !== userId) {
      throw new ForbiddenException("Access denied to this project");
    }
    return project;
  }
}
