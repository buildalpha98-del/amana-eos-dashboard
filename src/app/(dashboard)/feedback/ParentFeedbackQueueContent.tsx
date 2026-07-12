"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { MessageCircle, Phone, ExternalLink, Check, X, Loader2 } from "lucide-react";

interface FeedbackItem {
  id: string;
  source: string | null;
  channel: string | null;
  surveyType: string | null;
  fromNumber: string | null;
  parentName: string | null;
  parentEmail: string | null;
  childName: string | null;
  comments: string | null;
  npsScore: number | null;
  overallRating: number | null;
  category: string | null;
  sentiment: string | null;
  status: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
  child: { id: string; firstName: string; surname: string } | null;
  createdAt: string;
}

type StatusFilter = "all" | "new" | "reviewing" | "actioned" | "dismissed";

export function ParentFeedbackQueueContent() {
  const [filter, setFilter] = useState<StatusFilter>("new");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ items: FeedbackItem[] }>({
    queryKey: ["parent-feedback-queue", filter],
    queryFn: () => {
      const qs = filter === "all" ? "" : `?status=${filter}`;
      return fetchApi<{ items: FeedbackItem[] }>(`/api/feedback${qs}`);
    },
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return await mutateApi(`/api/feedback/${id}`, {
        method: "PATCH",
        body: { status },
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Couldn't update feedback status",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-feedback-queue"] });
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Parent Feedback Queue"
        description="SMS replies, survey responses, and ad-hoc comments. Amana Way stage 7 — close every feedback loop."
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {(["new", "reviewing", "actioned", "dismissed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === s
                ? "bg-brand text-white"
                : "bg-card text-muted border border-border hover:bg-surface"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))
        ) : error ? (
          <ErrorState error={error} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title={filter === "new" ? "Inbox zero!" : "No feedback in this view"}
            description={
              filter === "new"
                ? "Every parent reply has been triaged. New SMS replies and survey responses will appear here."
                : "Switch filters above to see other statuses."
            }
          />
        ) : (
          items.map((item) => (
            <FeedbackCard
              key={item.id}
              item={item}
              onUpdateStatus={(status) =>
                updateStatus.mutate({ id: item.id, status })
              }
              isUpdating={updateStatus.isPending && updateStatus.variables?.id === item.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FeedbackCard({
  item,
  onUpdateStatus,
  isUpdating,
}: {
  item: FeedbackItem;
  onUpdateStatus: (status: string) => void;
  isUpdating: boolean;
}) {
  const isSmsReply = item.source === "sms_reply";
  const created = new Date(item.createdAt);

  const fromLabel = (() => {
    if (item.parentName) return item.parentName;
    if (item.contact) {
      return [item.contact.firstName, item.contact.lastName]
        .filter(Boolean)
        .join(" ") || item.fromNumber || "Unknown";
    }
    return item.fromNumber || item.parentEmail || "Unknown";
  })();

  const childLabel = item.child
    ? `${item.child.firstName} ${item.child.surname}`
    : item.childName;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isSmsReply ? (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300">
                <Phone className="w-3 h-3" />
                SMS reply
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                <MessageCircle className="w-3 h-3" />
                {item.surveyType ?? item.source ?? "Feedback"}
              </span>
            )}
            <span className="text-sm font-semibold text-foreground">{fromLabel}</span>
            {childLabel && (
              <span className="text-xs text-muted">· {childLabel}</span>
            )}
            {item.service?.name && (
              <span className="text-xs text-muted">· {item.service.name}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {created.toLocaleString("en-AU", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {item.reviewedAt && item.reviewedBy && (
              <>
                {" · "}Reviewed by {item.reviewedBy.name}
              </>
            )}
          </p>
        </div>
        <span
          className={`text-2xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            item.status === "new"
              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
              : item.status === "reviewing"
                ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                : item.status === "actioned"
                  ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
                  : "bg-surface text-muted"
          }`}
        >
          {item.status}
        </span>
      </div>

      {item.comments && (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-surface rounded-lg p-3">
          {item.comments}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {item.status !== "actioned" && (
          <button
            type="button"
            onClick={() => onUpdateStatus("actioned")}
            disabled={isUpdating}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Mark actioned
          </button>
        )}
        {item.status === "new" && (
          <button
            type="button"
            onClick={() => onUpdateStatus("reviewing")}
            disabled={isUpdating}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs font-medium hover:bg-surface disabled:opacity-50"
          >
            Working on it
          </button>
        )}
        {item.status !== "dismissed" && item.status !== "actioned" && (
          <button
            type="button"
            onClick={() => onUpdateStatus("dismissed")}
            disabled={isUpdating}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs font-medium hover:bg-surface disabled:opacity-50"
          >
            <X className="w-3 h-3" />
            Dismiss
          </button>
        )}
        {item.child?.id && (
          <a
            href={`/services?childId=${encodeURIComponent(item.child.id)}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-brand hover:underline ml-auto"
          >
            <ExternalLink className="w-3 h-3" />
            Open child
          </a>
        )}
      </div>
    </div>
  );
}
