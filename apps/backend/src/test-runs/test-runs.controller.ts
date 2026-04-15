import { Controller, Post, Get, Patch, Param, Body, Query, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { TestRunsService } from "./test-runs.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateRunDto } from "./dto/create-run.dto";
import { UpdateResultDto } from "./dto/update-result.dto";

@Controller("test-runs")
export class TestRunsController {
  constructor(private readonly testRunsService: TestRunsService) {}

  // ── Static routes first (must precede :id to avoid param capture) ──────────

  @Get()
  getAllRuns() {
    return this.testRunsService.getAllRuns();
  }

  @Get("stats")
  getRunStats(@Query("environment") environment?: string) {
    return this.testRunsService.getRunStats(environment);
  }

  @Get("trend")
  getPassRateTrend(@Query("environment") environment?: string) {
    return this.testRunsService.getPassRateTrend(environment);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  createRun(@Body() body: CreateRunDto) {
    return this.testRunsService.createRun(
      body.name,
      body.testCaseIds,
      body.environment ?? "staging",
      body.browser,
      body.buildVersion,
      body.device,
    );
  }

  // ── Parameterized routes ────────────────────────────────────────────────────

  @Get(":id")
  getRun(@Param("id") id: string) {
    return this.testRunsService.getRun(id);
  }

  @Patch(":id/results/:resultId")
  @UseGuards(JwtAuthGuard)
  updateResult(
    @Param("resultId") resultId: string,
    @Body() body: UpdateResultDto,
  ) {
    return this.testRunsService.updateResult(
      resultId,
      body.status,
      body.notes,
      body.screenshotUrl,
    );
  }

  @Patch(":id/complete")
  @UseGuards(JwtAuthGuard)
  completeRun(@Param("id") id: string) {
    return this.testRunsService.completeRun(id);
  }

  @Post(":id/rerun")
  @UseGuards(JwtAuthGuard)
  createRerun(@Param("id") id: string, @Request() req: any) {
    return this.testRunsService.createRerun(id, req.user?.id);
  }

  @Post(":runId/results/:resultId/screenshot")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file", {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith("image/")) {
        cb(new BadRequestException("Only image files are allowed"), false);
      } else {
        cb(null, true);
      }
    },
  }))
  async uploadScreenshot(
    @Param("runId") runId: string,
    @Param("resultId") resultId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    const url = await this.testRunsService.uploadScreenshot(file, resultId);
    await this.testRunsService.updateResult(resultId, undefined as any, undefined, url);
    return { screenshotUrl: url };
  }
}
