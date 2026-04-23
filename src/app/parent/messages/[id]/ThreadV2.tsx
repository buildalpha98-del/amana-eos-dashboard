"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Send, Paperclip, Check, CheckCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useConversationDetail,
  useSendReply,
  type ConversationMessage,
} from "@/hooks/useParentPortal";
import { Avatar } from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";

interface OptimisticMessage extends ConversationMessage {
  __optimistic?: true;
  __failed?: boolean;
}

export default function ThreadV2() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useConversationDetail(id);
  const sendReply = useSendReply();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Merge server messages + optimistic pending ones
  const messages = useMemo<OptimisticMessage[]>(() => {
    const server: OptimisticMessage[] = data?.messages ?? [];
    // Filter out optimistic messages that have been confirmed by the server
    const unconfirmed = optimistic.filter(
      (o) => !server.some((s) => s.body === o.body && s.senderType === "parent" && Math.abs(new Date(s.createdAt).getTime() - new Date(o.createdAt).getTime()) < 30_000),
    );
    return [...server, ...unconfirmed];
  }, [data, optimistic]);

  // Scroll to bottom on message change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (isLoading) return <ThreadSkeleton />;

  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="warm-card text-center py-10">
          <p className="text-sm text-[color:var(--color-muted)]">
            Couldn&apos;t load this conversation.
          </p>
        </div>
      </div>
    );
  }

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    const tempId = `temp-${Date.now()}`;
    const pending: OptimisticMessage = {
      id: tempId,
      senderType: "parent",
      senderName: "You",
      body,
      isRead: true,
      createdAt: new Date().toISOString(),
      __optimistic: true,
    };
    setOptimistic((prev) => [...prev, pending]);
    setDraft("");

    try {
      await sendReply.mutateAsync({ conversationId: id, body });
      // Message confirmed — will be overwritten by next refetch
      setOptimistic((prev) => prev.filter((p) => p.id !== tempId));
      queryClient.invalidateQueries({ queryKey: ["parent", "messages", id] });
    } catch (err: unknown) {
      setOptimistic((prev) =>
        prev.map((p) => (p.id === tempId ? { ...p, __failed: true } : p)),
      );
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Failed to send message.",
      });
    }
  };

  return (
    <div className="fixed inset-x-0 top-14 bottom-16 sm:bottom-0 max-w-2xl mx-auto flex flex-col bg-[#FFFAE6]">
      {/* Header */}
      <header className="shrink-0 px-4 py-3 border-b border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] flex items-center gap-3">
        <Link
          href="/parent/messages"
          className="p-1.5 -ml-1.5 rounded-md hover:bg-[color:var(--color-cream-deep)] min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Back to messages"
        >
          <ArrowLeft className="w-5 h-5 text-[color:var(--color-foreground)]/70" />
        </Link>
        <Avatar
          name={data.service?.name ?? "Centre"}
          seed={data.service?.id ?? id}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-heading font-bold text-[color:var(--color-foreground)] truncate">
            {data.subject ?? "No subject"}
          </h1>
          {data.service && (
            <p className="text-[11px] text-[color:var(--color-muted)] truncate">
              {data.service.name}
            </p>
          )}
        </div>
      </header>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {messages.map((m, idx) => {
          const prev = messages[idx - 1];
          const showTimestamp =
            !prev ||
            Math.abs(
              new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime(),
            ) > 15 * 60_000;
          return (
            <div key={m.id}>
              {showTimestamp && <TimestampDivider iso={m.createdAt} />}
              <Bubble message={m} />
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-sm text-[color:var(--color-muted)] text-center py-10">
            No messages yet — send the first one below.
          </p>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="shrink-0 px-3 pt-2 pb-2 border-t border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] flex items-end gap-2"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <button
          type="button"
          disabled
          title="Attachments coming soon"
          className="shrink-0 p-2 rounded-full text-[color:var(--color-muted)]/50 cursor-not-allowed min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Attach (coming soon)"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Message"
          rows={1}
          className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border-2 border-[color:var(--color-border)] bg-white text-sm focus:outline-none focus:border-[color:var(--color-brand)] resize-none max-h-32 min-h-[44px]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sendReply.isPending}
          className={cn(
            "shrink-0 rounded-full p-2.5 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center",
            draft.trim()
              ? "bg-[color:var(--color-brand)] text-white"
              : "bg-[color:var(--color-border)] text-[color:var(--color-muted)]",
          )}
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

function Bubble({ message }: { message: OptimisticMessage }) {
  const isParent = message.senderType === "parent";
  return (
    <div className={cn("flex", isParent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] px-3.5 py-2 rounded-[18px] text-[14px] leading-snug",
          isParent
            ? "bg-[color:var(--color-brand)] text-white rounded-br-[6px]"
            : "bg-[color:var(--color-cream-deep)] text-[color:var(--color-foreground)] rounded-bl-[6px]",
          message.__failed && "opacity-60",
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        {isParent && (
          <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] opacity-70">
            {message.__failed ? (
              <span className="text-red-200">Failed</span>
            ) : message.__optimistic ? (
              <Check className="w-3 h-3" />
            ) : (
              <CheckCheck className="w-3 h-3" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TimestampDivider({ iso }: { iso: string }) {
  const d = new Date(iso);
  const stamp = d.toLocaleString("en-AU", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return (
    <div className="text-[11px] text-[color:var(--color-muted)] text-center my-3 uppercase tracking-wider font-semibold">
      {stamp}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/parent/messages"
      className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--color-brand)] hover:text-[color:var(--color-brand-light)] min-h-[44px]"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to messages
    </Link>
  );
}

function ThreadSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className={cn("h-12 rounded-[18px]", i % 2 ? "w-2/3 ml-auto" : "w-1/2")} />
      ))}
    </div>
  );
}
