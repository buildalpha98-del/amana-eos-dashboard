"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import {
  X,
  Wrench,
  Building,
  FileText,
  Lightbulb,
  AlertTriangle,
  MessageCircle,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface ReportToHOModalProps {
  open: boolean;
  onClose: () => void;
}

interface CategoryOption {
  id: string;
  label: string;
  icon: LucideIcon;
  feedbackCategory: string;
  placeholder: string;
}

const CATEGORIES: CategoryOption[] = [
  {
    id: "it",
    label: "IT / Technical Issue",
    icon: Wrench,
    feedbackCategory: "bug",
    placeholder: "Describe the technical issue you're experiencing...",
  },
  {
    id: "maintenance",
    label: "Maintenance Request",
    icon: Building,
    feedbackCategory: "general",
    placeholder: "What needs to be fixed or maintained...",
  },
  {
    id: "policy",
    label: "Policy Question",
    icon: FileText,
    feedbackCategory: "question",
    placeholder: "What policy question do you have...",
  },
  {
    id: "suggestion",
    label: "Suggestion / Idea",
    icon: Lightbulb,
    feedbackCategory: "feature_request",
    placeholder: "Share your idea or suggestion...",
  },
  {
    id: "incident",
    label: "Incident Report",
    icon: AlertTriangle,
    feedbackCategory: "bug",
    placeholder: "Describe what happened...",
  },
  {
    id: "general",
    label: "General Question",
    icon: MessageCircle,
    feedbackCategory: "question",
    placeholder: "How can Head Office help...",
  },
];

export function ReportToHOModal({ open, onClose }: ReportToHOModalProps) {
  const pathname = usePathname();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const category = CATEGORIES.find((c) => c.id === selectedCategory);

  const mutation = useMutation({
    mutationFn: async (data: {
      category: string;
      message: string;
      page: string;
    }) => {
      const res = await fetch("/api/internal-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ description: "Your message has been sent to Head Office" });
      setSelectedCategory(null);
      setMessage("");
      onClose();
    },
    onError: (err: Error) => {
      toast({ description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !message.trim()) return;
    mutation.mutate({
      category: category.feedbackCategory,
      message: message.trim(),
      page: pathname,
    });
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      setSelectedCategory(null);
      setMessage("");
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="mx-4 w-full max-w-lg rounded-xl bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Report to Head Office
            </h2>
            <p className="text-sm text-muted">
              Send a message directly to the Head Office team
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Category selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground/80">
              What is this about?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border-2 px-3 py-3 text-left text-sm transition-all",
                      isSelected
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-border bg-card text-foreground/80 hover:border-border hover:bg-surface",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4.5 w-4.5 shrink-0",
                        isSelected ? "text-brand" : "text-muted",
                      )}
                    />
                    <span className="font-medium">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <label
              htmlFor="ho-message"
              className="mb-1.5 block text-sm font-medium text-foreground/80"
            >
              Message
            </label>
            <textarea
              id="ho-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={category?.placeholder ?? "Select a category above..."}
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-surface/50 px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-brand focus:bg-card focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Page context */}
          <p className="text-[11px] text-muted truncate">
            Submitted from: {pathname}
          </p>

          {/* Submit */}
          <button
            type="submit"
            disabled={mutation.isPending || !selectedCategory || !message.trim()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors",
              "hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {mutation.isPending ? (
              "Sending..."
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send to Head Office
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
