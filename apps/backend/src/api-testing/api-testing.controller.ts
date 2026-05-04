import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { ExecutorService, type Assertion } from "./executor.service";

// ── DTOs ──────────────────────────────────────────────────────────────────────

const VALID_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
type HttpMethod = (typeof VALID_METHODS)[number];

interface CreateApiTestDto {
  projectId: string;
  name: string;
  description?: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: unknown;
  assertions: Assertion[];
  suiteId?: string;
  variables?: Record<string, unknown>;
}

interface ExecuteApiTestDto {
  variables?: Record<string, unknown>;
  environment?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller("api/api-tests")
export class ApiTestingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: ExecutorService,
  ) {}

  // ── POST /api/api-tests ─────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateApiTestDto, @Req() req: any) {
    if (!dto.projectId) throw new BadRequestException("projectId is required");
    if (!dto.name?.trim()) throw new BadRequestException("name is required");
    if (!dto.url?.trim()) throw new BadRequestException("url is required");
    if (!VALID_METHODS.includes(dto.method)) {
      throw new BadRequestException(`method must be one of: ${VALID_METHODS.join(", ")}`);
    }
    if (!Array.isArray(dto.assertions)) {
      throw new BadRequestException("assertions must be an array");
    }

    await this.requireProjectAccess(dto.projectId, req.user.id);

    return this.prisma.apiTest.create({
      data: {
        projectId:   dto.projectId,
        name:        dto.name.trim(),
        description: dto.description     ?? null,
        method:      dto.method,
        url:         dto.url.trim(),
        headers:     (dto.headers         ?? undefined) as any,
        queryParams: (dto.queryParams     ?? undefined) as any,
        body:        (dto.body            ?? undefined) as any,
        assertions:  dto.assertions       as any[],
        suiteId:     dto.suiteId         ?? null,
        variables:   (dto.variables       ?? undefined) as any,
        createdBy:   req.user.id,
      },
      include: { suite: { select: { id: true, name: true } } },
    });
  }

  // ── GET /api/api-tests?projectId=xxx ────────────────────────────────────────

  @Get()
  async list(@Query("projectId") projectId: string, @Req() req: any) {
    if (!projectId) throw new BadRequestException("projectId query param is required");
    await this.requireProjectAccess(projectId, req.user.id);

    const tests = await this.prisma.apiTest.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        suite: { select: { id: true, name: true } },
        executions: {
          orderBy: { executedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            responseStatus: true,
            responseTime: true,
            executedAt: true,
          },
        },
      },
    });

    return tests.map(({ executions, ...t }) => ({
      ...t,
      lastExecution: executions[0] ?? null,
    }));
  }

  // ── GET /api/api-tests/:id ──────────────────────────────────────────────────

  @Get(":id")
  async findOne(@Param("id") id: string, @Req() req: any) {
    const test = await this.prisma.apiTest.findUnique({
      where: { id },
      include: {
        suite: { select: { id: true, name: true } },
        executions: {
          orderBy: { executedAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            responseStatus: true,
            responseTime: true,
            assertionResults: true,
            error: true,
            environment: true,
            executedAt: true,
          },
        },
      },
    });

    if (!test) throw new NotFoundException("API test not found");
    await this.requireProjectAccess(test.projectId, req.user.id);
    return test;
  }

  // ── PUT /api/api-tests/:id ──────────────────────────────────────────────────

  @Put(":id")
  async update(@Param("id") id: string, @Body() dto: Partial<CreateApiTestDto>, @Req() req: any) {
    const test = await this.prisma.apiTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException("API test not found");
    await this.requireProjectAccess(test.projectId, req.user.id);

    if (dto.method && !VALID_METHODS.includes(dto.method)) {
      throw new BadRequestException(`method must be one of: ${VALID_METHODS.join(", ")}`);
    }

    return this.prisma.apiTest.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name:        dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.method      !== undefined && { method:      dto.method }),
        ...(dto.url         !== undefined && { url:         dto.url.trim() }),
        ...(dto.headers     !== undefined && { headers:     dto.headers     as any }),
        ...(dto.queryParams !== undefined && { queryParams: dto.queryParams as any }),
        ...(dto.body        !== undefined && { body:        dto.body        as any }),
        ...(dto.assertions  !== undefined && { assertions:  dto.assertions  as any[] }),
        ...(dto.suiteId     !== undefined && { suiteId:     dto.suiteId ?? null }),
        ...(dto.variables   !== undefined && { variables:   dto.variables   as any }),
      },
      include: { suite: { select: { id: true, name: true } } },
    });
  }

  // ── DELETE /api/api-tests/:id ───────────────────────────────────────────────

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: any) {
    const test = await this.prisma.apiTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException("API test not found");
    await this.requireProjectAccess(test.projectId, req.user.id);

    await this.prisma.apiTest.delete({ where: { id } });
    return { success: true };
  }

  // ── POST /api/api-tests/:id/execute ─────────────────────────────────────────

  @Post(":id/execute")
  async execute(@Param("id") id: string, @Body() dto: ExecuteApiTestDto, @Req() req: any) {
    const test = await this.prisma.apiTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException("API test not found");
    await this.requireProjectAccess(test.projectId, req.user.id);

    const variables: Record<string, unknown> = {
      ...((test.variables as Record<string, unknown>) ?? {}),
      ...(dto.variables ?? {}),
    };

    const result = await this.executor.execute(
      test.method,
      test.url,
      test.headers     as Record<string, string> | null,
      test.queryParams as Record<string, string> | null,
      test.body,
      test.assertions  as unknown as Assertion[],
      variables,
    );

    console.log(
      `[ApiTest] ${test.name} (${test.id}) — ${result.status} ` +
      `${result.responseStatus ?? "ERR"} ${result.responseTime ?? "?"}ms`,
    );

    const execution = await this.prisma.apiExecution.create({
      data: {
        apiTestId:        test.id,
        status:           result.status,
        responseStatus:   result.responseStatus  ?? null,
        responseTime:     result.responseTime    ?? null,
        responseHeaders:  result.responseHeaders  ?? undefined,
        responseBody:     (result.responseBody     ?? undefined) as any,
        assertionResults: result.assertionResults as any[],
        error:            result.error            ?? null,
        errorStack:       result.errorStack       ?? null,
        environment:      dto.environment         ?? null,
        executedBy:       req.user.id,
      },
    });

    return { ...result, executionId: execution.id };
  }

  // ── GET /api/api-tests/:id/executions?limit=10 ──────────────────────────────

  @Get(":id/executions")
  async listExecutions(
    @Param("id") id: string,
    @Query("limit") limitStr: string,
    @Req() req: any,
  ) {
    const test = await this.prisma.apiTest.findUnique({ where: { id } });
    if (!test) throw new NotFoundException("API test not found");
    await this.requireProjectAccess(test.projectId, req.user.id);

    const limit = Math.min(parseInt(limitStr ?? "10", 10) || 10, 100);

    return this.prisma.apiExecution.findMany({
      where: { apiTestId: id },
      orderBy: { executedAt: "desc" },
      take: limit,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async requireProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { userId } } },
    });
    if (!project) throw new NotFoundException("Project not found");

    const isMember = project.members.length > 0 || project.createdBy === userId;
    if (!isMember) throw new ForbiddenException("Access denied to this project");
    return project;
  }
}
