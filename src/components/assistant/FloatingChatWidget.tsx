"use client";

/**
 * FloatingChatWidget — a bottom-right pill that opens the AI assistant
 * from anywhere in the dashboard. Uses the same useAssistant hook +
 * /api/assistant/chat endpoint as the dedicated /assistant page; the
 * widget is just a more discoverable surface so staff don't have to
 * navigate to it.
 *
 * Visibility:
 *   - Hidden on /login + public routes (no session)
 *   - Hidden on /assistant itself (you're already there)
 *   - Hidden when the bot isn't configured (no ANTHROPIC_API_KEY)
 *     — surfaced via a 503 the first time the user opens the panel
 *
 * 2026-06-02.
 */

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bot, Send, X, Loader2, Square, Trash2, Maximize2 } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useAssistant, type ChatMessage } from "@/hooks/useAssistant";
import { useSidebar } from "@/components/layout/SidebarContext";
import { cn } from "@/lib/utils";

const HIDE_ON_PATHS = ["/assistant", "/login"];

export function FloatingChatWidget() {
  const pathname = usePathname();
  const { status } = useSession();
  const { collapsed } = useSidebar();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages } =
    useAssistant(pathname);

  // Auto-scroll to the bottom whenever messages change.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Hide on auth-less pages + the dedicated /assistant surface.
  if (status !== "authenticated") return null;
  if (HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput("");
  }

  return (
    <>
      {/* Trigger button — anchored bottom-LEFT but offset past the
          fixed sidebar so it isn't hidden behind it. Sidebar is
          w-64 expanded / w-16 collapsed on desktop, hidden on
          mobile — match each so the pill stays visible on every
          page. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className={cn(
            "fixed bottom-4 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-brand text-white shadow-lg hover:bg-brand/90 transition-colors",
            // Mobile: sidebar hidden → flush left
            "left-4",
            // Desktop: clear of the sidebar
            collapsed ? "md:left-20" : "md:left-72",
          )}
        >
          <Bot className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:inline">
            Ask Amana AI
          </span>
        </button>
      )}

      {/* Panel — bottom-LEFT corner, full-screen on mobile, offset
          past the sidebar on desktop. */}
      {open && (
        <div
          className={cn(
            "fixed z-50 bg-card border border-border shadow-2xl flex flex-col",
            // Mobile: full-screen sheet
            "inset-0 sm:inset-auto",
            // Desktop: bottom-left anchored panel, offset past sidebar
            "sm:bottom-4 sm:w-[420px] sm:h-[600px] sm:max-h-[80vh] sm:rounded-xl",
            collapsed ? "sm:left-20" : "sm:left-72",
          )}
          role="dialog"
          aria-label="AI assistant"
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-2 p-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  Amana AI
                </p>
                <p className="text-xs text-muted truncate">
                  Ask about policies, procedures, or how to do something
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearMessages}
                  className="p-1.5 rounded-md hover:bg-surface text-muted"
                  aria-label="Clear conversation"
                  title="Clear conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <Link
                href="/assistant"
                className="p-1.5 rounded-md hover:bg-surface text-muted"
                aria-label="Open full assistant"
                title="Open in full view"
              >
                <Maximize2 className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md hover:bg-surface text-muted"
                aria-label="Close assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Message list */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-3"
          >
            {messages.length === 0 ? (
              <EmptyState onPick={(q) => sendMessage(q)} disabled={isStreaming} />
            ) : (
              messages.map((m, idx) => <Bubble key={idx} message={m} />)
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-border p-2 shrink-0 flex items-center gap-2"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={isStreaming}
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                aria-label="Stop"
                className="p-2 rounded-md bg-red-500 text-white hover:bg-red-600"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send"
                className="p-2 rounded-md bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-brand text-white rounded-br-md"
            : "bg-surface text-foreground rounded-bl-md"
        }`}
      >
        {!isUser && !message.content && (
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
        )}
        {message.content && (
          <div className="prose prose-sm max-w-none prose-p:my-2 prose-a:text-brand prose-a:underline prose-strong:text-foreground prose-headings:text-foreground prose-li:my-0.5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={{
                // Internal /documents/<id> links stay in the same tab
                // so they navigate the dashboard; external links open
                // in a new tab so the chat stays open.
                a: ({ href, children, ...rest }) => {
                  const internal = href?.startsWith("/") ?? false;
                  return (
                    <a
                      href={href}
                      target={internal ? undefined : "_blank"}
                      rel={internal ? undefined : "noopener noreferrer"}
                      {...rest}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  const suggestions = [
    "How do I report an incident?",
    "What's our policy on…",
    "Where do I find the Amana Way?",
    "How do I request leave?",
  ];
  return (
    <div className="flex flex-col items-center justify-center text-center pt-8 gap-3">
      <div className="w-12 h-12 rounded-full bg-brand/10 text-brand flex items-center justify-center">
        <Bot className="w-6 h-6" />
      </div>
      <p className="text-sm font-medium text-foreground">
        How can I help?
      </p>
      <p className="text-xs text-muted max-w-xs">
        I can answer questions about our policies, procedures, and the
        Amana Way. Try one of these:
      </p>
      <div className="flex flex-col items-stretch gap-1.5 w-full mt-1">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            disabled={disabled}
            className="text-left text-xs px-3 py-2 rounded-md border border-border hover:bg-surface disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
