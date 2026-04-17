import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Response } from "express";
import { TestCaseService } from "./test-case.service";
import { HistoryService } from "./history.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateTestCaseDto } from "./dto/create-test-case.dto";
import { UpdateTestCaseDto } from "./dto/update-test-case.dto";

function csvCell(value: string | null | undefined): string {
  const s = String(value ?? "");
  return '"' + s.replace(/"/g, '""') + '"';
}

interface ScanMatch {
  idA: string; titleA: string;
  idB: string; titleB: string;
  score: number;
  level: "high" | "medium";
}

@Controller("test-cases")
export class TestCaseController {
  constructor(
    private readonly testCaseService: TestCaseService,
    private readonly historyService:  HistoryService,
  ) {}

  @Get()
  findAll(
    @Query("suiteId")    suiteId?: string,
    @Query("search")     search?: string,
    @Query("category")   category?: string,
    @Query("severity")   severity?: string,
    @Query("priority")   priority?: string,
    @Query("status")     status?: string,
    @Query("page")       page?: string,
    @Query("limit")      limit?: string,
    @Query("fields")     fields?: string,
    @Query("projectId")  projectId?: string,
    @Query("assignedTo") assignedTo?: string,
  ) {
    return this.testCaseService.findAll({
      suiteId,
      search,
      category,
      severity,
      priority,
      status,
      page:   page  ? parseInt(page,  10) : undefined,
      limit:  limit ? parseInt(limit, 10) : undefined,
      fields,
      projectId,
      assignedTo,
    });
  }

  @Patch(":id/assign")
  @UseGuards(JwtAuthGuard)
  assignTestCase(
    @Param("id") id: string,
    @Body("assignedTo") assignedTo: string | null,
  ) {
    return this.testCaseService.assignTestCase(id, assignedTo ?? null);
  }

  // Must be before @Get(":id") so Express doesn't match "export" as an id
  @Get("export")
  async exportCsv(
    @Res() res: Response,
    @Query("suiteId")   suiteId?: string,
    @Query("search")    search?: string,
    @Query("category")  category?: string,
    @Query("severity")  severity?: string,
    @Query("priority")  priority?: string,
    @Query("status")    status?: string,
  ) {
    const cases = await this.testCaseService.findForExport({ suiteId, search, category, severity, priority, status });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="qavibe-export-${date}.csv"`,
    );

    const headerRow = [
      "tcId", "title", "description", "steps", "expectedResult",
      "category", "executionType", "priority", "severity", "suiteName", "status", "createdAt",
    ].join(",");

    const dataRows = cases.map((tc) => {
      let steps = tc.steps ?? "";
      try {
        const arr: unknown = JSON.parse(steps);
        if (Array.isArray(arr)) steps = arr.join(" | ");
      } catch {
        // keep as-is
      }

      return [
        tc.tcId ?? tc.id,
        tc.title,
        tc.description ?? "",
        steps,
        tc.expectedResult ?? "",
        tc.category,
        tc.executionType,
        tc.priority,
        tc.severity,
        tc.suite?.name ?? "",
        tc.status,
        tc.createdAt.toISOString(),
      ]
        .map(csvCell)
        .join(",");
    });

    const csv = [headerRow, ...dataRows].join("\r\n");
    res.end(csv);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.testCaseService.findOne(id);
  }

  // Must be before @Post() so "import" is not treated as a body payload
  @Post("import")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  importCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.testCaseService.importFromCsv(file.buffer);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: CreateTestCaseDto, @Request() req: any) {
    return this.testCaseService.create(body, req.user?.id);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  update(
    @Param("id") id: string,
    @Body() body: UpdateTestCaseDto,
    @Request() req: any,
  ) {
    return this.testCaseService.update(id, body, req.user?.id, "manual");
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.testCaseService.remove(id);
  }

  // ── Bulk duplicate scan (word-overlap, no AI) ──────────────────────────────

  @Post("scan-duplicates")
  @UseGuards(JwtAuthGuard)
  async scanDuplicates(@Body() body: { suiteId?: string }) {
    const where: any = {};
    if (body?.suiteId) where.suiteId = body.suiteId;

    const cases = await this.testCaseService.findForExport(where);

    // Tokenise: lowercase words, strip punctuation, remove stop-words
    const STOP = new Set(["a", "an", "the", "is", "are", "to", "in", "on", "of", "and", "or", "with", "for", "that", "this", "it", "at", "by", "from"]);
    function tokenise(text: string): Set<string> {
      return new Set(
        text
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2 && !STOP.has(w)),
      );
    }

    function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
      if (a.size === 0 && b.size === 0) return 0;
      let intersection = 0;
      for (const t of a) { if (b.has(t)) intersection++; }
      const union = a.size + b.size - intersection;
      return union === 0 ? 0 : intersection / union;
    }

    const tokenCache = cases.map((tc) => ({
      id: tc.id,
      title: tc.title,
      tokens: tokenise(`${tc.title} ${tc.steps ?? ""}`),
    }));

    const matches: ScanMatch[] = [];
    for (let i = 0; i < tokenCache.length; i++) {
      for (let j = i + 1; j < tokenCache.length; j++) {
        const score = jaccardSimilarity(tokenCache[i].tokens, tokenCache[j].tokens);
        if (score >= 0.4) {
          matches.push({
            idA: tokenCache[i].id, titleA: tokenCache[i].title,
            idB: tokenCache[j].id, titleB: tokenCache[j].title,
            score: Math.round(score * 100),
            level: score >= 0.65 ? "high" : "medium",
          });
        }
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return { total: matches.length, matches: matches.slice(0, 200) };
  }

  // ── History endpoints ───────────────────────────────────────────────────────

  @Get(":id/history")
  getHistory(@Param("id") id: string) {
    return this.historyService.getHistory(id);
  }

  @Post(":id/history/:historyId/restore")
  @UseGuards(JwtAuthGuard)
  restoreVersion(
    @Param("id")        id:        string,
    @Param("historyId") historyId: string,
    @Request()          req:       any,
  ) {
    return this.historyService.restoreVersion(id, historyId, req.user?.id);
  }
}
