"use client";

import { useState, useRef, useEffect } from "react";
import { BookOpen, Send, Square, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  useKnowledgeStatus,
  useKnowledgeAsk,
  type KnowledgeMessage,
  type KnowledgeSource,
} from "@/hooks/useKnowledge";

// ─── Suggested questions ──────────────────────────────────

const SUGGESTED_QUESTIONS = [
  "What is our policy on medication administration?",
  "How do we handle incident reporting?",
  "What are the staff-to-child ratios?",
  "Summarise our sun safety procedures",
  "What training is required for new educators?",
  "How do we manage dietary requirements?",
];

// ─── Source citations ─────────────────────────────────────

function SourceCitations({ sources }: { sources: KnowledgeSource[] }) {
  // De-duplicate by documentId
  const unique = sources.filter(
    (s, i, arr) => arr.findIndex((x) => x.documentId === s.documentId) === i,
  );

  if (unique.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-medium text-muted">Sources</p>
      {unique.map((src) => (
        <div
          key={src.documentId}
          className="flex items-start gap-2 px-3 py-2 rounded-lg border-l-2 border-indigo-400 bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-500"
        >
          <ExternalLink className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {src.documentTitle}
            </p>
            {src.documentCategory && (
              <p className="text-[10px] text-muted">{src.documentCategory}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── No-sources warning ───────────────────────────────────

function NoSourcesWarning() {
  return (
    <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-500">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
      <p className="text-xs text-muted">
        No matching documents found. The answer may be based on general knowledge.
      </p>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-muted">
      <span
        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </span>
  );
}

// ─── Message bubble ───────────────────────────────────────

function MessageBubble({ message }: { message: KnowledgeMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-brand text-white rounded-br-md"
            : "bg-surface text-foreground rounded-bl-md"
        }`}
      >
        {!isUser && !message.content && <TypingIndicator />}
        {message.content && (
          <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {/* Source citations */}
        {!isUser && message.content && message.sources && message.sources.length > 0 && (
          <SourceCitations sources={message.sources} />
        )}
        {/* No-sources warning: assistant has content, sources array exists but is empty */}
        {!isUser && message.content && message.sources && message.sources.length === 0 && (
          <NoSourcesWarning />
        )}
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────

function StatusBadge() {
  const { data: status } = useKnowledgeStatus();

  if (!status) return null;

  const isReady = status.indexedDocuments > 0;
  const label = isReady
    ? `${status.indexedDocuments} docs indexed`
    : "Indexing...";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        isReady
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isReady ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
        }`}
      />
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function KnowledgePage() {
  const { messages, ask, isStreaming, stopStreaming, clearMessages } =
    useKnowledgeAsk();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (text?: string) => {
    const msg = text ?? input;
    if (!msg.trim()) return;
    ask(msg);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <PageHeader
        title="Knowledge Base"
        description="Ask questions about your policies, procedures and documents"
        secondaryActions={
          messages.length > 0
            ? [
                {
                  label: "Clear",
                  icon: Trash2,
                  onClick: clearMessages,
                },
              ]
            : []
        }
      >
        <StatusBadge />
      </PageHeader>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4 min-h-0 px-4 sm:px-6">
        <div className="mx-auto max-w-[720px] w-full space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: "#004E6410", color: "#004E64" }}
              >
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Ask about your knowledge base
              </h3>
              <p className="text-sm text-muted mb-6 max-w-md">
                I can search your indexed policies, procedures and documents to find
                answers with source citations.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSubmit(q)}
                    className="text-left px-4 py-3 rounded-xl border border-border bg-card hover:bg-surface hover:border-border text-sm text-foreground/80 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <MessageBubble key={idx} message={msg} />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-border pt-4 pb-2 px-4 sm:px-6">
        <div className="mx-auto max-w-[720px] w-full">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about policies, procedures, or documents..."
                rows={1}
                disabled={isStreaming}
                className="w-full resize-none rounded-xl border border-border px-4 py-3 pr-12 text-sm text-foreground/80
                           focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/40
                           placeholder:text-muted disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                title="Stop generating"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim()}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand hover:bg-brand-dark text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted mt-1.5 text-center">
            Answers are based on your indexed documents. Always verify critical information against the source.
          </p>
        </div>
      </div>
    </div>
  );
}
