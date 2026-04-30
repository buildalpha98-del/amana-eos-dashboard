"use client";

import { useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/useToast";
import {
  useUpdateTemplate,
  type AuditTemplateSummary,
} from "@/hooks/useAudits";
import { cn } from "@/lib/utils";

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface Props {
  open: boolean;
  onClose: () => void;
  template: AuditTemplateSummary | null;
}

/**
 * Thin wrapper that mounts the inner modal only when open+template are both
 * set. This way the inner component's useState initialisers run fresh on each
 * open, avoiding setState-in-effect patterns.
 */
export function EditTemplateModal(props: Props) {
  if (!props.open || !props.template) return null;
  return <EditTemplateModalInner {...props} template={props.template} />;
}

function EditTemplateModalInner({
  onClose,
  template,
}: Omit<Props, "open" | "template"> & { template: AuditTemplateSummary }) {
  const updateMut = useUpdateTemplate();

  const sortedTemplateMonths = [...template.scheduledMonths].sort((a, b) => a - b);

  const [name, setName] = useState(template.name);
  const [nqsReference, setNqsReference] = useState(template.nqsReference);
  const [qualityArea, setQualityArea] = useState(template.qualityArea);
  const [frequency, setFrequency] = useState<"monthly" | "half_yearly" | "yearly">(
    template.frequency as "monthly" | "half_yearly" | "yearly",
  );
  const [responseFormat, setResponseFormat] = useState(template.responseFormat);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | "">(
    template.estimatedMinutes ?? "",
  );
  const [scheduledMonths, setScheduledMonths] = useState<number[]>(sortedTemplateMonths);
  const [isActive, setIsActive] = useState(template.isActive);
  const [showRespreadConfirm, setShowRespreadConfirm] = useState(false);
  const [initialScheduledMonths] = useState<number[]>(sortedTemplateMonths);

  const monthsChanged =
    scheduledMonths.length !== initialScheduledMonths.length ||
    scheduledMonths.some((m, i) => m !== initialScheduledMonths[i]);

  const toggleMonth = (m: number) => {
    setScheduledMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b),
    );
  };

  const canSubmit = name.trim().length > 0 && !updateMut.isPending;

  const doUpdate = async (respreadFutureInstances: boolean) => {
    const payload: { id: string; [key: string]: unknown } = {
      id: template.id,
      name: name.trim(),
      nqsReference,
      qualityArea,
      frequency,
      responseFormat,
      estimatedMinutes: estimatedMinutes === "" ? undefined : estimatedMinutes,
      scheduledMonths,
      isActive,
    };
    if (monthsChanged) payload.respreadFutureInstances = respreadFutureInstances;

    try {
      const result = (await updateMut.mutateAsync(payload)) as
        | { respread?: { deleted: number; recreated: number } }
        | undefined;
      const respread = result?.respread;
      if (respread) {
        toast({
          description: `Template saved. Respread ${respread.recreated} future instance(s), removed ${respread.deleted}.`,
        });
      } else {
        toast({ description: "Template saved." });
      }
      onClose();
    } catch {
      // toast handled by mutation onError
    }
  };

  const handleSubmit = () => {
    if (monthsChanged && template._count.instances > 0) {
      setShowRespreadConfirm(true);
      return;
    }
    void doUpdate(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Edit template</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-foreground/80">Name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground/80">NQS reference</span>
            <input
              value={nqsReference}
              onChange={(e) => setNqsReference(e.target.value)}
              placeholder="e.g. 2.1.2"
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Quality area</span>
              <select
                value={qualityArea}
                onChange={(e) => setQualityArea(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((qa) => (
                  <option key={qa} value={qa}>
                    QA{qa}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Frequency</span>
              <select
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as "monthly" | "half_yearly" | "yearly")
                }
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              >
                <option value="monthly">Monthly</option>
                <option value="half_yearly">Half-yearly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">Response format</span>
              <select
                value={responseFormat}
                onChange={(e) => setResponseFormat(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              >
                <option value="yes_no">Yes / No</option>
                <option value="rating_1_5">Rating 1–5</option>
                <option value="compliant">Compliant</option>
                <option value="reverse_yes_no">Reverse Y/N</option>
                <option value="review_date">Review date</option>
                <option value="inventory">Inventory</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground/80">
                Estimated minutes
              </span>
              <input
                type="number"
                value={estimatedMinutes}
                onChange={(e) =>
                  setEstimatedMinutes(e.target.value === "" ? "" : Number(e.target.value))
                }
                min={0}
                className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-medium text-foreground/80">Scheduled months</span>
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {monthNames.map((label, idx) => {
                const monthNum = idx + 1;
                const active = scheduledMonths.includes(monthNum);
                return (
                  <button
                    key={monthNum}
                    type="button"
                    onClick={() => toggleMonth(monthNum)}
                    className={cn(
                      "text-xs font-medium py-1.5 rounded-lg border transition-colors",
                      active
                        ? "bg-brand text-white border-brand"
                        : "bg-card text-foreground/80 border-border hover:bg-surface",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {scheduledMonths.length === 0 && (
              <p className="text-xs text-amber-600 mt-1.5">
                Template will have no scheduled months — future calendar uploads won&apos;t
                auto-generate instances.
              </p>
            )}
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-sm text-foreground/80">Template is active</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-surface/30">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-60 flex items-center gap-1.5"
          >
            {updateMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>

      {showRespreadConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center gap-2 px-6 py-4 border-b">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-semibold text-foreground">
                Respread existing audits?
              </h3>
            </div>
            <div className="px-6 py-4 space-y-2 text-sm text-foreground/80">
              <p>
                This template has {template._count.instances} existing audit
                {template._count.instances === 1 ? "" : "s"}. Should scheduled future
                audits be moved to the new months, or left on their current months?
              </p>
              <p className="text-xs text-muted">
                Past, in-progress, and completed audits are never touched.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t bg-surface/30">
              <button
                type="button"
                onClick={() => setShowRespreadConfirm(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRespreadConfirm(false);
                  void doUpdate(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-brand text-brand hover:bg-brand/5"
              >
                Respread future
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRespreadConfirm(false);
                  void doUpdate(false);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand/90"
              >
                Leave alone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
