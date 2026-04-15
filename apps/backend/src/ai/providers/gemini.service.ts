import { Injectable, InternalServerErrorException, HttpException, HttpStatus } from "@nestjs/common";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

const FALLBACK_MODEL = "gemini-pro";

export function isGeminiRateLimitError(error: unknown): boolean {
  const status = (error as any)?.status;
  const message = error instanceof Error ? error.message : String(error);
  return (
    status === 429 ||
    (error instanceof HttpException && error.getStatus() === 429) ||
    message.includes("429") ||
    message.includes("Too Many Requests") ||
    message.includes("quota") ||
    message.includes("RESOURCE_EXHAUSTED")
  );
}

@Injectable()
export class GeminiService implements AIProvider {
  private client?: GoogleGenerativeAI;
  private resolvedModel?: string;

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetry(error: unknown): boolean {
    if (isGeminiRateLimitError(error)) return false; // let 429 bubble to fallback chain
    if (error instanceof HttpException) {
      // 429/503/500 → skip to next provider; only retry 502 (Bad Gateway, transient)
      return error.getStatus() === 502;
    }
    const message = error instanceof Error ? error.message : String(error);
    // Only retry genuine gateway blips — never retry 500/503 (they go to fallback chain)
    return message.includes("502") || message.includes("Bad Gateway");
  }

  private getClient(apiKey?: string): GoogleGenerativeAI {
    const key = apiKey ?? process.env.AI_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new InternalServerErrorException(
        "AI_GEMINI_API_KEY environment variable is missing",
      );
    }
    if (apiKey) return new GoogleGenerativeAI(key);
    if (!this.client) this.client = new GoogleGenerativeAI(key);
    return this.client;
  }

  private resolveApiKey(apiKey?: string): string {
    const key = apiKey ?? process.env.AI_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new InternalServerErrorException(
        "AI_GEMINI_API_KEY environment variable is missing",
      );
    }
    return key;
  }

  private async detectModel(apiKey?: string): Promise<string> {
    if (!apiKey && this.resolvedModel) {
      return this.resolvedModel;
    }

    try {
      const key = this.resolveApiKey(apiKey);
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`listModels HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };

      console.log(
        "Available Gemini models:",
        (data.models ?? []).map((m) => m.name),
      );

      const match = (data.models ?? []).find((m) =>
        m.supportedGenerationMethods?.includes("generateContent"),
      );

      if (!match) {
        throw new Error("No model with generateContent support found");
      }

      // Strip "models/" prefix returned by the API
      const resolved = match.name.replace(/^models\//, "");
      console.log("GeminiService resolved model:", resolved);
      if (!apiKey) this.resolvedModel = resolved;
      return resolved;
    } catch (err) {
      console.warn(
        "GeminiService model detection failed, falling back to",
        FALLBACK_MODEL,
        err,
      );
      if (!apiKey) this.resolvedModel = FALLBACK_MODEL;
      return FALLBACK_MODEL;
    }
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
      (c): c is string => Boolean(c),
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
      "Gemini returned invalid JSON for test cases",
    );
  }

  async generateTestCases(input: string, config: AIProviderConfig = {}): Promise<AIProviderResult> {
    try {
      const modelName = config.model ?? await this.detectModel(config.apiKey);
      console.log("GeminiService using model:", modelName);

      // Inline the system prompt so older models without systemInstruction work
      const sysPrompt = config.systemPrompt ?? SYSTEM_PROMPT;
      const prompt = `${sysPrompt}\n\nGenerate test cases for the following requirement:\n\n${input}`;

      const generativeModel = this.getClient(config.apiKey).getGenerativeModel({
        model: modelName,
      });

      let result;
      let lastError: unknown;

      for (let attempt = 1; attempt <= 2; attempt += 1) { // max 1 retry for transient 502 blips
        try {
          result = await generativeModel.generateContent(prompt);
          break;
        } catch (error) {
          lastError = error;

          if (!this.shouldRetry(error) || attempt === 2) {
            throw error;
          }

          console.log("Retry attempt:", attempt);
          await this.delay(1000);
        }
      }

      if (!result) {
        throw lastError;
      }

      const text = result.response.text().trim();

      if (!text) {
        throw new InternalServerErrorException("No text response from Gemini");
      }

      const tokens = result.response.usageMetadata?.totalTokenCount ?? undefined;
      const { cases, suggestedSuite } = this.parseResponse(text);
      return { cases, tokens, suggestedSuite };
    } catch (error) {
      console.error("GeminiService.generateTestCases failed", error);

      // Re-throw NestJS HTTP exceptions (including 429) as-is so the fallback chain can inspect them
      if (error instanceof HttpException) throw error;

      if (isGeminiRateLimitError(error)) {
        throw new HttpException("Too Many Requests", HttpStatus.TOO_MANY_REQUESTS);
      }

      throw new InternalServerErrorException(
        `Gemini request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
