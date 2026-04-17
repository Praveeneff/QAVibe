import { Controller, Post, Body, UseGuards, Request } from "@nestjs/common";
import { AiService } from "./ai.service";
import { DuplicateDetectorService } from "./duplicate-detector.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

@Controller("ai")
export class AiController {
  constructor(
    private readonly aiService:        AiService,
    private readonly duplicateDetector: DuplicateDetectorService,
    private readonly prisma:            PrismaService,
  ) {}

  @Post("check-duplicate")
  @UseGuards(JwtAuthGuard)
  async checkDuplicate(
    @Body()
    body: {
      title:      string;
      steps:      string;
      suiteId?:   string;
      excludeId?: string;
    },
  ) {
    const where: any = {};
    if (body.suiteId)   where.suiteId = body.suiteId;
    if (body.excludeId) where.id = { not: body.excludeId };

    const existing = await this.prisma.testCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, title: true, steps: true },
    });

    const cases = existing.map((tc) => ({
      id:    tc.id,
      title: tc.title,
      steps: tc.steps ?? "",
    }));

    return this.duplicateDetector.findDuplicates(body.title, body.steps ?? "", cases);
  }

  @Post("generate-test-cases")
  @UseGuards(JwtAuthGuard)
  generate(
    @Body()
    body: {
      input: string;
      provider?: string;
      model?: string;
      apiKey?: string;
    },
    @Request() req: any,
  ) {
    const userId = req?.user?.id ?? undefined;
    console.log("AI endpoint hit, provider:", body.provider ?? "default");
    return this.aiService.generateTestCases(body.input, {
      provider: body.provider,
      model: body.model,
      apiKey: body.apiKey,
    }, userId);
  }
}
