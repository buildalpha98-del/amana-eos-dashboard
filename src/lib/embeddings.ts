/**
 * Voyage AI embeddings for the Amana AI knowledge store.
 *
 * Deliberately a raw fetch — one endpoint, one model, no SDK to keep
 * in step. `embedTexts` NEVER throws: an outage returns null and the
 * caller falls back to tsvector-only search (spec §3.4 step 1) or
 * leaves `embedding` null for later re-index.
 *
 * Model: voyage-3 (1024-dim) — the column is vector(1024); changing the
 * model means a migration + full re-embed.
 */
import { logger } from "@/lib/logger";

export const EMBEDDING_MODEL = "voyage-3";
export const EMBEDDING_DIMENSIONS = 1024;
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 128;

export function isEmbeddingsConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

export interface EmbedOptions {
  /** "document" when indexing, "query" when searching (Voyage asymmetric hint). */
  inputType?: "document" | "query";
  retries?: number;
  retryDelayMs?: number;
}

export interface EmbedUsage {
  totalTokens: number;
}

let lastUsage: EmbedUsage = { totalTokens: 0 };
/** Tokens consumed by the most recent embedTexts() call — for AiUsage logging. */
export function getLastEmbedUsage(): EmbedUsage {
  return lastUsage;
}

export async function embedTexts(
  texts: string[],
  opts: EmbedOptions = {},
): Promise<number[][] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return null;
  if (texts.length === 0) return [];
  const retries = opts.retries ?? 2;
  const delay = opts.retryDelayMs ?? 500;
  const out: number[][] = [];
  let tokens = 0;

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    let attempt = 0;
    for (;;) {
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: batch,
            input_type: opts.inputType ?? "document",
          }),
        });
        if (!res.ok) throw new Error(`Voyage ${res.status}`);
        const json = (await res.json()) as {
          data: { index: number; embedding: number[] }[];
          usage?: { total_tokens?: number };
        };
        const ordered = [...json.data].sort((a, b) => a.index - b.index);
        for (const d of ordered) out.push(d.embedding);
        tokens += json.usage?.total_tokens ?? 0;
        break;
      } catch (err) {
        attempt++;
        if (attempt > retries) {
          logger.error("Embeddings: batch failed after retries", {
            batchStart: start,
            err: err instanceof Error ? err.message : String(err),
          });
          lastUsage = { totalTokens: tokens };
          return null;
        }
        await new Promise((r) => setTimeout(r, delay * attempt));
      }
    }
  }
  lastUsage = { totalTokens: tokens };
  return out;
}

/** Postgres vector literal: "[0.1,0.2,…]" — used with `$1::vector`. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
