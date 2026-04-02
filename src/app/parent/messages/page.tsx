"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  CircleDot,
} from "lucide-react";
import {
  useParentConversations,
  useParentChildren,
  useCreateConversation,
  type ConversationSummary,
} from "@/hooks/useParentPortal";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  new: { icon: CircleDot, color: "text-blue-500", label: "New" },
  open: { icon: CircleDot, color: "text-amber-500", label: "Open" },
  pending_parent: { icon: Clock, color: "text-amber-500", label: "Awaiting Reply" },
  resolved: { icon: CheckCircle2, color: "text-green-500", label: "Resolved" },
  closed: { icon: CheckCircle2, color: "text-[#7c7c8a]", label: "Closed" },
};

export default function MessagesPage() {
  const { data: conversations, isLoading } = useParentConversations();
  const [newMsgOpen, setNewMsgOpen] = useState(false);

  if (isLoading) return <MessagesSkeleton />;

  const items = conversations ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
            Messages
          </h1>
          <p className="text-sm text-[#7c7c8a] mt-1">
            Chat with your centre.
          </p>
        </div>
        <button
          onClick={() => setNewMsgOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] hover:bg-[#003D52] text-white text-sm font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Message</span>
        </button>
      </div>

      {/* Conversations list */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <div className="w-12 h-12 rounded-full bg-[#FECE00]/20 flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="w-6 h-6 text-[#004E64]" />
          </div>
          <h2 className="text-base font-heading font-semibold text-[#1a1a2e] mb-1">
            No messages yet
          </h2>
          <p className="text-sm text-[#7c7c8a]">
            Tap &ldquo;New Message&rdquo; to start a conversation with your centre.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((conv) => (
            <ConversationCard key={conv.id} conversation={conv} />
          ))}
        </div>
      )}

      <NewMessageDialog open={newMsgOpen} onOpenChange={setNewMsgOpen} />
    </div>
  );
}

// ── Conversation Card ───────────────────────────────────

function ConversationCard({ conversation: conv }: { conversation: ConversationSummary }) {
  const statusInfo = STATUS_STYLES[conv.status] ?? STATUS_STYLES.open;
  const StatusIcon = statusInfo.icon;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return d.toLocaleDateString("en-AU", { weekday: "short" });
    }
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  const isUnread =
    conv.lastMessage?.direction === "outbound" &&
    (conv.status === "open" || conv.status === "new");

  return (
    <Link
      href={`/parent/messages/${conv.id}`}
      className={cn(
        "block bg-white rounded-xl p-4 shadow-sm border transition-all duration-200 hover:shadow-md hover:border-[#004E64]/20 active:scale-[0.99]",
        isUnread ? "border-[#004E64]/30 bg-[#004E64]/[0.02]" : "border-[#e8e4df]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn("text-sm truncate", isUnread ? "font-bold text-[#1a1a2e]" : "font-semibold text-[#1a1a2e]")}>
              {conv.subject ?? "No subject"}
            </p>
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-[#004E64] shrink-0" />
            )}
          </div>
          {conv.service && (
            <p className="text-xs text-[#7c7c8a] mt-0.5">{conv.service.name}</p>
          )}
          {conv.lastMessage && (
            <p className="text-xs text-[#7c7c8a] mt-1 truncate">
              {conv.lastMessage.direction === "inbound" ? "You: " : "Centre: "}
              {conv.lastMessage.preview}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[10px] text-[#7c7c8a]">
            {conv.lastMessage ? formatDate(conv.lastMessage.createdAt) : formatDate(conv.createdAt)}
          </span>
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", statusInfo.color)}>
            <StatusIcon className="w-3 h-3" />
            {statusInfo.label}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── New Message Dialog ──────────────────────────────────

function NewMessageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: children } = useParentChildren();
  const createConversation = useCreateConversation();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [serviceId, setServiceId] = useState("");

  // Deduplicate services from children
  const services = Array.from(
    new Map((children ?? []).map((c) => [c.serviceId, c.serviceName])).entries()
  ).map(([id, name]) => ({ id, name }));

  const resetForm = () => {
    setSubject("");
    setMessage("");
    setServiceId("");
  };

  const handleSend = () => {
    if (!subject || !message) return;
    createConversation.mutate(
      { subject, message, serviceId: serviceId || undefined },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New Message</DialogTitle>
        <DialogDescription>Send a message to your centre.</DialogDescription>

        <div className="space-y-4 mt-4">
          {services.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">Centre</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
              >
                <option value="">Select a centre</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Question about bookings"
              maxLength={200}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              maxLength={5000}
              rows={4}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors resize-none"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!subject || !message || createConversation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {createConversation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Sending...</>
            ) : (
              "Send Message"
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Skeleton ────────────────────────────────────────────

function MessagesSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
