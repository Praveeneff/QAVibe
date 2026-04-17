// NOTE: Free tier quota is per-API-key-per-day (not per model).
// Fallback chain only helps with per-model rate limits (429 per minute),
// not daily quota exhaustion. For daily limits, users must provide their own key.
import { Inject, Injectable, HttpException, HttpStatus } from "@nestjs/common";
import type { AIProvider } from "./providers/interface";
import { ClaudeService } from "./providers/claude.service";
import { OpenAiService } from "./providers/openai.service";
import { GeminiService, isGeminiRateLimitError } from "./providers/gemini.service";
import { OpenRouterService } from "./providers/openrouter.service";
import { GroqService } from "./providers/groq.service";
import { AiGenerationContext, buildSystemPrompt } from "./ai-generation.context";
import { PrismaService } from "../prisma/prisma.service";

export const AI_PROVIDER_TOKEN = "AI_PROVIDER_TOKEN";

// ── Module-level provider health map ────────────────────────────────────────
// Survives request lifecycle; resets on server restart (intentional).
const providerFailedAt = new Map<string, number>();
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const CALL_TIMEOUT_MS = 60_000; // 60 seconds per provider call

function isProviderOnCooldown(key: string): boolean {
  const failedAt = providerFailedAt.get(key);
  return !!failedAt && Date.now() - failedAt < PROVIDER_COOLDOWN_MS;
}

// Classify an error as one that should skip immediately to the next provider.
// Only 502 / brief blips should be retried (handled inside each provider service).
function classifyError(error: unknown): { skip: boolean; reason: string } {
  if (error instanceof HttpException) {
    const s = error.getStatus();
    if (s === 401) return { skip: true, reason: "401 Unauthorized (invalid or missing API key)" };
    if (s === 404) return { skip: true, reason: "404 Not Found (model not found or deprecated)" };
    if (s === 429) return { skip: true, reason: "429 Too Many Requests" };
    if (s === 500) return { skip: true, reason: "500 Internal Server Error" };
    if (s === 503) return { skip: true, reason: "503 Service Unavailable" };
  }
  if (isGeminiRateLimitError(error)) {
    return { skip: true, reason: "429 Too Many Requests (Gemini quota/RESOURCE_EXHAUSTED)" };
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === "PROVIDER_TIMEOUT") return { skip: true, reason: "network timeout (>10s)" };
  if (
    msg.includes("429") ||
    msg.includes("Too Many Requests") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("quota")
  ) {
    return { skip: true, reason: "429 Too Many Requests" };
  }
  if (msg.includes("503") || msg.includes("Service Unavailable")) {
    return { skip: true, reason: "503 Service Unavailable" };
  }
  if (msg.includes("500") || msg.includes("Internal server error")) {
    return { skip: true, reason: "500 Internal Server Error" };
  }
  return { skip: false, reason: "" };
}

function callWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), ms),
    ),
  ]);
}

interface GenerateOpts {
  provider?: string;
  model?: string;
  apiKey?: string;
}

interface FallbackStep {
  label: string;
  svc: AIProvider;
  model?: string;
  apiKey?: string;
}

