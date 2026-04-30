"use client";

/**
 * GenerateNewsletterButton — drop-in button that kicks off the weekly newsletter
 * workflow:
 *
 *   1. POST /api/services/[id]/newsletter/generate — reads program + menu +
 *      events + recent parent-visible observations, runs the
 *      `newsletter/weekly-draft` AI template, returns a Markdown draft.
 *   2. Coordinator reviews + edits in a dialog.
 *   3. POST /api/services/[id]/newsletter/publish — creates a community
 *      ParentPost with `type="newsletter"` so parents see it in their timeline.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { Sparkles, Send } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";

export function GenerateNewsletterButton({ serviceId }: { serviceId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: () =>
      mutateApi<{ draft: string }>(
        `/api/services/${serviceId}/newsletter/generate`,
        { method: "POST", body: {} },
      ),
    onSuccess: (data) => {
      setContent(data.draft);
      if (!title.trim()) {
        setTitle(`Week of ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`);
      }
      setOpen(true);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Could not generate newsletter",
      });
    },
  });

  const publish = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/newsletter/publish`, {
        method: "POST",
        body: { title: title.trim(), content: content.trim() },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parent-posts"] });
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast({ description: "Newsletter published to parents." });
      setOpen(false);
      setTitle("");
      setContent("");
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Publish failed",
      });
    },
  });

  return (
    <>
      <button
        type="button"
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
        className={cn(
          "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)]",
          // Tablet tap target
          "min-h-[44px]",
          "bg-gradient-to-r from-[color:var(--color-brand)] to-[color:var(--color-brand-light)]",
          "text-white text-[13px] font-medium",
          "hover:opacity-90 transition-opacity",
          "disabled:opacity-50",
        )}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {generate.isPending ? "Drafting…" : "Generate weekly newsletter"}
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setOpen(false);
        }}
      >
        <DialogContent size="lg">
          <DialogTitle className="text-base font-semibold mb-3">
            Review weekly newsletter
          </DialogTitle>
          <div className="space-y-3">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
                Headline
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] min-h-[44px]"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
                Newsletter body (Markdown)
              </span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2.5 text-sm bg-[color:var(--color-cream-deep)] resize-y font-mono"
              />
            </label>
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => generate.mutate()}
                disabled={generate.isPending}
                className="text-[12px] font-medium text-[color:var(--color-muted)] hover:text-[color:var(--color-foreground)]"
              >
                Re-generate
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-[color:var(--color-muted)]"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={
                    !title.trim() ||
                    !content.trim() ||
                    publish.isPending
                  }
                  onClick={() => publish.mutate()}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)]",
                    "min-h-[44px]",
                    "bg-[color:var(--color-brand)] text-white text-[13px] font-medium",
                    "hover:bg-[color:var(--color-brand-hover)]",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <Send className="w-4 h-4" />
                  {publish.isPending ? "Publishing…" : "Publish to parents"}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
