import { Injectable, InternalServerErrorException } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AIProviderConfig, AIProviderResult } from "./interface";

const SYSTEM_PROMPT = `You are a senior QA engineer. Given a feature requirement, FRD, or user story, generate structured test cases.

Always respond with ONLY a valid JSON array. No explanation, no markdown, no code blocks.

Each test case must follow this exact shape:
{
  "title": "string",
  "description": "string",
  "type": "manual",
  "steps": ["string", "string"],
  "expectedResult": "string"
}`;

@Injectable()
export class ClaudeService implements AIProvider {
  private client?: Anthropic;

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetry(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const type = (error as any)?.type;
    return type === "api_error" || message.includes("Internal server error");
  }

  private getClient(apiKey?: string): Anthropic {
    const key = apiKey ?? process.env.AI_CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new InternalServerErrorException(
        "AI_CLAUDE_API_KEY environment variable is missing",
      );
    }
    if (apiKey) return new Anthropic({ apiKey: key });
    if (!this.client) this.client = new Anthropic({ apiKey: key });
    return this.client;
  }

  private extractJsonCandidate(text: string): string | null {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return trimmed.slice(arrayStart, arrayEnd + 1);
    }

    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd > objectStart) {
      return trimmed.slice(objectStart, objectEnd + 1);
    }

    return null;
  }

  private parseResponse(text: string): { cases: any[]; suggestedSuite?: string } {
    const candidates = [text.trim(), this.extractJsonCandidate(text)].filter(
      (candidate): candidate is string => Boolean(candidate),
    );

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);

        // Handle new { suggestedSuite, cases } format
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const cases = parsed.cases ?? parsed.test_cases ?? parsed.testCases ?? Object.values(parsed).find(Array.isArray);
          if (Array.isArray(cases)) {
            return { cases, suggestedSuite: parsed.suggestedSuite };
          }
        }

        // Handle legacy plain array
        if (Array.isArray(parsed)) {
          return { cases: parsed };
        }
      } catch {
        continue;
      }
    }

    throw new InternalServerErrorException(
      "Claude returned invalid JSON for test cases",
    );
  }

  async generateTestCases(input: string, config: AIProviderConfig = {}): Promise<AIProviderResult> {
    try {
      let message: Anthropic.Message | undefined;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          message = await this.getClient(config.apiKey).messages.create({
            stream: false,
            model: config.model ?? process.env.AI_CLAUDE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-0",
            max_tokens: 4096,
            system: config.systemPrompt ?? SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: `Generate test cases for the following requirement:\n\n${input}`,
              },
            ],
          });
          break;
        } catch (error) {
          if (!this.shouldRetry(error) || attempt === 3) throw error;
          console.log("Retry attempt:", attempt);
          await this.delay(1000);
        }
      }

      if (!message || !("content" in message)) {
        throw new InternalServerErrorException("Invalid Claude response (stream not supported)");
      }

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => (block as Anthropic.TextBlock).text)
        .join("\n")
        .trim();

      if (!text) {
        throw new InternalServerErrorException("No text response from Claude");
      }

      const tokens = message.usage
        ? message.usage.input_tokens + message.usage.output_tokens
        : undefined;
      const { cases, suggestedSuite } = this.parseResponse(text);
      return { cases, tokens, suggestedSuite };
    } catch (error) {
      console.error("ClaudeService.generateTestCases failed", error);

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Claude request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
