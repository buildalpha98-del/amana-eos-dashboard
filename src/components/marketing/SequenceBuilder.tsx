"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  Link2,
} from "lucide-react";
import { useUpdateSequence } from "@/hooks/useSequences";
import type { SequenceData } from "@/hooks/useSequences";
import type { EmailTemplateData } from "@/hooks/useEmailTemplates";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

const TemplatePickerModal = dynamic(
  () => import("@/components/email/TemplatePickerModal"),
  { ssr: false },
);

interface Props {
  sequence: SequenceData;
  onClose: () => void;
}

interface StepDraft {
  id?: string;
  name: string;
  delayHours: number;
  templateKey: string;
  emailTemplateId: string | null;
  emailTemplateName: string | null;
  order: number;
}

const PARENT_STAGES = [
  "info_sent",
  "nurturing",
  "form_started",
  "first_session",
] as const;

const CRM_STAGES = [
  "new_lead",
  "reviewing",
  "contact_made",
  "follow_up_1",
  "follow_up_2",
  "meeting_booked",
  "proposal_sent",
  "submitted",
  "negotiating",
] as const;

function formatStageLabel(stage: string) {
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SequenceBuilder({ sequence, onClose }: Props) {
  const updateSequence = useUpdateSequence();

  const [name, setName] = useState(sequence.name);
  const [triggerStage, setTriggerStage] = useState(sequence.triggerStage);
  const [steps, setSteps] = useState<StepDraft[]>(
    () =>
      (sequence.steps ?? []).map((s, i) => ({
        id: s.id,
        name: s.name,
        delayHours: s.delayHours,
        templateKey: s.templateKey ?? "",
        emailTemplateId: s.emailTemplateId ?? null,
        emailTemplateName: s.emailTemplate?.name ?? null,
        order: i,
      })),
  );

  const [linkingStepIndex, setLinkingStepIndex] = useState<number | null>(null);

  const stages =
    sequence.type === "parent_nurture" ? PARENT_STAGES : CRM_STAGES;

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        name: `Step ${prev.length + 1}`,
        delayHours: 24,
        templateKey: "",
        emailTemplateId: null,
        emailTemplateName: null,
        order: prev.length,
      },
    ]);
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })),
    );
  }, []);

  const moveStep = useCallback((index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const updateStep = useCallback(
    (index: number, patch: Partial<StepDraft>) => {
      setSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      );
    },
    [],
  );

  function handleSave() {
    updateSequence.mutate(
      {
        id: sequence.id,
        name,
        triggerStage,
        steps: steps.map((s) => ({
          id: s.id,
          name: s.name,
          delayHours: s.delayHours,
          templateKey: s.templateKey,
          emailTemplateId: s.emailTemplateId || undefined,
          order: s.order,
        })),
      },
      {
        onSuccess: () => {
          toast({ description: "Sequence saved" });
          onClose();
        },
        onError: () => {
          toast({ description: "Failed to save sequence" });
        },
      },
    );
  }

  /** Convert delayHours to display unit */
  function getDelayDisplay(hours: number) {
    if (hours > 0 && hours % 24 === 0) {
      return { value: hours / 24, unit: "days" as const };
    }
    return { value: hours, unit: "hours" as const };
  }

  function setDelay(index: number, value: number, unit: "hours" | "days") {
    const hours = unit === "days" ? value * 24 : value;
    updateStep(index, { delayHours: hours });
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-foreground/30 focus:border-b focus:border-brand"
              placeholder="Sequence name"
            />
            <span
              className={cn(
                "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                sequence.type === "parent_nurture"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-100 text-blue-700",
              )}
            >
              {sequence.type === "parent_nurture"
                ? "Parent Nurture"
                : "CRM Outreach"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Trigger Stage */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground/50">
              Trigger Stage
            </label>
            <select
              value={triggerStage ?? ""}
              onChange={(e) => setTriggerStage(e.target.value || null)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {stages.map((stage) => (
                <option key={stage} value={stage}>
                  {formatStageLabel(stage)}
                </option>
              ))}
            </select>
          </div>

          {/* Steps Timeline */}
          <div>
            <label className="mb-3 block text-xs font-medium text-foreground/50">
              Steps
            </label>

            <div className="relative">
              {/* Connecting line */}
              {steps.length > 1 && (
                <div className="absolute left-4 top-4 bottom-4 w-px border-l-2 border-dashed border-border" />
              )}

              <div className="space-y-4">
                {steps.map((step, index) => {
                  const delay = getDelayDisplay(step.delayHours);

                  return (
                    <div key={step.id ?? index} className="relative flex gap-3">
                      {/* Step number circle */}
                      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                        {index + 1}
                      </div>

                      {/* Step details */}
                      <div className="min-w-0 flex-1 rounded-xl border border-border bg-background p-3 space-y-2">
                        {/* Name */}
                        <input
                          value={step.name}
                          onChange={(e) =>
                            updateStep(index, { name: e.target.value })
                          }
                          className="w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-foreground/30"
                          placeholder="Step name"
                        />

                        {/* Delay */}
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-foreground/50">
                            Delay:
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={delay.value}
                            onChange={(e) =>
                              setDelay(
                                index,
                                parseInt(e.target.value) || 0,
                                delay.unit,
                              )
                            }
                            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-brand focus:outline-none"
                          />
                          <select
                            value={delay.unit}
                            onChange={(e) =>
                              setDelay(
                                index,
                                delay.value,
                                e.target.value as "hours" | "days",
                              )
                            }
                            className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-brand focus:outline-none"
                          >
                            <option value="hours">hours</option>
                            <option value="days">days</option>
                          </select>
                        </div>

                        {/* Template link */}
                        <div className="flex items-center gap-2 text-xs">
                          <Link2 className="h-3 w-3 text-foreground/40" />
                          {step.emailTemplateName ? (
                            <span className="text-foreground">
                              {step.emailTemplateName}
                            </span>
                          ) : (
                            <span className="text-foreground/40">
                              Default ({step.templateKey || "none"})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setLinkingStepIndex(index)}
                            className="ml-auto text-xs text-brand hover:underline"
                          >
                            {step.emailTemplateName ? "Change" : "Link Template"}
                          </button>
                        </div>

                        {/* Reorder + delete */}
                        <div className="flex items-center gap-1 pt-1 border-t border-border">
                          <button
                            onClick={() => moveStep(index, -1)}
                            disabled={index === 0}
                            className="rounded p-1 text-foreground/40 transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => moveStep(index, 1)}
                            disabled={index === steps.length - 1}
                            className="rounded p-1 text-foreground/40 transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeStep(index)}
                            className="ml-auto rounded p-1 text-red-500 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add Step */}
            <button
              onClick={addStep}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-foreground/50 transition-colors hover:border-brand hover:text-brand"
            >
              <Plus className="h-4 w-4" />
              Add Step
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateSequence.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {updateSequence.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Save
          </button>
        </div>
      </div>

      {/* Template picker modal */}
      <TemplatePickerModal
        open={linkingStepIndex !== null}
        onClose={() => setLinkingStepIndex(null)}
        onSelect={(template: EmailTemplateData) => {
          if (linkingStepIndex !== null) {
            updateStep(linkingStepIndex, {
              emailTemplateId: template.id || null,
              emailTemplateName: template.name || null,
            });
          }
          setLinkingStepIndex(null);
        }}
      />
    </div>
  );
}
