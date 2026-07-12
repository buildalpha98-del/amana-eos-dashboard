"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Button } from "@/components/ui/Button";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import {
  useAuditTemplates,
  useCreateAuditInstance,
  useUpdateAuditInstance,
  type AuditInstanceSummary,
} from "@/hooks/useAudits";

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  year: number;
  month?: number;
  editing?: AuditInstanceSummary | null;
}

export function AuditEditModal({ open, onClose, year, month, editing }: Props) {
  useEscapeClose(onClose, open);
  const { data: templates = [] } = useAuditTemplates();
  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      // /api/services may return either `{ services: [...] }` or a bare array.
      // fetchApi gives us error context + timeout + content-type checks for free.
      const payload = await fetchApi<{ services?: ServiceOption[] } | ServiceOption[]>(
        "/api/services?limit=100",
      );
      return Array.isArray(payload) ? payload : payload.services ?? [];
    },
    staleTime: 60_000,
    retry: 2,
  });

  const createMutation = useCreateAuditInstance();
  const updateMutation = useUpdateAuditInstance();

  const [templateId, setTemplateId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [scheduledMonth, setScheduledMonth] = useState(month ?? 1);
  const [scheduledYear, setScheduledYear] = useState(year);

  useEffect(() => {
    if (editing) {
      setTemplateId(editing.template.id);
      setServiceId(editing.service.id);
      setScheduledMonth(editing.scheduledMonth);
      setScheduledYear(editing.scheduledYear);
    } else {
      setTemplateId("");
      setServiceId("");
      setScheduledMonth(month ?? 1);
      setScheduledYear(year);
    }
  }, [editing, month, year, open]);

  if (!open) return null;

  const isEditing = !!editing;
  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = templateId && serviceId && scheduledMonth >= 1 && scheduledMonth <= 12;

  const handleSubmit = async () => {
    try {
      if (isEditing && editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          templateId,
          serviceId,
          scheduledMonth,
          scheduledYear,
        });
      } else {
        await createMutation.mutateAsync({
          templateId,
          serviceId,
          scheduledMonth,
          scheduledYear,
        });
      }
      onClose();
    } catch {
      // Error surfaced by toast in the mutation's onError
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? "Edit audit" : "Schedule audit"}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-surface">
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-foreground/80">Template</span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">Select a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (QA{t.qualityArea})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground/80">Service</span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">Select a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Month</span>
              <select
                value={scheduledMonth}
                onChange={(e) => setScheduledMonth(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString("en-AU", { month: "long" })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Year</span>
              <input
                type="number"
                value={scheduledYear}
                onChange={(e) => setScheduledYear(Number(e.target.value))}
                min={2020}
                max={2100}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-3 border-t bg-surface/30">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            loading={isPending}
            onClick={handleSubmit}
          >
            {isEditing ? "Save changes" : "Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
