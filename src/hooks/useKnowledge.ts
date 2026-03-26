"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

// ─── Types ────────────────────────────────────────────────

export interface KnowledgeStatus {
  totalDocuments: number;
  indexedDocuments: number;
  totalChunks: number;
  lastIndexedAt: string | null;
  errors: Array<{ id: string; title: string; indexError: string | null }>;
}

export interface KnowledgeSource {
  documentId: string;
  documentTitle: string;
  documentCategory: string | null;
  fileName: string | null;
}

export interface KnowledgeMessage {
  role: "user" | "assistant";
  content: string;
  sources?: KnowledgeSource[];
}

// ─── useKnowledgeStatus ───────────────────────────────────

export function useKnowledgeStatus() {
  return useQuery<KnowledgeStatus>({
    queryKey: ["knowledge-status"],
    queryFn: () => fetchApi<KnowledgeStatus>("/api/knowledge/status"),
    retry: 2,
    staleTime: 60_000,
  });
}

// ─── useKnowledgeAsk ──────────────────────────────────────

export function useKnowledgeAsk() {
  const [messages, setMessages] = useState<KnowledgeMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || isStreaming) return;

      const userMsg: KnowledgeMessage = { role: "user", content: question.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/knowledge/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: question.trim() }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Knowledge request failed");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();

            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);

              if (parsed.error) {
                throw new Error(parsed.error);
              }

              // Text delta — accumulate into the assistant message
              if (parsed.text) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + parsed.text,
                    };
                  }
                  return updated;
                });
              }

              // Sources — attach to the assistant message
              if (parsed.sources) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      sources: parsed.sources,
                    };
                  }
                  return updated;
                });
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue; // partial JSON
              throw e;
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled — no error toast
        } else {
          const msg = err instanceof Error ? err.message : "Knowledge request failed";
          toast({ description: msg, variant: "destructive" });
          // Remove the empty assistant message on error
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && !last.content) {
              return prev.slice(0, -1);
            }
            return prev;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming],
  );

  const clearMessages = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { messages, ask, isStreaming, stopStreaming, clearMessages };
}
