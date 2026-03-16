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
}

export interface AiUsageInfo {
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
  model?: string;
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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "AI generation failed");
      }

      // ── Non-streaming ────────────────────────────────────
      if (!options.stream) {
        const data = await res.json();
        setResult(data.text);
        setUsage(data.usage);
        return data.text;
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

      setResult(accumulated);
      return accumulated;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }
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
