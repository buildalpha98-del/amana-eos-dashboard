"use client";

import { useState } from "react";
import { FileText, Star, X, Download } from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  useEmailTemplates,
  type EmailTemplateData,
} from "@/hooks/useEmailTemplates";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (template: EmailTemplateData) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  enrolment: "Enrolment",
  nurture: "Nurture / Onboarding",
  welcome: "Welcome",
  newsletter: "Newsletter",
  event: "Event",
  announcement: "Announcement",
  custom: "Custom",
};

export default function TemplatePickerModal({
  open,
  onClose,
  onSelect,
}: Props) {
  const { data: templates, isLoading } = useEmailTemplates();
  const queryClient = useQueryClient();
  const [seeding, setSeeding] = useState(false);

  if (!open) return null;

  async function handleSeedTemplates() {
    setSeeding(true);
    try {
      const res = await fetch("/api/email-templates/seed", { method: "POST" });
      if (!res.ok) throw new Error("Failed to seed templates");
      const data = await res.json();
      toast({ description: `Loaded ${data.created} templates (${data.skipped} already existed)` });
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    } catch {
      toast({ description: "Failed to load default templates" });
    } finally {
      setSeeding(false);
    }
  }

  // Group by category
  const grouped: Record<string, EmailTemplateData[]> = {};
  for (const t of templates || []) {
    const cat = t.category || "custom";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  }

  function handleSelect(template: EmailTemplateData) {
    onSelect(template);
    onClose();
  }

  function handleBlank() {
    onSelect({
      id: "",
      name: "Blank",
      category: "custom",
      subject: "",
      htmlContent: null,
      blocks: [],
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Choose a Template</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[80vh] overflow-y-auto p-5 space-y-5">
          {isLoading && (
            <p className="text-sm text-muted">Loading templates...</p>
          )}

          {!isLoading && Object.keys(grouped).length === 0 && (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted">No templates found.</p>
              <button
                type="button"
                onClick={handleSeedTemplates}
                disabled={seeding}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {seeding ? "Loading..." : "Load Default Templates"}
              </button>
            </div>
          )}

          {!isLoading && Object.keys(grouped).length > 0 && (
            <button
              type="button"
              onClick={handleSeedTemplates}
              disabled={seeding}
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand transition-colors disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {seeding ? "Loading..." : "Load missing default templates"}
            </button>
          )}

          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {CATEGORY_LABELS[category] || category}
              </h3>
              <div className="space-y-2">
                {items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelect(t)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:border-brand hover:bg-brand/5"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {t.name}
                        </span>
                        {t.isDefault && (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                        )}
                      </div>
                      {t.subject && (
                        <p className="truncate text-xs text-muted">
                          {t.subject}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Start Blank */}
          <button
            type="button"
            onClick={handleBlank}
            className="w-full rounded-lg border border-dashed border-border p-3 text-center text-sm font-medium text-muted hover:border-brand hover:text-brand"
          >
            Start Blank
          </button>
        </div>
      </div>
    </div>
  );
}
