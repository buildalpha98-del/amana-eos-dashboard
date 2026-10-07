"use client";

import { useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { mutateApi } from "@/lib/fetch-api";

const CATEGORIES = [
  { value: "bug", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "question", label: "Question" },
  { value: "general", label: "General Feedback" },
] as const;

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const pathname = usePathname();

  const mutation = useMutation({
    mutationFn: (data: { category: string; message: string; page: string }) =>
      mutateApi("/api/internal-feedback", { method: "POST", body: data }),
    onSuccess: () => {
      toast({ description: "Feedback submitted — thank you!" });
      setMessage("");
      setCategory("general");
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    mutation.mutate({ category, message: message.trim(), page: pathname });
  };

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            // Secondary to the AI pill stacked above it on phones, so it's
            // the quieter outline style. Phone offset clears the tab bar
            // plus the iOS home-indicator inset (bottom-20 alone sat on top
            // of the More tab — 2026-10-07).
            "fixed z-50 flex h-11 w-11 items-center justify-center",
            "rounded-full border border-border bg-card text-brand shadow-lg transition-all",
            "hover:bg-surface hover:scale-105 active:scale-95",
            "right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:right-6 md:bottom-6",
          )}
          aria-label="Send feedback"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </button>
      )}

      {/* Feedback popover */}
      {open && (
        <div
          className={cn(
            "fixed z-50 w-[calc(100vw-2rem)] max-w-96",
            "rounded-xl border border-border bg-card shadow-2xl",
            "right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:right-6 md:bottom-6",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">
              Send Feedback
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground transition-colors"
              aria-label="Close feedback form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {/* Category select */}
            <div>
              <label
                htmlFor="fb-category"
                className="block text-xs font-medium text-muted mb-1"
              >
                Category
              </label>
              <select
                id="fb-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Message textarea */}
            <div>
              <label
                htmlFor="fb-message"
                className="block text-xs font-medium text-muted mb-1"
              >
                Message
              </label>
              <textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's on your mind..."
                rows={4}
                className="w-full resize-none rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {/* Page badge */}
            <p className="text-xs text-muted truncate">
              Page: {pathname}
            </p>

            {/* Submit */}
            <button
              type="submit"
              disabled={mutation.isPending || !message.trim()}
              className={cn(
                "w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors",
                "hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {mutation.isPending ? "Submitting..." : "Submit Feedback"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
