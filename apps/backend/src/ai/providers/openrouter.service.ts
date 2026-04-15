import { Injectable, InternalServerErrorException, HttpException, HttpStatus } from "@nestjs/common";
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

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "meta-llama/llama-3.2-3b-instruct:free";

function isRateLimitError(error: unknown): boolean {
  const status = (error as any)?.status;
  const message = error instanceof Error ? error.message : String(error);
  return (
    status === 429 ||
    (error instanceof HttpException && error.getStatus() === 429) ||
    message.includes("429") ||
    message.includes("Too Many Requests") ||
    message.includes("quota")
  );
}

@Injectable()
export class OpenRouterService implements AIProvider {
  private client?: OpenAI;

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetry(error: unknown): boolean {
    if (isRateLimitError(error)) return false; // let 429 bubble to fallback chain
    if (error instanceof HttpException) {
      // Only retry 502 Bad Gateway (transient); 500/503 go to fallback chain
      return error.getStatus() === 502;
    }
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("502") || message.includes("Bad Gateway");
  }

  private getClient(apiKey?: string): OpenAI {
    const key = apiKey ?? process.env.AI_OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new InternalServerErrorException(
        "AI_OPENROUTER_API_KEY environment variable is missing",
      );
    }
    if (apiKey) {
      return new OpenAI({
        apiKey: key,
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: { "HTTP-Referer": "http://localhost:3000" },
      });
    }
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: key,
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: { "HTTP-Referer": "http://localhost:3000" },
      });
    }
    return this.client;
  }

  async generateTestCases(input: string, config: AIProviderConfig = {}): Promise<AIProviderResult> {
    const model = config.model ?? process.env.AI_OPENROUTER_MODEL ?? DEFAULT_MODEL;
    let completion: OpenAI.Chat.Completions.ChatCompletion | undefined;

    for (let attempt = 1; attempt <= 2; attempt++) { // max 1 retry for transient 502 blips
      try {
        completion = await this.getClient(config.apiKey).chat.completions.create({
          stream: false,
          model,
          messages: [
            { role: "system", content: config.systemPrompt ?? SYSTEM_PROMPT },
            {
              role: "user",
              content: `Generate test cases for the following requirement:\n\n${input}`,
            },
          ],
        });
        break;
      } catch (error) {
        if (isRateLimitError(error)) {
          throw new HttpException("Too Many Requests", HttpStatus.TOO_MANY_REQUESTS);
        }
        if (!this.shouldRetry(error) || attempt === 2) throw error;
        console.log("OpenRouter retry attempt:", attempt);
        await this.delay(1000);
      }
    }

    if (!completion || !("choices" in completion)) {
      throw new InternalServerErrorException("Invalid OpenRouter response");
    }

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new InternalServerErrorException("No response from OpenRouter");
    }

    // OpenRouter free models don't always support response_format: json_object,
    // so we extract JSON manually from the text.
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

    try {
      const parsed = JSON.parse(candidate);

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
      throw new InternalServerErrorException("Failed to parse OpenRouter response as JSON");
    }
  }
}
