"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Bot, Send, Loader2, Trash2, Square } from "lucide-react";
import { useAssistant, type ChatMessage } from "@/hooks/useAssistant";

const SUGGESTED_PROMPTS = [
  "How are my centres performing financially this month?",
  "Summarize our compliance status",
  "Which rocks are off track this quarter?",
  "What does our sales pipeline look like?",
];

function MessageBubble({ message }: { message: ChatMessage }) {
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
        {!isUser && !message.content && (
          <span className="inline-flex items-center gap-1 text-muted">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        )}
        {message.content && (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const pathname = usePathname();
  const { messages, sendMessage, isStreaming, clearMessages, stopStreaming } = useAssistant(pathname);
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
    sendMessage(msg);
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
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#004E6415", color: "#004E64" }}
          >
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">AI Assistant</h2>
            <p className="text-sm text-muted">Ask questions about your dashboard data</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: "#004E6410", color: "#004E64" }}
            >
              <Bot className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              How can I help you today?
            </h3>
            <p className="text-sm text-muted mb-6 max-w-md">
              I have access to your live dashboard data including financials, operations,
              compliance, pipeline, staffing, and quarterly rocks.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSubmit(prompt)}
                  className="text-left px-4 py-3 rounded-xl border border-border bg-card hover:bg-surface hover:border-border text-sm text-foreground/80 transition-colors"
                >
                  {prompt}
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

      {/* Input bar */}
      <div className="border-t border-border pt-4 pb-2">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your dashboard data..."
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
          AI responses are based on your live dashboard data. Always verify critical decisions.
        </p>
      </div>
    </div>
  );
}
