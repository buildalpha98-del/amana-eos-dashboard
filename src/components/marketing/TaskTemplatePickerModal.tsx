"use client";

import { useState, useEffect } from "react";
import {
  X,
  Zap,
  ChevronDown,
  ChevronUp,
  Calendar,
  FolderOpen,
  MapPin,
} from "lucide-react";
import {
  useMarketingTaskTemplates,
  useApplyMarketingTaskTemplate,
  useCampaigns,
} from "@/hooks/useMarketing";
import { useServices } from "@/hooks/useServices";
import { toast } from "@/hooks/useToast";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Social Media": "bg-blue-100 text-blue-700",
  Content: "bg-purple-100 text-purple-700",
  Community: "bg-green-100 text-green-700",
  Events: "bg-amber-100 text-amber-700",
  Communications: "bg-cyan-100 text-cyan-700",
  Brand: "bg-rose-100 text-rose-700",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-gray-300",
};

export function TaskTemplatePickerModal({ open, onClose }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startDate, setStartDate] = useState("");

  const { data: templates, isLoading } = useMarketingTaskTemplates();
  const { data: campaigns } = useCampaigns();
  const { data: services } = useServices("active");
  const applyTemplate = useApplyMarketingTaskTemplate();

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setExpandedId(null);
      setSelectedId(null);
      setCampaignId("");
      setServiceId("");
      setStartDate("");
    }
  }, [open]);

  if (!open) return null;

  const sortedServices = [...(services ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const handleApply = async () => {
    if (!selectedId) return;

    try {
      const result = await applyTemplate.mutateAsync({
        templateId: selectedId,
        campaignId: campaignId || undefined,
        serviceId: serviceId || undefined,
        startDate: startDate || undefined,
      });

      toast({
        title: "Template applied",
        description: `Created ${result.created} tasks from template.`,
      });

      onClose();
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to apply template",
        variant: "destructive",
      });
    }
  };

  const selectedTemplate = templates?.find((t) => t.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-card rounded-xl shadow-2xl flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-semibold text-foreground">
              Quick Start from Template
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted text-sm">
              Loading templates...
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted text-sm">
              No templates available. Run the seed script to create them.
            </div>
          ) : (
            templates.map((template) => {
              const isExpanded = expandedId === template.id;
              const isSelected = selectedId === template.id;

              return (
                <div
                  key={template.id}
                  className={`rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? "border-brand bg-brand/5"
                      : "border-border hover:border-border bg-card"
                  }`}
                  onClick={() =>
                    setSelectedId(isSelected ? null : template.id)
                  }
                >
                  {/* Template Card Header */}
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {template.name}
                          </h3>
                          {template.category && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                CATEGORY_COLORS[template.category] ??
                                "bg-surface text-muted"
                              }`}
                            >
                              {template.category}
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-xs text-muted line-clamp-2">
                            {template.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted">
                          {template.items.length} tasks
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(isExpanded ? null : template.id);
                          }}
                          className="rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Task List */}
                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-3">
                      <div className="space-y-1.5">
                        {template.items.map((item, idx) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2.5 text-xs"
                          >
                            <span className="shrink-0 w-5 text-right text-muted font-mono">
                              {idx + 1}.
                            </span>
                            <span
                              className={`shrink-0 h-1.5 w-1.5 rounded-full ${
                                PRIORITY_DOT[item.priority] ?? "bg-gray-300"
                              }`}
                            />
                            <span className="flex-1 text-foreground/80 truncate">
                              {item.title}
                            </span>
                            <span className="shrink-0 text-muted font-mono">
                              +{item.daysOffset}d
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Options Panel (shown when a template is selected) */}
        {selectedTemplate && (
          <div className="border-t border-border px-6 py-4 bg-surface/50">
            <p className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
              Optional Settings
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Campaign Dropdown */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Campaign
                </label>
                <select
                  value={campaignId}
                  onChange={(e) => setCampaignId(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground/80 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="">None</option>
                  {(campaigns ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Centre Dropdown */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Centre
                </label>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground/80 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="">None</option>
                  {sortedServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted mb-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground/80 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedId || applyTemplate.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className="h-4 w-4" />
            {applyTemplate.isPending ? "Applying..." : "Apply Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
