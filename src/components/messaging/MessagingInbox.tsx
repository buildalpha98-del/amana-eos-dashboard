"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  MessageSquare,
  Plus,
  Megaphone,
  Send,
  Loader2,
  Search,
  CheckCircle2,
  Archive,
  ArrowLeft,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useConversations,
  useConversationDetail,
  useCreateConversation,
  useSendMessage,
  useUpdateConversationStatus,
  useSendBroadcast,
  useFamilies,
  type ConversationListItem,
} from "@/hooks/useMessaging";
import { useServices } from "@/hooks/useServices";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  AttachmentThumbnails,
  MessageAttachmentGrid,
  useMessageAttachments,
  MAX_ATTACHMENTS,
} from "@/components/parent/ui";

// ── Status Tabs ────────────────────────────────────────────

const STATUS_TABS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "archived", label: "Archived" },
] as const;

// ── Main Component ─────────────────────────────────────────

export function MessagingInbox() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("open");
  const [serviceId, setServiceId] = useState("");
  const [search, setSearch] = useState("");
  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  // Mobile: show thread view when a conversation is selected
  const [mobileThread, setMobileThread] = useState(false);

  const { data: services } = useServices();
  const { data: conversations, isLoading } = useConversations({
    serviceId: serviceId || undefined,
    status,
    search: search || undefined,
  });

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setMobileThread(true);
  };

  const handleBack = () => {
    setMobileThread(false);
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-xl border border-[#e8e4df] bg-white shadow-sm">
      {/* ── Left panel: conversation list ─────────────── */}
      <div
        className={cn(
          "w-full sm:w-[35%] sm:min-w-[320px] sm:max-w-[420px] border-r border-[#e8e4df] flex flex-col",
          mobileThread ? "hidden sm:flex" : "flex",
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#e8e4df] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-bold text-[#1a1a2e]">
              Messages
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBroadcastOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#004E64] hover:bg-[#004E64]/5 rounded-lg transition-colors min-h-[36px]"
              >
                <Megaphone className="w-4 h-4" />
                <span className="hidden sm:inline">Broadcast</span>
              </button>
              <button
                onClick={() => setNewMsgOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#004E64] hover:bg-[#003D52] text-white text-sm font-semibold rounded-lg transition-colors min-h-[36px]"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7c7c8a]" />
            <input
              type="text"
              placeholder="Search by name or subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 focus:outline-none focus:border-[#004E64] transition-colors"
            />
          </div>

          {/* Service filter */}
          {services && services.length > 1 && (
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 focus:outline-none focus:border-[#004E64] transition-colors"
            >
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          {/* Status tabs */}
          <div className="flex gap-1 bg-[#f8f5f2] rounded-lg p-0.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatus(tab.value)}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all min-h-[32px]",
                  status === tab.value
                    ? "bg-white text-[#004E64] shadow-sm"
                    : "text-[#7c7c8a] hover:text-[#1a1a2e]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : !conversations?.length ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-8 h-8 text-[#7c7c8a]/40 mx-auto mb-2" />
              <p className="text-sm text-[#7c7c8a]">No conversations</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                isActive={selectedId === conv.id}
                onClick={() => handleSelect(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: conversation thread ──────────── */}
      <div
        className={cn(
          "flex-1 flex flex-col",
          mobileThread ? "flex" : "hidden sm:flex",
        )}
      >
        {selectedId ? (
          <ConversationThread
            conversationId={selectedId}
            onBack={handleBack}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-[#7c7c8a]/30 mx-auto mb-3" />
              <p className="text-sm text-[#7c7c8a]">
                Select a conversation to view messages
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <NewMessageDialog
        open={newMsgOpen}
        onOpenChange={setNewMsgOpen}
        onCreated={(id) => {
          setSelectedId(id);
          setMobileThread(true);
        }}
      />
      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />
    </div>
  );
}

// ── Conversation Row ───────────────────────────────────────

function ConversationRow({
  conversation: conv,
  isActive,
  onClick,
}: {
  conversation: ConversationListItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const familyName = [conv.family.firstName, conv.family.lastName]
    .filter(Boolean)
    .join(" ") || "Unknown";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-[#e8e4df]/50 hover:bg-[#f8f5f2]/50 transition-colors",
        isActive && "bg-[#f8f5f2] border-l-2 border-l-[#004E64]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#1a1a2e] truncate">
              {familyName}
            </span>
            {conv.unreadCount > 0 && (
              <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[#FECE00] text-[10px] font-bold text-[#1a1a2e]">
                {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
              </span>
            )}
          </div>
          <p className="text-xs text-[#7c7c8a] mt-0.5">{conv.service.name}</p>
          <p className="text-xs text-[#1a1a2e]/70 mt-0.5 truncate">
            {conv.subject}
          </p>
        </div>
        <span className="text-[10px] text-[#7c7c8a] shrink-0 mt-0.5">
          {formatRelativeTime(conv.lastMessageAt)}
        </span>
      </div>
    </button>
  );
}

// ── Conversation Thread ────────────────────────────────────

function ConversationThread({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const { data: conversation, isLoading } = useConversationDetail(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const updateStatus = useUpdateConversationStatus(conversationId);
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    attachments,
    addFiles,
    remove: removeAttachment,
    reset: resetAttachments,
    uploadedUrls,
    isUploading: isAttachmentUploading,
    canAddMore,
  } = useMessageAttachments({ endpoint: "/api/upload/image" });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  // Reset reply when switching conversations
  useEffect(() => {
    setReplyText("");
    resetAttachments();
  }, [conversationId, resetAttachments]);

  const canSend =
    !isAttachmentUploading &&
    !sendMessage.isPending &&
    (replyText.trim().length > 0 || uploadedUrls.length > 0);

  const handleSend = () => {
    if (!canSend) return;
    sendMessage.mutate(
      {
        body: replyText.trim(),
        attachmentUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
      },
      {
        onSuccess: () => {
          setReplyText("");
          resetAttachments();
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) addFiles(files);
    e.target.value = "";
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="space-y-3 mt-8">
          <div className="flex justify-end">
            <Skeleton className="h-16 w-3/4 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!conversation) return null;

  const familyName = [conversation.family.firstName, conversation.family.lastName]
    .filter(Boolean)
    .join(" ") || "Unknown";

  return (
    <>
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-[#e8e4df] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="sm:hidden shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f8f5f2] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#1a1a2e]" />
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#1a1a2e] truncate">
              {conversation.subject}
            </h3>
            <p className="text-xs text-[#7c7c8a]">
              {familyName} &middot; {conversation.service.name}
            </p>
          </div>
        </div>
        {conversation.status === "open" && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => updateStatus.mutate("resolved")}
              disabled={updateStatus.isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 rounded-lg transition-colors min-h-[32px]"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Resolve
            </button>
            <button
              onClick={() => updateStatus.mutate("archived")}
              disabled={updateStatus.isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#7c7c8a] hover:bg-[#f8f5f2] rounded-lg transition-colors min-h-[32px]"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {conversation.messages.map((msg) => {
          const hasText = msg.body && msg.body.trim().length > 0;
          const hasAttachments =
            msg.attachmentUrls && msg.attachmentUrls.length > 0;
          if (!hasText && !hasAttachments) return null;
          return (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.senderType === "staff" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5",
                  msg.senderType === "staff"
                    ? "bg-[#004E64] text-white rounded-br-md"
                    : "bg-white border border-[#004E64]/20 text-[#1a1a2e] rounded-bl-md",
                )}
              >
                <p
                  className={cn(
                    "text-[10px] font-semibold mb-0.5",
                    msg.senderType === "staff"
                      ? "text-white/70"
                      : "text-[#004E64]",
                  )}
                >
                  {msg.senderName}
                </p>
                {hasText && (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.body}
                  </p>
                )}
                {hasAttachments && (
                  <MessageAttachmentGrid
                    urls={msg.attachmentUrls}
                    tone={msg.senderType === "staff" ? "sent" : "received"}
                  />
                )}
                <p
                  className={cn(
                    "text-[10px] mt-1",
                    msg.senderType === "staff"
                      ? "text-white/50"
                      : "text-[#7c7c8a]",
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
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply box */}
      <div className="p-3 border-t border-[#e8e4df] space-y-2">
        {attachments.length > 0 && (
          <AttachmentThumbnails
            attachments={attachments}
            onRemove={removeAttachment}
          />
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canAddMore || sendMessage.isPending}
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#004E64] hover:bg-[#004E64]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] min-w-[44px]"
            aria-label="Add image attachment"
            title={
              canAddMore
                ? "Add photo"
                : `Maximum ${MAX_ATTACHMENTS} images per message`
            }
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              attachments.length > 0 ? "Add a caption…" : "Type a message..."
            }
            rows={3}
            className="flex-1 px-3 py-2.5 border border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-[#004E64] hover:bg-[#003D52] text-white transition-all disabled:opacity-50 active:scale-[0.95] min-h-[44px] min-w-[44px]"
            aria-label="Send message"
          >
            {sendMessage.isPending || isAttachmentUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ── New Message Dialog ─────────────────────────────────────

function NewMessageDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { data: services } = useServices();
  const [serviceId, setServiceId] = useState("");
  const { data: families } = useFamilies(serviceId || undefined);
  const createConversation = useCreateConversation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [familyId, setFamilyId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [familySearch, setFamilySearch] = useState("");

  const {
    attachments,
    addFiles,
    remove: removeAttachment,
    reset: resetAttachments,
    uploadedUrls,
    isUploading: isAttachmentUploading,
    canAddMore,
  } = useMessageAttachments({ endpoint: "/api/upload/image" });

  const filteredFamilies = useMemo(() => {
    if (!families) return [];
    if (!familySearch) return families;
    const q = familySearch.toLowerCase();
    return families.filter(
      (f) =>
        f.firstName?.toLowerCase().includes(q) ||
        f.lastName?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q),
    );
  }, [families, familySearch]);

  const resetForm = () => {
    setServiceId("");
    setFamilyId("");
    setSubject("");
    setBody("");
    setFamilySearch("");
    resetAttachments();
  };

  const hasBody = body.trim().length > 0 || uploadedUrls.length > 0;
  const canSubmit =
    !!familyId &&
    !!serviceId &&
    !!subject &&
    hasBody &&
    !createConversation.isPending &&
    !isAttachmentUploading;

  const handleSend = () => {
    if (!canSubmit) return;
    createConversation.mutate(
      {
        familyId,
        serviceId,
        subject,
        body: body.trim(),
        attachmentUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
      },
      {
        onSuccess: (data) => {
          resetForm();
          onOpenChange(false);
          if (data?.id) onCreated(data.id);
        },
      },
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) addFiles(files);
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New Message</DialogTitle>
        <DialogDescription>Start a conversation with a family.</DialogDescription>

        <div className="space-y-4 mt-4">
          {/* Service selector */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Service
            </label>
            <select
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setFamilyId("");
              }}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 text-sm text-[#1a1a2e] focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
            >
              <option value="">Select a service</option>
              {services?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Family selector */}
          {serviceId && (
            <div>
              <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
                Family
              </label>
              <input
                type="text"
                placeholder="Search families..."
                value={familySearch}
                onChange={(e) => setFamilySearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border-2 border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 focus:outline-none focus:border-[#004E64] transition-colors mb-1 min-h-[44px]"
              />
              <div className="max-h-32 overflow-y-auto border border-[#e8e4df] rounded-lg">
                {filteredFamilies.length === 0 ? (
                  <p className="text-xs text-[#7c7c8a] p-3 text-center">
                    No families found
                  </p>
                ) : (
                  filteredFamilies.map((f) => {
                    const name = [f.firstName, f.lastName]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFamilyId(f.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-[#f8f5f2] transition-colors min-h-[40px]",
                          familyId === f.id && "bg-[#004E64]/5 font-medium",
                        )}
                      >
                        {name || f.email}
                        {name && f.email && (
                          <span className="text-xs text-[#7c7c8a] ml-2">
                            {f.email}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Enrolment update"
              maxLength={200}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={attachments.length > 0 ? "Add a caption (optional)…" : "Type your message..."}
              maxLength={5000}
              rows={4}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors resize-none"
            />
          </div>

          {attachments.length > 0 && (
            <AttachmentThumbnails
              attachments={attachments}
              onRemove={removeAttachment}
            />
          )}

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canAddMore || createConversation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#004E64] hover:bg-[#004E64]/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px]"
              aria-label="Add image attachment"
              title={canAddMore ? "Add photo" : `Maximum ${MAX_ATTACHMENTS} images per message`}
            >
              <Paperclip className="w-4 h-4" />
              Add photo
            </button>
            <span className="text-xs text-[#7c7c8a]">
              {attachments.length > 0
                ? `${attachments.length} of ${MAX_ATTACHMENTS}`
                : ""}
            </span>
          </div>

          <button
            onClick={handleSend}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {createConversation.isPending || isAttachmentUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isAttachmentUploading ? "Uploading..." : "Sending..."}
              </>
            ) : (
              "Send Message"
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Broadcast Dialog ───────────────────────────────────────

function BroadcastDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: services } = useServices();
  const { data: families } = useFamilies(undefined);
  const sendBroadcast = useSendBroadcast();

  const [serviceId, setServiceId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Count families for preview
  const familyCount = useMemo(() => {
    if (!families || !serviceId) return 0;
    return families.filter((f) => f.serviceId === serviceId).length;
  }, [families, serviceId]);

  const serviceName = services?.find((s) => s.id === serviceId)?.name;

  const resetForm = () => {
    setServiceId("");
    setSubject("");
    setBody("");
  };

  const handleSend = () => {
    if (!serviceId || !subject || !body) return;
    sendBroadcast.mutate(
      { serviceId, subject, body },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Send Broadcast</DialogTitle>
        <DialogDescription>
          Send a message to all families at a service.
        </DialogDescription>

        <div className="space-y-4 mt-4">
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Service
            </label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 text-sm text-[#1a1a2e] focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
            >
              <option value="">Select a service</option>
              {services?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Important update"
              maxLength={200}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your broadcast message..."
              maxLength={10000}
              rows={5}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#f8f5f2]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors resize-none"
            />
          </div>

          {serviceId && (
            <div className="bg-[#FECE00]/10 border border-[#FECE00]/30 rounded-lg p-3">
              <p className="text-xs text-[#1a1a2e]">
                <Megaphone className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
                This will be sent to <strong>{familyCount}</strong> families at{" "}
                <strong>{serviceName}</strong>.
              </p>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={
              !serviceId || !subject || !body || sendBroadcast.isPending
            }
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {sendBroadcast.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Megaphone className="w-4 h-4" />
                Send Broadcast
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHrs = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHrs < 24) return `${diffHrs}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-AU", { weekday: "short" });
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