@Injectable()
export class AiService {
  private readonly registry: Record<string, AIProvider>;

  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly defaultProvider: AIProvider,
    claude: ClaudeService,
    openai: OpenAiService,
    private readonly gemini: GeminiService,
    private readonly openrouter: OpenRouterService,
    private readonly groq: GroqService,
    private readonly generationContext: AiGenerationContext,
    private readonly prisma: PrismaService,
  ) {
    this.registry = { claude, openai, gemini, openrouter, groq };
  }

  // ── Public entry points ──────────────────────────────────────────────────

  async generateTestCases(input: string, opts?: GenerateOpts, userId?: string): Promise<{ cases: any[]; suggestedSuite?: string }> {
    const { provider, model, apiKey } = opts ?? {};

    const primaryModel = model ?? ((!provider || provider === "gemini") ? "gemini-2.5-flash" : undefined);
    const primarySvc = (provider && this.registry[provider]) ?? this.gemini;

    // Build context-aware system prompt once — used by every step in the chain.
    const ctx = await this.generationContext.buildGenerationContext();
    const systemPrompt = buildSystemPrompt(ctx);
    console.log(`[AI] Context: ${ctx.totalCases} total cases, ${ctx.recentTitles.length} recent titles loaded`);

    // When the user supplies their own API key, trust their choice completely —
    // skip the fallback chain. The key is theirs; we should not silently switch
    // providers or models under them.
    if (apiKey) {
      console.log(`[AI] User-supplied key — using ${provider ?? "gemini"}/${primaryModel ?? "default"} directly`);
      const { cases, suggestedSuite } = await primarySvc.generateTestCases(input, { model: primaryModel, apiKey, systemPrompt });
      return { cases, suggestedSuite };
    }

    // ── Build fallback chain (env key only) ────────────────────────────────
    //
    // Order:
    //   0. Groq / llama-3.3-70b-versatile  — primary, free, fast (if GROQ_API_KEY set)
    //   1. Primary provider (user-requested or default gemini-2.5-flash)
    //   2. gemini-2.0-flash        — separate quota bucket
    //   3. gemini-2.0-flash-lite   — lightest, highest rate limits
    //   4-7. OpenRouter free-tier models (if OPENROUTER key set)
    //   8. OpenRouter google/gemini-2.0-flash-exp:free — Gemini on different infra (if key set)

    const hasGroqKey = !!process.env.GROQ_API_KEY;
    const hasOpenRouterKey = !!(process.env.AI_OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY);

    // Startup log — shows which providers are active this run
    const activeProviders = [
      hasGroqKey ? "Groq" : null,
      "Gemini",
      hasOpenRouterKey ? "OpenRouter" : null,
    ].filter(Boolean).join(", ");
    console.log(`[AI] Active providers: ${activeProviders}`);

    const chain: FallbackStep[] = [];

    // Groq first — free, very fast, high rate limits on free tier
    if (hasGroqKey) {
      chain.push({
        label: "groq/llama-3.3-70b-versatile (primary — free, fast)",
        svc: this.groq,
        model: "llama-3.3-70b-versatile",
        apiKey: undefined,
      });
    }

    // User-requested provider (or default gemini-2.5-flash)
    chain.push({ label: `${provider ?? "gemini"}/${primaryModel ?? "default"} (${hasGroqKey ? "fallback 1" : "primary"})`, svc: primarySvc, model: primaryModel, apiKey: undefined });

    // DEPRECATED (404 on v1beta API — do not add back):
    //   gemini-1.5-flash, gemini-1.5-pro, gemini-1.0-pro
    const geminiModels: Array<{ model: string; label: string }> = [
      { model: "gemini-2.0-flash",      label: "gemini/gemini-2.0-flash (separate quota bucket)" },
      { model: "gemini-2.0-flash-lite", label: "gemini/gemini-2.0-flash-lite (lightest, highest rate limits)" },
    ];

    for (const { model: m, label } of geminiModels) {
      if (primarySvc === this.gemini && primaryModel === m) continue;
      chain.push({ label, svc: this.gemini, model: m, apiKey: undefined });
    }

    // OpenRouter steps — only added when a key is available so we don't waste
    // a chain slot on a call that will immediately throw a missing-key error.
    if (hasOpenRouterKey) {
      const openRouterFreeTierModels = [
        "meta-llama/llama-3.2-3b-instruct:free",
        "google/gemma-3-1b-it:free",
      ];

      const modelsToAdd =
        primarySvc === this.openrouter
          ? openRouterFreeTierModels.filter((m) => m !== primaryModel)
          : openRouterFreeTierModels;

      modelsToAdd.forEach((m, idx) => {
        const fallbackNum = primarySvc !== this.openrouter ? 3 + idx : 1 + idx;
        chain.push({
          label: `openrouter/${m} (fallback ${fallbackNum}, free tier)`,
          svc: this.openrouter,
          model: m,
          apiKey: undefined,
        });
      });

      // Gemini Flash 1.5 via OpenRouter — same model, different infrastructure,
      // gives a second path to Gemini when the direct API is overloaded.
      chain.push({
        label: "openrouter/google/gemini-2.0-flash-exp:free (Gemini via OpenRouter, final fallback)",
        svc: this.openrouter,
        model: "google/gemini-2.0-flash-exp:free",
        apiKey: undefined,
      });
    }

    console.log(`[AI] Fallback chain (${chain.length} steps):`, chain.map((s) => s.label));

    let lastSkippedLabel = "";

    for (const step of chain) {
      // ── Health check — skip providers that recently failed ───────────────
      if (isProviderOnCooldown(step.label)) {
        console.warn(`[AI] Skipping ${step.label} — on cooldown (failed within last 5 minutes)`);
        continue;
      }

      console.log(`[AI] Trying ${step.label}…`);
      const t0 = Date.now();
      try {
        const { cases, tokens, suggestedSuite } = await callWithTimeout(
          () => step.svc.generateTestCases(input, { model: step.model, apiKey: step.apiKey, systemPrompt }),
          CALL_TIMEOUT_MS,
        );
        const latencyMs = Date.now() - t0;
        console.log(`[AI] Success with ${step.label} in ${latencyMs}ms — ${cases.length} cases, ${tokens ?? "?"} tokens`);

        // Clear health-map entry on success
        providerFailedAt.delete(step.label);

        // Fire-and-forget log — don't let a DB write failure break the response
        this.prisma.aiGenerationLog.create({
          data: {
            provider: step.label,
            latencyMs,
            caseCount: cases.length,
            promptTokens: tokens ?? null,
            fallbackFrom: lastSkippedLabel || null,
            userId: userId ?? null,
          },
        }).catch((err) => console.error("[AI] Failed to write generation log:", err));

        if (userId && tokens) {
          this.prisma.user.update({
            where: { id: userId },
            data: { tokenUsed: { increment: tokens } },
          }).catch(() => {});
        }

        return { cases, suggestedSuite };
      } catch (error) {
        const { skip, reason } = classifyError(error);
        if (skip) {
          lastSkippedLabel = step.label;
          console.warn(`[AI] Skipping ${step.label} — ${reason} — moving to next provider`);
          providerFailedAt.set(step.label, Date.now());
          continue;
        }
        // Non-skippable error: fail immediately — don't silently swallow unexpected errors
        console.error(`[AI] Non-skippable failure on ${step.label}:`, error);
        throw error;
      }
    }

    // All steps exhausted
    console.error(`[AI] All providers exhausted. Last skipped: ${lastSkippedLabel}`);
    throw new HttpException(
      {
        message: "All AI providers are currently unavailable. Please try again in a few minutes.",
        retryAfter: 300,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  // Used by BrdController to supply a pre-built system prompt (BRD-specific)
  // instead of building the generic one. Runs the same fallback chain.
  async generateTestCasesWithPrompt(
    userMessage: string,
    systemPrompt: string,
    userId?: string,
  ): Promise<{ cases: any[]; tokens?: number }> {
    const chain = this.buildChain();

    let lastSkippedLabel = "";

    for (const step of chain) {
      if (isProviderOnCooldown(step.label)) {
        console.warn(`[AI] Skipping ${step.label} — on cooldown`);
        continue;
      }

      console.log(`[AI] Trying ${step.label}…`);
      const t0 = Date.now();
      try {
        const result = await callWithTimeout(
          () => step.svc.generateTestCases(userMessage, { model: step.model, apiKey: step.apiKey, systemPrompt }),
          CALL_TIMEOUT_MS,
        );
        const latencyMs = Date.now() - t0;
        providerFailedAt.delete(step.label);

        this.prisma.aiGenerationLog.create({
          data: {
            provider: step.label,
            latencyMs,
            caseCount: result.cases.length,
            promptTokens: result.tokens ?? null,
            fallbackFrom: lastSkippedLabel || null,
            userId: userId ?? null,
          },
        }).catch((err) => console.error("[AI] Failed to write generation log:", err));

        if (userId && result.tokens) {
          this.prisma.user.update({
            where: { id: userId },
            data: { tokenUsed: { increment: result.tokens } },
          }).catch(() => {});
        }

        return result;
      } catch (error) {
        const { skip, reason } = classifyError(error);
        if (skip) {
          lastSkippedLabel = step.label;
          console.warn(`[AI] Skipping ${step.label} — ${reason} — moving to next provider`);
          providerFailedAt.set(step.label, Date.now());
          continue;
        }
        console.error(`[AI] Non-skippable failure on ${step.label}:`, error);
        throw error;
      }
    }

    console.error(`[AI] All providers exhausted. Last skipped: ${lastSkippedLabel}`);
    throw new HttpException(
      {
        message: "All AI providers are currently unavailable. Please try again in a few minutes.",
        retryAfter: 300,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  // ── Private: build the fallback chain (no context/prompt building) ────────
  private buildChain(): FallbackStep[] {
    const hasGroqKey       = !!process.env.GROQ_API_KEY;
    const hasOpenRouterKey = !!(process.env.AI_OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY);

    const chain: FallbackStep[] = [];

    if (hasGroqKey) {
      chain.push({
        label: "groq/llama-3.3-70b-versatile (primary — free, fast)",
        svc: this.groq,
        model: "llama-3.3-70b-versatile",
        apiKey: undefined,
      });
    }

    chain.push(
      { label: "gemini/gemini-2.5-flash", svc: this.gemini, model: "gemini-2.5-flash", apiKey: undefined },
      { label: "gemini/gemini-2.0-flash (separate quota bucket)", svc: this.gemini, model: "gemini-2.0-flash", apiKey: undefined },
      { label: "gemini/gemini-2.0-flash-lite (lightest, highest rate limits)", svc: this.gemini, model: "gemini-2.0-flash-lite", apiKey: undefined },
    );

    if (hasOpenRouterKey) {
      chain.push({
        label: "openrouter/google/gemini-2.0-flash-exp:free (Gemini via OpenRouter, final fallback)",
        svc: this.openrouter,
        model: "google/gemini-2.0-flash-exp:free",
        apiKey: undefined,
      });
    }

    return chain;
  }
}
