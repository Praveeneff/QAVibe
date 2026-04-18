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
import { DocumentParserService } from "./document-parser.service";
import { AiGenerationContext, buildSystemPrompt, type GenerationContext } from "./ai-generation.context";
import { AiService } from "./ai.service";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TestCaseService } from "../test-case/test-case.service";

const DEFAULT_CASES = 20;
const MAX_CASES = 200;   // raised from 50
const CHUNK_SIZE = 10;   // max cases per single AI call
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function buildBrdSystemPrompt(ctx: GenerationContext, maxCases: number): string {
  const basePrompt = buildSystemPrompt(ctx);

  return `You are a senior QA engineer. You have been given a Business Requirements Document (BRD).
Your job is to read it carefully and generate comprehensive test cases that cover:
- Every functional requirement mentioned
- Edge cases and boundary conditions
- Negative/error scenarios
- Happy path flows

${basePrompt}

Rules:
1. Generate exactly ${maxCases} test cases.
2. Cover requirements not already addressed by existing test cases listed above.
3. Each test case must have: title, steps, expectedResult, category, executionType, priority, severity.
4. steps MUST be a JSON array of strings. Each step is one clear action. Minimum 3 steps per test case. Example: "steps": ["Navigate to the login page", "Enter valid credentials", "Click Submit", "Verify redirect to dashboard"]
5. Return ONLY a valid JSON array. No markdown, no explanation.
6. Item shape: { "title": "string", "steps": ["Step 1 description", "Step 2 description", "Step 3 description"], "expectedResult": "string", "category": "string", "executionType": "string", "priority": "string", "severity": "string" }`;
}

