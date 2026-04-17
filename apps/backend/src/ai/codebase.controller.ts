import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CodeExtractorService } from "./code-extractor.service";
import { AiGenerationContext, buildSystemPrompt, type GenerationContext } from "./ai-generation.context";
import { AiService } from "./ai.service";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TestCaseService } from "../test-case/test-case.service";

const MAX_CASES     = 50;
const DEFAULT_CASES = 30;
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB — zips can be large

function buildCodebaseSystemPrompt(
  ctx: GenerationContext,
  maxCases: number,
  focus: string | null,
): string {
  const basePrompt = buildSystemPrompt(ctx);
  const focusClause = focus
    ? `\nFocus area: Pay special attention to code related to "${focus}". Prioritize test cases for that area.\n`
    : "";

  return `You are a senior QA engineer analyzing source code to generate test cases.

Analyze the provided source code files and generate comprehensive test cases that cover:
- Every public function, method, and class with testable logic
- All API endpoints and route handlers (check controllers, routers, handlers)
- Authentication and authorization checks
- Input validation and boundary conditions
- Error handling paths and edge cases
- Happy path / expected behavior flows
${focusClause}
${basePrompt}

Rules:
1. Generate exactly ${maxCases} test cases.
2. Each test case must be specific to actual code found in the files — reference real function names, endpoints, or classes where relevant.
3. Do NOT duplicate test cases already covered by existing titles listed above.
4. Each test case must have: title, steps (numbered array), expectedResult, category, executionType, priority, severity.
5. Return ONLY a valid JSON array. No markdown, no explanation.
6. Item shape: { "title": "string", "steps": ["string"], "expectedResult": "string", "category": "string", "executionType": "string", "priority": "string", "severity": "string" }`;
}

@Controller("ai")
export class CodebaseController {
  constructor(
    private readonly codeExtractor: CodeExtractorService,
    private readonly generationContext: AiGenerationContext,
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
    private readonly testCaseService: TestCaseService,
  ) {}

  @Post("generate-from-codebase")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ZIP_BYTES },
    }),
  )
  async generateFromCodebase(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("repoUrl")   repoUrl?: string,
    @Body("suiteId")   suiteId?: string,
    @Body("maxCases")  maxCasesRaw?: string,
    @Body("focus")     focus?: string,
    @Body("projectId") projectId?: string,
    @Request()         req?: any,
  ) {
    // ── Validation ────────────────────────────────────────────────────────────
    const hasFile    = !!file;
    const hasRepoUrl = !!(repoUrl?.trim());

    if (!hasFile && !hasRepoUrl) {
      throw new BadRequestException(
        "Provide either a .zip file or a GitHub repository URL.",
      );
    }
    if (hasFile && hasRepoUrl) {
      throw new BadRequestException(
        "Provide either a .zip file or a GitHub repository URL — not both.",
      );
    }
    if (hasFile) {
      const mime = file!.mimetype ?? "";
      const ext  = (file!.originalname ?? "").split(".").pop()?.toLowerCase();
      if (!mime.includes("zip") && ext !== "zip") {
        throw new BadRequestException(
          "Uploaded file must be a .zip archive.",
        );
      }
    }
    if (hasRepoUrl && !repoUrl!.trim().startsWith("https://github.com")) {
      throw new BadRequestException(
        "Repository URL must start with https://github.com",
      );
    }

    const maxCases = Math.min(
      MAX_CASES,
      Math.max(1, parseInt(maxCasesRaw ?? String(DEFAULT_CASES), 10) || DEFAULT_CASES),
    );
    const focusArea = focus?.trim() || null;

    // ── 1. Extract code ───────────────────────────────────────────────────────
    let codeContent: string;
    let sourceLabel: string;

    if (hasFile) {
      codeContent  = this.codeExtractor.extractFromZip(file!);
      sourceLabel  = file!.originalname;
    } else {
      codeContent  = await this.codeExtractor.extractFromGithub(repoUrl!.trim());
      sourceLabel  = repoUrl!.trim();
    }

    console.log(
      `[Codebase] Extracted ${codeContent.length} chars from "${sourceLabel}" — requesting ${maxCases} cases` +
      (focusArea ? ` (focus: "${focusArea}")` : ""),
    );

    // ── 2. Build generation context + system prompt ───────────────────────────
    const ctx = await this.generationContext.buildGenerationContext();
    const systemPrompt = buildCodebaseSystemPrompt(ctx, maxCases, focusArea);

    // ── 3. Generate via AI fallback chain ─────────────────────────────────────
    const normalizedSuiteId = suiteId?.trim() || null;
    const createdBy: string | null = req?.user?.id ?? null;

    const t0 = Date.now();
    const result = await this.aiService.generateTestCasesWithPrompt(
      `Here is the source code to analyze:\n\n${codeContent}`,
      systemPrompt,
      createdBy ?? undefined,
    );
    const latencyMs = Date.now() - t0;

    console.log(
      `[Codebase] AI returned ${result.cases.length} cases in ${latencyMs}ms (${result.tokens ?? "?"} tokens)`,
    );

    // ── 4. Persist test cases ─────────────────────────────────────────────────

    const created = await Promise.all(
      result.cases.map((tc: any) =>
        this.testCaseService.create({
          title:          String(tc.title ?? "Untitled").slice(0, 255),
          description:    tc.description ? String(tc.description) : null,
          steps:          Array.isArray(tc.steps)
                            ? JSON.stringify(tc.steps)
                            : (tc.steps ? String(tc.steps) : null),
          expectedResult: tc.expectedResult ? String(tc.expectedResult) : null,
          category:       String(tc.category ?? "functional"),
          executionType:  String(tc.executionType ?? "manual"),
          priority:       String(tc.priority ?? "P2"),
          severity:       String(tc.severity ?? "medium"),
          status:         "active",
          suite:          normalizedSuiteId ? { connect: { id: normalizedSuiteId } } : undefined,
          ...(projectId ? { project: { connect: { id: projectId } } } : {}),
        }, createdBy ?? undefined),
      ),
    );

    // ── 5. Log to AiGenerationLog (fire-and-forget) ───────────────────────────
    this.prisma.aiGenerationLog.create({
      data: {
        provider:     "codebase-analysis",
        latencyMs,
        caseCount:    created.length,
        promptTokens: result.tokens ?? null,
        fallbackFrom: null,
      },
    }).catch((err) => console.error("[Codebase] Failed to write generation log:", err));

    return {
      generated: created.length,
      source:    sourceLabel,
      cases:     created,
    };
  }
}
