"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  X,
  Sparkles,
  Check,
  Pencil,
  XCircle,
  Clock,
  Cpu,
  Hash,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiDraftData, AiDraftTaskType } from "@/hooks/useAiDrafts";
import { useReviewDraft } from "@/hooks/useAiDrafts";

type ReviewStatus = "accepted" | "edited" | "dismissed";

/* ── Task type badge config ──────────────────────────── */

const TASK_TYPE_CONFIG: Record<
  AiDraftTaskType,
  { label: string; bg: string; text: string }
> = {
  communication: { label: "Communication", bg: "bg-blue-50", text: "text-blue-700" },
  research: { label: "Research", bg: "bg-purple-50", text: "text-purple-700" },
  document: { label: "Document", bg: "bg-emerald-50", text: "text-emerald-700" },
  admin: { label: "Admin", bg: "bg-gray-100", text: "text-gray-700" },
};

/* ── Props ────────────────────────────────────────────── */

interface AiDraftReviewPanelProps {
  draft: AiDraftData;
  onClose: () => void;
}

/* ── Component ────────────────────────────────────────── */

export function AiDraftReviewPanel({ draft, onClose }: AiDraftReviewPanelProps) {
  const reviewDraft = useReviewDraft();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(draft.content);

  const taskConfig = TASK_TYPE_CONFIG[draft.taskType] ?? TASK_TYPE_CONFIG.admin;
  const isSubmitting = reviewDraft.isPending;

  const handleAccept = () => {
    reviewDraft.mutate(
      { id: draft.id, status: "accepted" as ReviewStatus },
      { onSuccess: () => onClose() },
    );
  };

  const handleDismiss = () => {
    reviewDraft.mutate(
      { id: draft.id, status: "dismissed" as ReviewStatus },
      { onSuccess: () => onClose() },
    );
  };

  const handleSaveEdit = () => {
    reviewDraft.mutate(
      { id: draft.id, status: "edited" as ReviewStatus, editedContent: editContent },
      {
        onSuccess: () => {
          setIsEditing(false);
        },
      },
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] bg-card border-l border-border shadow-xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <h2 className="text-base font-heading font-semibold text-foreground truncate">
                {draft.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                  taskConfig.bg,
                  taskConfig.text,
                )}
              >
                {taskConfig.label}
              </span>
              {draft.todo && (
                <span className="text-xs text-muted truncate max-w-[200px]">
                  To-do: {draft.todo.title}
                </span>
              )}
              {draft.marketingTask && (
                <span className="text-xs text-muted truncate max-w-[200px]">
                  Task: {draft.marketingTask.title}
                </span>
              )}
              {draft.coworkTodo && (
                <span className="text-xs text-muted truncate max-w-[200px]">
                  Cowork: {draft.coworkTodo.title}
                </span>
              )}
              {draft.ticket && (
                <span className="text-xs text-muted truncate max-w-[200px]">
                  Ticket #{draft.ticket.ticketNumber}
                </span>
              )}
              {draft.issue && (
                <span className="text-xs text-muted truncate max-w-[200px]">
                  Issue: {draft.issue.title}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full min-h-[300px] rounded-lg border border-border bg-surface p-3 text-sm text-foreground font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
              placeholder="Edit the draft content..."
            />
          ) : (
            <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-a:text-brand prose-strong:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {draft.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="px-5 py-3 border-t border-border bg-surface/50">
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(draft.createdAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              {draft.model}
            </span>
            {draft.tokensUsed > 0 && (
              <span className="inline-flex items-center gap-1">
                <Hash className="w-3 h-3" />
                {draft.tokensUsed.toLocaleString()} tokens
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-border flex items-center gap-3">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                disabled={isSubmitting || editContent === draft.content}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Changes
              </button>
              <button
                onClick={() => {
                  setEditContent(draft.content);
                  setIsEditing(false);
                }}
                disabled={isSubmitting}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-surface transition-colors min-h-[44px]"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleAccept}
                disabled={isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Accept & Complete
              </button>
              <button
                onClick={() => setIsEditing(true)}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={handleDismiss}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                <XCircle className="w-4 h-4" />
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
