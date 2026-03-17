"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { useCreateEmailTemplate } from "@/hooks/useEmailTemplates";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { value: "welcome", label: "Welcome" },
  { value: "newsletter", label: "Newsletter" },
  { value: "event", label: "Event" },
  { value: "announcement", label: "Announcement" },
  { value: "custom", label: "Custom" },
] as const;

export default function ImportTemplateModal({ open, onClose }: Props) {
  const createTemplate = useCreateEmailTemplate();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("newsletter");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !subject.trim() || !html.trim()) {
      toast({ description: "Name, subject, and HTML are required" });
      return;
    }

    try {
      await createTemplate.mutateAsync({
        name: name.trim(),
        category: category as "welcome" | "newsletter" | "event" | "announcement" | "custom",
        subject: subject.trim(),
        htmlContent: html.trim(),
      });
      setName("");
      setCategory("newsletter");
      setSubject("");
      setHtml("");
      onClose();
    } catch {
      toast({ description: "Failed to import template" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Import Template</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="max-h-[85vh] overflow-y-auto p-5 space-y-4"
        >
          <p className="text-xs text-muted">
            In Zoho Campaigns, go to your template &rarr; Export &rarr; Copy
            HTML. Paste it below.
          </p>

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. March Newsletter"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="mb-1 block text-sm font-medium">
              Subject Line
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Amana OSHC March Update"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          {/* HTML */}
          <div>
            <label className="mb-1 block text-sm font-medium">HTML</label>
            <textarea
              required
              rows={12}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="<html>...</html>"
              className="w-full rounded-md border border-border bg-surface px-4 py-3 font-mono text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted hover:bg-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTemplate.isPending}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {createTemplate.isPending ? "Importing..." : "Import Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