@Controller("ai")
export class BrdController {
  constructor(
    private readonly documentParser: DocumentParserService,
    private readonly generationContext: AiGenerationContext,
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
    private readonly testCaseService: TestCaseService,
  ) {}

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  @Post("generate-from-brd")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  async generateFromBrd(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("suiteId")     suiteId?: string,
    @Body("maxCases")    maxCasesRaw?: string,
    @Body("useModules")  useModulesRaw?: string,
    @Body("projectId")   projectId?: string,
    @Request()           req?: any,
  ) {
    if (!file) {
      throw new BadRequestException("No file uploaded. Provide a PDF, Word (.docx), or plain text file.");
    }

    const documentText = await this.documentParser.parseDocument(file);
    console.log(`[BRD] Parsed ${file.originalname} — ${documentText.length} chars`);

    const maxCases = Math.min(
      MAX_CASES,
      Math.max(1, parseInt(maxCasesRaw ?? String(DEFAULT_CASES), 10) || DEFAULT_CASES),
    );
    const useModules = useModulesRaw !== "false";
    const normalizedSuiteId = suiteId?.trim() || null;
    const createdBy: string | null = req?.user?.id ?? null;

    // ── Single-pass fallback ──────────────────────────────────────────────────
    if (!useModules) {
      const ctx = await this.generationContext.buildGenerationContext(projectId);
      const systemPrompt = buildBrdSystemPrompt(ctx, maxCases);

      const t0 = Date.now();
      const cases = await this.aiService.generateTestCasesWithPrompt(
        `Here is the BRD:\n\n${documentText}`,
        systemPrompt,
        createdBy ?? undefined,
      );
      const latencyMs = Date.now() - t0;

      console.log(`[BRD] AI returned ${cases.cases.length} cases in ${latencyMs}ms`);

      const created: any[] = [];
      for (const tc of cases.cases) {
        const saved = await this.testCaseService.create({
          title:          String(tc.title ?? "Untitled").slice(0, 255),
          description:    tc.description ? String(tc.description) : null,
          steps:          Array.isArray(tc.steps)
                            ? JSON.stringify(tc.steps)
                            : tc.steps
                              ? JSON.stringify(String(tc.steps).split("\n").map((s: string) => s.trim()).filter(Boolean))
                              : null,
          expectedResult: tc.expectedResult ? String(tc.expectedResult) : null,
          category:       String(tc.category ?? "functional"),
          executionType:  String(tc.executionType ?? "manual"),
          priority:       String(tc.priority ?? "P2"),
          severity:       String(tc.severity ?? "medium"),
          preconditions:  tc.preconditions ? String(tc.preconditions) : null,
          tags:           tc.tags ? String(tc.tags) : null,
          automationId:   null,
          status:         "active",
          suite:          normalizedSuiteId ? { connect: { id: normalizedSuiteId } } : undefined,
          ...(projectId ? { project: { connect: { id: projectId } } } : {}),
        }, createdBy ?? undefined);
        created.push(saved);
      }

      this.prisma.aiGenerationLog.create({
        data: { provider: "brd-upload", latencyMs, caseCount: created.length, promptTokens: cases.tokens ?? null, fallbackFrom: null },
      }).catch((err) => console.error("[BRD] Failed to write generation log:", err));

      return { mode: "single", generated: created.length, cases: created };
    }

    // ── Module-based generation ───────────────────────────────────────────────
    console.log(`[BRD] Extracting modules from document...`);

    const extractionPrompt = this.generationContext.buildModuleExtractionPrompt();
    const moduleResult = await this.aiService.generateTestCasesWithPrompt(
      `Here is the BRD document:\n\n${documentText}`,
      extractionPrompt,
      createdBy ?? undefined,
    );

    // Parser returns the array in .cases when AI returns a bare JSON array
    let modules: { name: string; description: string; keywords: string[] }[] = [];
    try {
      const raw = moduleResult.cases;
      if (Array.isArray(raw) && raw.length > 0 && raw[0]?.name) {
        modules = raw;
      } else if (Array.isArray((moduleResult as any).modules)) {
        modules = (moduleResult as any).modules;
      }
    } catch {
      throw new BadRequestException("Failed to extract modules from document");
    }

    if (!modules.length) {
      throw new BadRequestException("No modules found in document");
    }

    console.log(`[BRD] Found ${modules.length} modules:`, modules.map((m) => m.name));

    const allCreated: any[] = [];
    const moduleResults: { module: string; suiteId: string; count: number }[] = [];
    const brdT0 = Date.now();

    const allResults = await Promise.allSettled(
      modules.map(async (mod) => {
        // 1. Create suite for this module
        const moduleSuite = await this.prisma.testSuite.create({
          data: {
            name:        mod.name,
            description: mod.description,
            parentId:    normalizedSuiteId,
            depth:       normalizedSuiteId ? 1 : 0,
            ...(projectId ? { projectId } : {}),
          },
        });

        // 2. Calculate cases for this module and split into chunks
        const casesForModule = Math.max(3, Math.floor(maxCases / modules.length));
        const numChunks = Math.ceil(casesForModule / CHUNK_SIZE);
        const chunkSizes = Array.from({ length: numChunks }, (_, i) =>
          i < numChunks - 1 ? CHUNK_SIZE : casesForModule - CHUNK_SIZE * (numChunks - 1),
        );

        console.log(`[BRD] Module "${mod.name}": ${casesForModule} cases across ${numChunks} chunk(s)`);

        // 3. Run chunks sequentially within each module to avoid rate limits
        // (modules themselves still run in parallel via the outer allSettled)
        const chunkResults: PromiseSettledResult<{ cases: any[]; tokens?: number }>[] = [];
        for (const chunkCount of chunkSizes) {
          try {
            const chunkPrompt = this.generationContext.buildModuleTestCasePrompt(
              mod.name,
              mod.description,
              chunkCount,
            );
            const result = await this.aiService.generateTestCasesWithPrompt(
              `Here is the BRD document:\n\n${documentText}\n\nFocus on the "${mod.name}" module. Keywords: ${mod.keywords?.join(", ")}`,
              chunkPrompt,
              createdBy ?? undefined,
            );
            chunkResults.push({ status: "fulfilled", value: result });
          } catch (err) {
            chunkResults.push({ status: "rejected", reason: err });
          }
        }

        // 4. Merge chunk results
        let moduleTokens = 0;
        const moduleCases: any[] = [];
        for (const chunkResult of chunkResults) {
          if (chunkResult.status === "fulfilled") {
            moduleCases.push(...chunkResult.value.cases);
            moduleTokens += (chunkResult.value.tokens ?? 0);
          } else {
            console.error(`[BRD] Chunk failed for module ${mod.name}:`, chunkResult.reason);
          }
        }

        // 5. Save test cases sequentially (preserves tcId ordering)
        const created: any[] = [];
        for (const tc of moduleCases) {
          const saved = await this.testCaseService.create({
            title:          String(tc.title ?? "Untitled").slice(0, 255),
            description:    tc.description ? String(tc.description) : null,
            steps:          Array.isArray(tc.steps)
                              ? JSON.stringify(tc.steps)
                              : tc.steps
                                ? JSON.stringify(String(tc.steps).split("\n").map((s: string) => s.trim()).filter(Boolean))
                                : null,
            expectedResult: tc.expectedResult ? String(tc.expectedResult) : null,
            category:       String(tc.category ?? "functional"),
            executionType:  String(tc.executionType ?? "manual"),
            priority:       String(tc.priority ?? "P2"),
            severity:       String(tc.severity ?? "medium"),
            preconditions:  tc.preconditions ? String(tc.preconditions) : null,
            tags:           tc.tags ? String(tc.tags) : null,
            automationId:   null,
            status:         "active",
            suite:          { connect: { id: moduleSuite.id } },
            ...(projectId ? { project: { connect: { id: projectId } } } : {}),
          }, createdBy ?? undefined);
          created.push(saved);
        }

        allCreated.push(...created);
        moduleResults.push({ module: mod.name, suiteId: moduleSuite.id, count: created.length });

        return { tokens: moduleTokens, count: created.length };
      }),
    );

    // Aggregate tokens and log any module-level failures
    const totalTokens = allResults.reduce((sum, r) =>
      r.status === "fulfilled" ? sum + (r.value?.tokens ?? 0) : sum, 0,
    );
    allResults.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`[BRD] Module "${modules[i]?.name}" failed:`, result.reason);
      }
    });

    this.prisma.aiGenerationLog.create({
      data: { provider: "brd-upload-modules", latencyMs: Date.now() - brdT0, caseCount: allCreated.length, promptTokens: totalTokens || null, fallbackFrom: null },
    }).catch((err) => console.error("[BRD] Failed to write generation log:", err));

    return {
      mode:      "modules",
      modules:   moduleResults,
      generated: allCreated.length,
      cases:     allCreated,
    };
  }
}
