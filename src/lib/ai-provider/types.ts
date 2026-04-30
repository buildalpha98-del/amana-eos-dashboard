/**
 * Hybrid AI provider abstraction (Anthropic + Groq).
 *
 * Why a second abstraction next to lib/ai.ts?
 * - lib/ai.ts is the existing single-provider Anthropic wrapper used by 30+
 *   call sites (task agent, daily digest, narratives). Touching it has a
 *   blast radius we don't want to take on for one Sprint 3.5 feature.
 * - This abstraction is the new path for high-stakes structured-output calls
 *   (parent avatar generation today; future call sites that need JSON).
 *
 * Decision policy at call sites:
 * - Use Anthropic Sonnet/Haiku for showcase / external-facing copy where
 *   prose quality compounds (parent avatar, individual reports).
 * - Use Groq + Llama-3.3-70B for high-volume, lower-stakes structured
 *   drafts where 5-10x lower cost matters (future Task Agent migration).
 */

export type Provider = "anthropic" | "groq";

export interface ProviderModel {
  provider: Provider;
  modelId: string;
}

export interface GenerateStructuredOptions<T> {
  /** System prompt — sets persona, constraints, output shape. */
  system: string;
  /** User prompt — the actual request. */
  prompt: string;
  /**
   * Zod-style schema with `.safeParse(unknown)` returning
   * `{ success: true, data: T } | { success: false, error: ... }`.
   * Output JSON is validated against this; on failure we retry once.
   */
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } };
  /** Provider + model id. Defaults: anthropic + claude-sonnet-4-5. */
  providerModel?: ProviderModel;
  /** Cap on output tokens. Defaults to 2048. */
  maxTokens?: number;
  /** Sampling temperature. Defaults to 0.4 (low for structured output). */
  temperature?: number;
}

export interface GenerateStructuredResult<T> {
  data: T;
  provider: Provider;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Approximate USD cost per 1k input + 1k output tokens. */
export const COST_PER_1K: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-sonnet-4-5-20250514": { input: 0.003, output: 0.015 },
  "claude-haiku-4-5-20251001": { input: 0.0008, output: 0.004 },
  "claude-haiku-3-5-20241022": { input: 0.0008, output: 0.004 },
  // Groq (open-source models served on Groq's fast inference hardware)
  "llama-3.3-70b-versatile": { input: 0.00059, output: 0.00079 },
  "deepseek-r1-distill-llama-70b": { input: 0.00075, output: 0.00099 },
  "kimi-k2-instruct": { input: 0.001, output: 0.003 },
};

export const DEFAULT_PROVIDER_MODEL: Record<string, ProviderModel> = {
  // Showcase copy (parent avatar, reports) → Sonnet 4.5
  showcase: { provider: "anthropic", modelId: "claude-sonnet-4-5-20250514" },
  // Bulk drafts (future Task Agent) → Llama 3.3 on Groq
  bulk: { provider: "groq", modelId: "llama-3.3-70b-versatile" },
};

export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = COST_PER_1K[modelId];
  if (!rates) return 0;
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}
