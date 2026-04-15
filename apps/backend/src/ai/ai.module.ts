import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { AI_PROVIDER_TOKEN, AiService } from "./ai.service";
import { AiGenerationContext } from "./ai-generation.context";
import { ClaudeService } from "./providers/claude.service";
import { OpenAiService } from "./providers/openai.service";
import { GeminiService } from "./providers/gemini.service";
import { OpenRouterService } from "./providers/openrouter.service";
import { GroqService } from "./providers/groq.service";
import { DocumentParserService } from "./document-parser.service";
import { BrdController } from "./brd.controller";
import { CodeExtractorService } from "./code-extractor.service";
import { CodebaseController } from "./codebase.controller";
import { DuplicateDetectorService } from "./duplicate-detector.service";
import { TestCaseModule } from "../test-case/test-case.module";

@Module({
  imports: [PrismaModule, AuthModule, TestCaseModule],
  controllers: [AiController, BrdController, CodebaseController],
  providers: [
    AiService,
    AiGenerationContext,
    DocumentParserService,
    CodeExtractorService,
    DuplicateDetectorService,
    ClaudeService,
    OpenAiService,
    GeminiService,
    OpenRouterService,
    GroqService,
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: (claude: ClaudeService, openai: OpenAiService, gemini: GeminiService, openrouter: OpenRouterService) => {
        switch (process.env.AI_PROVIDER) {
          case "openai":
            return openai;
          case "gemini":
            return gemini;
          case "openrouter":
            return openrouter;
          default:
            return claude;
        }
      },
      inject: [ClaudeService, OpenAiService, GeminiService, OpenRouterService],
    },
  ],
  exports: [DuplicateDetectorService],
})
export class AiModule {}
