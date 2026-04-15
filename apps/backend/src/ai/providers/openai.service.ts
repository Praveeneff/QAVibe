import { Injectable, InternalServerErrorException } from "@nestjs/common";
import OpenAI from "openai";
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
export class OpenAiService implements AIProvider {
  private client?: OpenAI;

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetry(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const type = (error as any)?.type;
    return type === "api_error" || message.includes("Internal server error");
  }

  private getClient(apiKey?: string): OpenAI {
    const key = apiKey ?? process.env.AI_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new InternalServerErrorException(
        "AI_OPENAI_API_KEY environment variable is missing",
      );
    }
    if (apiKey) return new OpenAI({ apiKey: key });
    if (!this.client) this.client = new OpenAI({ apiKey: key });
    return this.client;
  }

  async generateTestCases(input: string, config: AIProviderConfig = {}): Promise<AIProviderResult> {
    let completion: OpenAI.Chat.Completions.ChatCompletion | undefined;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        completion = await this.getClient(config.apiKey).chat.completions.create({
          stream: false,
          model: config.model ?? process.env.AI_OPENAI_MODEL ?? "gpt-4o",
          messages: [
            { role: "system", content: config.systemPrompt ?? SYSTEM_PROMPT },
            {
              role: "user",
              content: `Generate test cases for the following requirement:\n\n${input}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        break;
      } catch (error) {
        if (!this.shouldRetry(error) || attempt === 3) throw error;
        console.log("Retry attempt:", attempt);
        await this.delay(1000);
      }
    }

    if (!completion || !("choices" in completion)) {
      throw new InternalServerErrorException("Invalid OpenAI response (stream not supported)");
    }

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new InternalServerErrorException("No response from OpenAI");
    }

    try {
      const parsed = JSON.parse(text);

      // Handle new { suggestedSuite, cases } format
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const cases = parsed.cases ?? parsed.test_cases ?? parsed.testCases ?? Object.values(parsed).find(Array.isArray);
        if (Array.isArray(cases)) {
          return { cases, tokens: completion.usage?.total_tokens ?? undefined, suggestedSuite: parsed.suggestedSuite };
        }
      }

      // Handle legacy plain array format
      if (!Array.isArray(parsed)) throw new Error("Response is not an array");
      return { cases: parsed, tokens: completion.usage?.total_tokens ?? undefined };
    } catch {
      throw new InternalServerErrorException(
        "Failed to parse OpenAI response as JSON",
      );
    }
  }
}
