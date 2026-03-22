"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "@/hooks/useToast";

interface Snippet {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  priority: string;
  expiresAt: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  acknowledged: boolean;
  totalAcks: number;
  totalUsers: number;
}

export function InfoSnippets() {
  const queryClient = useQueryClient();

  const { data: snippets, isLoading } = useQuery<Snippet[]>({
    queryKey: ["info-snippets"],
    queryFn: async () => {
      const res = await fetch("/api/snippets");
      if (!res.ok) throw new Error("Failed to load snippets");
      return res.json();
    },
  });

  const unacknowledgedCount =
    snippets?.filter((s) => !s.acknowledged).length ?? 0;

  const [expanded, setExpanded] = useState<boolean | null>(null);

  // Default to expanded if there are unacknowledged snippets
  const isExpanded =
    expanded !== null ? expanded : unacknowledgedCount > 0;

  const ackMutation = useMutation({
    mutationFn: async (snippetId: string) => {
      const res = await fetch(`/api/snippets/${snippetId}/acknowledge`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to acknowledge");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["info-snippets"] });
      toast({ description: "Acknowledged" });
    },
    onError: () => {
      toast({ description: "Failed to acknowledge. Please try again." });
    },
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 rounded bg-border animate-pulse" />
          <div className="h-4 w-32 rounded bg-border animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-16 rounded-lg bg-surface animate-pulse" />
          <div className="h-16 rounded-lg bg-surface animate-pulse" />
        </div>
      </div>
    );
  }

  if (!snippets || snippets.length === 0) return null;

  const borderColor: Record<string, string> = {
    high: "border-l-amber-400",
    normal: "border-l-blue-400",
    low: "border-l-gray-300",
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border/50 hover:bg-surface/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-foreground">
            New Information
          </h3>
          {unacknowledgedCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold">
              {unacknowledgedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unacknowledgedCount === 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              All caught up
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {snippets.map((snippet) => (
            <SnippetCard
              key={snippet.id}
              snippet={snippet}
              borderColor={borderColor[snippet.priority] ?? borderColor.normal}
              onAcknowledge={() => ackMutation.mutate(snippet.id)}
              isAcknowledging={
                ackMutation.isPending &&
                ackMutation.variables === snippet.id
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SnippetCard({
  snippet,
  borderColor,
  onAcknowledge,
  isAcknowledging,
}: {
  snippet: Snippet;
  borderColor: string;
  onAcknowledge: () => void;
  isAcknowledging: boolean;
}) {
  return (
    <div
      className={`border border-border border-l-4 ${borderColor} rounded-lg p-3 flex items-start justify-between gap-3`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{snippet.title}</p>
        <p className="text-xs text-muted mt-0.5 line-clamp-2">
          {snippet.summary}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          {snippet.category && (
            <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
              {snippet.category}
            </span>
          )}
          <span className="text-[10px] text-muted/50">
            {snippet.totalAcks}/{snippet.totalUsers} acknowledged
          </span>
        </div>
      </div>
      <div className="flex-shrink-0">
        {snippet.acknowledged ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Done
          </span>
        ) : (
          <button
            onClick={onAcknowledge}
            disabled={isAcknowledging}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {isAcknowledging ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            Acknowledge
          </button>
        )}
      </div>
    </div>
  );
}
