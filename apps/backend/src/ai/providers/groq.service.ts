import { Injectable, InternalServerErrorException, HttpException, HttpStatus } from "@nestjs/common";
import Groq from "groq-sdk";
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

// Models tried in priority order within a single generateTestCases call.
// llama-3.3-70b-versatile is the best quality; the others are fallbacks if
// the primary model itself is unavailable on Groq's end.
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama3-70b-8192",
] as const;

function isSkippableError(error: unknown): boolean {
  const status = (error as any)?.status;
  const message = error instanceof Error ? error.message : String(error);
  return (
    status === 401 ||
    status === 429 ||
    status === 500 ||
    status === 503 ||
    (error instanceof HttpException && [401, 429, 500, 503].includes(error.getStatus())) ||
    message.includes("401") ||
    message.includes("Invalid API Key") ||
    message.includes("invalid_api_key") ||
    message.includes("429") ||
    message.includes("Too Many Requests") ||
    message.includes("rate_limit_exceeded") ||
    message.includes("quota")
  );
}

@Injectable()
export class GroqService implements AIProvider {
  private client?: Groq;

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetry(error: unknown): boolean {
    if (isSkippableError(error)) return false; // bubble immediately to fallback chain
    if (error instanceof HttpException) return error.getStatus() === 502;
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("502") || message.includes("Bad Gateway");
  }

  private getClient(): Groq {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY not configured");
    if (!this.client) this.client = new Groq({ apiKey: key });
    return this.client;
  }

  private extractJson(text: string): { cases: any[]; suggestedSuite?: string } {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

    const parsed = JSON.parse(candidate);

    // Handle new { suggestedSuite, cases } format
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const cases = parsed.cases ?? parsed.test_cases ?? parsed.testCases ?? Object.values(parsed).find(Array.isArray);
      if (Array.isArray(cases)) {
        return { cases, suggestedSuite: parsed.suggestedSuite };
      }
    }

    // Handle legacy plain array format
    if (!Array.isArray(parsed)) throw new Error("Response is not an array");
    return { cases: parsed };
  }

  async generateTestCases(input: string, config: AIProviderConfig = {}): Promise<AIProviderResult> {
    const client = this.getClient(); // throws if key missing

    // Try each model in priority order; move to the next only on model-level errors.
    // 429/503/500 on any model bubbles out immediately so the chain can skip the
    // entire Groq provider without wasting time on the remaining models.
    for (const model of GROQ_MODELS) {
      console.log(`[GroqService] Trying model ${model}`);

      for (let attempt = 1; attempt <= 2; attempt++) { // max 1 retry for transient 502 blips
        try {
          const completion = await client.chat.completions.create({
            model,
            messages: [
              { role: "system", content: config.systemPrompt ?? SYSTEM_PROMPT },
              {
                role: "user",
                content: `Generate test cases for the following requirement:\n\n${input}`,
              },
            ],
          });

          const text = completion.choices[0]?.message?.content;
          if (!text) throw new InternalServerErrorException(`Groq/${model} returned empty content`);

          try {
            const { cases, suggestedSuite } = this.extractJson(text);
            return { cases, tokens: completion.usage?.total_tokens ?? undefined, suggestedSuite };
          } catch {
            throw new InternalServerErrorException(`Groq/${model} returned invalid JSON`);
          }
        } catch (error) {
          // 429/503/500: throw immediately so classifyError() in ai.service.ts
          // skips the entire Groq provider (all remaining models) and moves on.
          if (isSkippableError(error)) {
            const status =
              error instanceof HttpException
                ? error.getStatus()
                : ((error as any)?.status ?? 429);
            console.warn(`[GroqService] ${model} returned ${status} — escalating to chain`);
            throw new HttpException(
              (error instanceof HttpException ? error.message : String(status)),
              status,
            );
          }

          if (!this.shouldRetry(error) || attempt === 2) {
            // Non-retryable or exhausted retries for this model — try next model
            console.warn(`[GroqService] ${model} failed (attempt ${attempt}), trying next model`);
            break;
          }

          console.log(`[GroqService] ${model} retry attempt ${attempt}`);
          await this.delay(1000);
        }
      }
    }

    throw new InternalServerErrorException("All Groq models failed");
  }
}
