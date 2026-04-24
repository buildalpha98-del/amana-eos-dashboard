"use client";

/**
 * ShiftHandoverWidget — drop-in widget for the Services Today tab.
 * Reads non-expired handovers, lets the on-shift coordinator leave one for
 * the next shift.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { NotebookPen, Send, User } from "lucide-react";

interface Handover {
  id: string;
  content: string;
  mentionedUserIds: string[];
  expiresAt: string;
  createdAt: string;
  author: { id: string; name: string; avatar: string | null };
}

export function ShiftHandoverWidget({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [showComposer, setShowComposer] = useState(false);

  const { data } = useQuery<{ items: Handover[] }>({
    queryKey: ["service-handovers", serviceId],
    queryFn: () =>
      fetchApi<{ items: Handover[] }>(
        `/api/services/${serviceId}/handovers`,
      ),
    retry: 2,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: (content: string) =>
      mutateApi<Handover>(`/api/services/${serviceId}/handovers`, {
        method: "POST",
        body: { content },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-handovers", serviceId] });
      setDraft("");
      setShowComposer(false);
      toast({ description: "Handover saved — stays up for 48h." });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Could not save handover",
      });
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
          Shift handover
        </h3>
        <button
          type="button"
          onClick={() => setShowComposer((s) => !s)}
          className="text-[12px] font-medium text-[color:var(--color-brand)] hover:underline"
        >
          {showComposer ? "Cancel" : "Leave a note"}
        </button>
      </div>

      {showComposer && (
        <div className="warm-card-dense p-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="What should the next shift know? Meds due, behaviour to watch, parent to call back…"
            className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-2 py-1.5 text-sm bg-white resize-y"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!draft.trim() || create.isPending}
              onClick={() => create.mutate(draft.trim())}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm)]",
                "bg-[color:var(--color-brand)] text-white text-[12px] font-medium",
                "hover:bg-[color:var(--color-brand-hover)] transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Send className="w-3.5 h-3.5" />
              {create.isPending ? "Saving…" : "Save handover"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !showComposer ? (
        <div className="warm-card-dense p-3 text-sm text-[color:var(--color-muted)] flex items-center gap-2">
          <NotebookPen className="w-4 h-4" />
          No open handovers. Leave a note if the next coordinator should know
          something.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 3).map((h) => {
            const created = new Date(h.createdAt);
            return (
              <li key={h.id} className="warm-card-dense p-3">
                <p className="text-sm text-[color:var(--color-foreground)] whitespace-pre-wrap">
                  {h.content}
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--color-muted)] flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {h.author.name} ·{" "}
                  {created.toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
