"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  useConversationDetail,
  useSendReply,
  type ConversationMessage,
} from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export default function ThreadV1() {
  const { id } = useParams<{ id: string }>();
  const { data: conversation, isLoading } = useConversationDetail(id);
  const sendReply = useSendReply();

  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  const handleSend = () => {
    if (!replyText.trim()) return;
    sendReply.mutate(
      { conversationId: id, body: replyText.trim() },
      { onSuccess: () => setReplyText("") }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) return <ConversationSkeleton />;

  if (!conversation) {
    return (
      <div className="space-y-4">
        <Link
          href="/parent/messages"
          className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to messages
        </Link>
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <p className="text-[#7c7c8a] text-sm">Conversation not found.</p>
        </div>
      </div>
    );
  }

  const isResolved = conversation.status === "resolved" || conversation.status === "archived";

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 8rem)" }}>
      {/* Header */}
      <div className="space-y-2 mb-4">
        <Link
          href="/parent/messages"
          className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to messages
        </Link>
        <div>
          <h1 className="text-lg font-heading font-bold text-[#1a1a2e]">
            {conversation.subject}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            {conversation.service && (
              <span className="text-xs text-[#7c7c8a]">{conversation.service.name}</span>
            )}
            {isResolved && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="w-3 h-3" />
                Resolved
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 mb-4">
        {groupMessagesByDate(conversation.messages).map(({ dateLabel, messages }) => (
          <div key={dateLabel}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[#e8e4df]" />
              <span className="text-[10px] text-[#7c7c8a] font-medium uppercase">{dateLabel}</span>
              <div className="flex-1 h-px bg-[#e8e4df]" />
            </div>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply input */}
      {isResolved && (
        <div className="bg-[#F2EDE8] rounded-xl p-4 text-center mb-2">
          <p className="text-sm text-[#7c7c8a]">
            This conversation has been resolved. Send a reply to reopen it.
          </p>
        </div>
      )}

      <div className="sticky bottom-20 sm:bottom-4 bg-white rounded-xl border border-[#e8e4df] shadow-lg p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 px-3 py-2.5 border-0 bg-transparent text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none resize-none min-h-[44px] max-h-32"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={handleSend}
            disabled={!replyText.trim() || sendReply.isPending}
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-[#004E64] hover:bg-[#003D52] text-white transition-all disabled:opacity-50 active:scale-[0.95]"
          >
            {sendReply.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────

function MessageBubble({ message: msg }: { message: ConversationMessage }) {
  const isParent = msg.senderType === "parent";

  return (
    <div className={cn("flex mb-2", isParent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5",
          isParent
            ? "bg-[#004E64] text-white rounded-br-md"
            : "bg-[#F2EDE8] text-[#1a1a2e] rounded-bl-md"
        )}
      >
        {!isParent && msg.senderName && (
          <p className="text-[10px] font-semibold text-[#004E64] mb-0.5">
            {msg.senderName}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
        <p
          className={cn(
            "text-[10px] mt-1",
            isParent ? "text-white/60" : "text-[#7c7c8a]"
          )}
        >
          {new Date(msg.createdAt).toLocaleTimeString("en-AU", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────

function groupMessagesByDate(messages: ConversationMessage[]) {
  const groups = new Map<string, ConversationMessage[]>();

  for (const msg of messages) {
    const d = new Date(msg.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (d.toDateString() === today.toDateString()) {
      label = "Today";
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(msg);
  }

  return Array.from(groups.entries()).map(([dateLabel, messages]) => ({
    dateLabel,
    messages,
  }));
}

// ── Skeleton ────────────────────────────────────────────

function ConversationSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-7 w-64" />
      <div className="space-y-3 mt-6">
        <div className="flex justify-end"><Skeleton className="h-16 w-3/4 rounded-2xl" /></div>
        <div className="flex justify-start"><Skeleton className="h-12 w-2/3 rounded-2xl" /></div>
        <div className="flex justify-end"><Skeleton className="h-10 w-1/2 rounded-2xl" /></div>
      </div>
    </div>
  );
}
