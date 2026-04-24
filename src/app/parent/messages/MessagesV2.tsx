"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Paperclip, Plus, MessageCircle } from "lucide-react";
import {
  useParentConversations,
  useCreateConversation,
  useParentChildren,
  type ConversationSummary,
} from "@/hooks/useParentPortal";
import {
  Avatar,
  AttachmentThumbnails,
  PullSheet,
  useMessageAttachments,
  MAX_ATTACHMENTS,
} from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export default function MessagesV2() {
  const { data, isLoading } = useParentConversations();
  const [composeOpen, setComposeOpen] = useState(false);

  if (isLoading) return <MessagesSkeleton />;

  const items = data ?? [];

  return (
    <div className="pb-20">
      <header className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[24px] font-heading font-bold text-[color:var(--color-foreground)] leading-tight">
            Messages
          </h1>
          <p className="text-sm text-[color:var(--color-muted)] mt-1">
            Talk to your centre.
          </p>
        </div>
        <button
          onClick={() => setComposeOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[color:var(--color-brand)] text-white text-sm font-semibold min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </header>

      {items.length === 0 ? (
        <EmptyConversations onNew={() => setComposeOpen(true)} />
      ) : (
        <ul className="space-y-2.5">
          {items.map((c) => (
            <li key={c.id}>
              <ConversationRow conversation={c} />
            </li>
          ))}
        </ul>
      )}

      <ComposeSheet open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const isUnread = (conversation.unreadCount ?? 0) > 0;
  return (
    <Link
      href={`/parent/messages/${conversation.id}`}
      className={cn(
        "warm-card flex items-start gap-3 transition-shadow",
        isUnread &&
          "border-l-[3px] border-l-[color:var(--color-accent)] pl-[13px]",
      )}
    >
      <Avatar name={conversation.subject ?? "Centre"} size="md" seed={conversation.id} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "text-sm truncate",
              isUnread
                ? "font-bold text-[color:var(--color-foreground)]"
                : "font-semibold text-[color:var(--color-foreground)]",
            )}
          >
            {conversation.subject ?? "No subject"}
          </p>
          {conversation.lastMessageAt && (
            <span className="text-[11px] text-[color:var(--color-muted)] shrink-0">
              {formatRelative(conversation.lastMessageAt)}
            </span>
          )}
        </div>
        {conversation.lastMessage && (
          <p className="text-xs text-[color:var(--color-muted)] mt-0.5 truncate">
            {conversation.lastMessage.senderType === "parent" ? "You: " : ""}
            {conversation.lastMessage.preview}
          </p>
        )}
      </div>
      {isUnread && (
        <span className="w-2 h-2 rounded-full bg-[color:var(--color-accent)] shrink-0 mt-1.5" />
      )}
    </Link>
  );
}

function EmptyConversations({ onNew }: { onNew: () => void }) {
  return (
    <div className="text-center py-8 space-y-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center">
        <MessageCircle className="w-7 h-7 text-[color:var(--color-brand)]" />
      </div>
      <div>
        <p className="text-base font-semibold text-[color:var(--color-foreground)]">
          No conversations yet
        </p>
        <p className="text-sm text-[color:var(--color-muted)] mt-1">
          Say hi to your centre — they&apos;ll reply directly here.
        </p>
      </div>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[color:var(--color-brand)] text-white font-semibold min-h-[44px]"
      >
        <Plus className="w-4 h-4" />
        Start a conversation
      </button>
    </div>
  );
}

function ComposeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: children } = useParentChildren();
  const create = useCreateConversation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [serviceId, setServiceId] = useState<string | undefined>(undefined);

  const {
    attachments,
    addFiles,
    remove: removeAttachment,
    reset: resetAttachments,
    uploadedUrls,
    isUploading: isAttachmentUploading,
    canAddMore,
  } = useMessageAttachments({ endpoint: "/api/parent/upload/image" });

  const services = Array.from(
    new Map(
      (children ?? []).map((c) => [c.serviceId, { id: c.serviceId, name: c.serviceName }]),
    ).values(),
  );

  const hasBody = message.trim().length > 0 || uploadedUrls.length > 0;
  const canSubmit =
    !!subject.trim() &&
    hasBody &&
    !create.isPending &&
    !isAttachmentUploading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        subject,
        message: message.trim(),
        serviceId,
        attachmentUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
      });
      setSubject("");
      setMessage("");
      setServiceId(undefined);
      resetAttachments();
      onOpenChange(false);
    } catch {
      // onError toast handled by the hook
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) addFiles(files);
    e.target.value = "";
  };

  return (
    <PullSheet open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        <h2 className="text-lg font-heading font-bold">New message</h2>

        {services.length > 1 && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)] block mb-2">
              Centre
            </label>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-semibold transition-all min-h-[36px]",
                    serviceId === s.id
                      ? "bg-[color:var(--color-brand)] border-[color:var(--color-brand)] text-white"
                      : "bg-[color:var(--color-cream-soft)] border-[color:var(--color-border)] text-[color:var(--color-foreground)]/70",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)] block mb-2">
            Subject
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Sophia pickup on Friday"
            className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border-2 border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] text-sm focus:outline-none focus:border-[color:var(--color-brand)] min-h-[44px]"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)] block mb-2">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={attachments.length > 0 ? "Add a caption…" : "Say hi…"}
            rows={5}
            className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border-2 border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] text-sm focus:outline-none focus:border-[color:var(--color-brand)] min-h-[120px] resize-none"
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
            disabled={!canAddMore || create.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-[color:var(--color-brand)] hover:bg-[color:var(--color-cream-deep)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[40px]"
            aria-label="Add image attachment"
            title={
              canAddMore
                ? "Add photo"
                : `Maximum ${MAX_ATTACHMENTS} images per message`
            }
          >
            <Paperclip className="w-4 h-4" />
            Add photo
          </button>
          {attachments.length > 0 && (
            <span className="text-xs text-[color:var(--color-muted)]">
              {attachments.length} of {MAX_ATTACHMENTS}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 rounded-[var(--radius-md)] bg-[color:var(--color-brand)] text-white font-semibold disabled:opacity-50 min-h-[44px]"
        >
          {create.isPending || isAttachmentUploading
            ? isAttachmentUploading
              ? "Uploading…"
              : "Sending…"
            : "Send"}
        </button>
      </div>
    </PullSheet>
  );
}

function MessagesSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-[72px] rounded-[var(--radius-lg)]" />
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
