"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "@/hooks/useToast";

export interface AiGenerateOptions {
  templateSlug: string;
  variables?: Record<string, string>;
  stream?: boolean;
  model?: string;
  section?: string;
  metadata?: Record<string, unknown>;
  /**
   * Hard timeout for the request. If the model hasn't finished in this window,
   * the hook aborts and treats it as a transient failure (eligible for retry).
   * Default: 30_000ms.
   */
  timeoutMs?: number;
  /**
   * Max retry attempts for transient failures (network error, 5xx, timeout).
   * Non-transient failures (4xx, user cancel) are not retried.
   * Default: 2 — so the hook makes up to 3 attempts total.
   */
  maxRetries?: number;
  /**
   * Called when the response parses but doesn't match the shape the caller
   * expected (e.g. missing fields). Pass a validator via the caller — this
   * hook just invokes it with the raw text.
   *
   * When set and the validator returns false, the hook returns null and surfaces
   * a malformed-output toast instead of silently returning garbled text.
   */
  onMalformed?: (text: string) => boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

export interface AiUsageInfo {
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
  model?: string;
}

/** Transient-error detection — retried automatically up to maxRetries. */
function isTransient(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === "AbortError") return false;
    if (err.name === "TimeoutError") return true;
    if (err.message.startsWith("HTTP 5")) return true;
    if (err.message.includes("NetworkError")) return true;
    if (err.message.toLowerCase().includes("failed to fetch")) return true;
  }
  return false;
}

export function useAiGenerate() {
  const [result, setResult] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AiUsageInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (options: AiGenerateOptions): Promise<string | null> => {
    setResult(null);
    setStreamedText("");
    setError(null);
    setUsage(null);
    setIsLoading(true);

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    let attempt = 0;
    let lastErr: unknown = null;

    try {
      while (attempt <= maxRetries) {
        const controller = new AbortController();
        abortRef.current = controller;
        const timer = setTimeout(() => {
          const e = new Error("AI generation timed out");
          e.name = "TimeoutError";
          controller.abort(e);
        }, timeoutMs);

        try {
          const res = await fetch("/api/ai/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options),
            signal: controller.signal,
          });

          if (!res.ok) {
            let body: { error?: string } = {};
            try {
              body = await res.json();
            } catch {
              // non-JSON error body — carry on with status code
            }
            throw new Error(body.error || `HTTP ${res.status}`);
          }

          // ── Non-streaming ────────────────────────────────────
          if (!options.stream) {
            const data = await res.json();
            const text: string = data.text;

            if (options.onMalformed && !options.onMalformed(text)) {
              const msg = "AI returned malformed output";
              setError(msg);
              toast({ description: msg, variant: "destructive" });
              return null;
            }

            setResult(text);
            setUsage(data.usage);
            return text;
          }

          // ── Streaming ────────────────────────────────────────
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response stream");

          const decoder = new TextDecoder();
          let buffer = "";
          let accumulated = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();

              if (data === "[DONE]") break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.error) throw new Error(parsed.error);

                if (parsed.text) {
                  accumulated += parsed.text;
                  setStreamedText(accumulated);
                }

                // Usage info sent as final event before [DONE]
                if (parsed.inputTokens != null) {
                  setUsage({
                    inputTokens: parsed.inputTokens,
                    outputTokens: parsed.outputTokens,
                  });
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }

          if (options.onMalformed && !options.onMalformed(accumulated)) {
            const msg = "AI returned malformed output";
            setError(msg);
            toast({ description: msg, variant: "destructive" });
            return null;
          }

          setResult(accumulated);
          return accumulated;
        } catch (err: unknown) {
          clearTimeout(timer);
          // User cancel — bail immediately, no retry.
          if (err instanceof Error && err.name === "AbortError") {
            // AbortError from our timeout has a `TimeoutError`-named cause.
            const cause = (err as Error & { cause?: unknown }).cause;
            if (cause instanceof Error && cause.name === "TimeoutError") {
              lastErr = cause;
            } else {
              return null;
            }
          } else {
            lastErr = err;
          }

          if (!isTransient(lastErr) || attempt === maxRetries) {
            throw lastErr;
          }
          attempt++;
          // Exponential backoff: 500ms, 1000ms, 2000ms, …
          await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        } finally {
          clearTimeout(timer);
        }
      }
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      setError(msg);
      toast({ description: msg, variant: "destructive" });
      return null;
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { generate, result, streamedText, isLoading, error, usage, cancel };
}
