"use client";

/**
 * Regulation 90 plans for one child.
 *
 * Sits under the Medical tab because that's where someone looks when
 * they ask "what do I do if this child reacts?" — and until now the
 * honest answer the dashboard could give was a string in an array and a
 * boolean saying a plan existed somewhere.
 *
 * The card leads with the emergency response rather than the paperwork.
 * A PDF in blob storage is no use to an educator holding a wheezing
 * child; the steps have to be readable on the screen they already have
 * open.
 *
 * One card per CONDITION. A child with asthma and a nut allergy gets two,
 * because the responses are different and merging them is how someone
 * reaches for the wrong one.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  HeartPulse,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { assessPlan, describeIssue } from "@/lib/medical-plan-status";

interface Plan {
  id: string;
  conditionType: string;
  condition: string;
  severity: string;
  managementPlanUrl: string | null;
  managementPlanFileName: string | null;
  practitionerName: string | null;
  planExpiryDate: string | null;
  riskMinimisationPlan: string;
  communicationPlan: string;
  developedWithParentAt: string | null;
  emergencyResponse: string | null;
  medicationRequired: boolean;
  medicationDetails: string | null;
  medicationLocation: string | null;
  parentAcknowledgedAt: string | null;
  parentAcknowledgedName: string | null;
  reviewDueAt: string | null;
  lastReviewedAt: string | null;
  status: string;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const CONDITION_TYPES = [
  { value: "anaphylaxis", label: "Anaphylaxis" },
  { value: "asthma", label: "Asthma" },
  { value: "diabetes", label: "Diabetes" },
  { value: "epilepsy", label: "Epilepsy" },
  { value: "allergy", label: "Allergy (non-anaphylactic)" },
  { value: "dietary", label: "Dietary requirement" },
  { value: "other", label: "Other" },
];

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export function MedicalPlansCard({
  childId,
  canEdit,
}: {
  childId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const key = ["child", childId, "medical-plans"];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    conditionType: "anaphylaxis",
    condition: "",
    severity: "severe",
    emergencyResponse: "",
    riskMinimisationPlan: "",
    communicationPlan: "",
    practitionerName: "",
    planExpiryDate: "",
    medicationDetails: "",
    medicationLocation: "",
    developedWithParent: false,
  });

  const { data, isLoading } = useQuery<{ plans: Plan[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/children/${childId}/medical-plans`),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/children/${childId}/medical-plans`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setAdding(false);
      setForm({
        conditionType: "anaphylaxis",
        condition: "",
        severity: "severe",
        emergencyResponse: "",
        riskMinimisationPlan: "",
        communicationPlan: "",
        practitionerName: "",
        planExpiryDate: "",
        medicationDetails: "",
        medicationLocation: "",
        developedWithParent: false,
      });
      toast({ description: "Plan added." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const review = useMutation({
    mutationFn: (planId: string) =>
      mutateApi(`/api/children/${childId}/medical-plans/${planId}`, {
        method: "PATCH",
        body: { markReviewed: true },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ description: "Marked as reviewed." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const archive = useMutation({
    mutationFn: (planId: string) =>
      mutateApi(`/api/children/${childId}/medical-plans/${planId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ description: "Plan archived — it stays readable in history." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;

  const plans = data?.plans ?? [];

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <HeartPulse className="h-4 w-4 text-brand" />
            Medical conditions plans
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Regulation 90 — a management plan, a risk minimisation plan, and a
            communication plan, for each condition.
          </p>
        </div>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Add plan
          </Button>
        )}
      </div>

      {plans.length === 0 && !adding && (
        <p className="text-sm text-muted">
          No plans recorded. If this child has an allergy, asthma, or any
          condition needing a response, Reg 90 requires all three plans.
        </p>
      )}

      {plans.map((p) => {
        const status = assessPlan(p);
        return (
          <div
            key={p.id}
            className={`rounded-lg border p-4 ${
              status.urgent
                ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {p.condition}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-2xs ${
                      p.severity === "severe"
                        ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200"
                        : "bg-surface text-muted"
                    }`}
                  >
                    {p.severity}
                  </span>
                </p>
                <p className="text-2xs text-muted">
                  {p.practitionerName
                    ? `Plan by ${p.practitionerName}`
                    : "No practitioner recorded"}
                  {p.planExpiryDate && ` · expires ${fmt(p.planExpiryDate)}`}
                </p>
              </div>
              {status.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 ${
                    status.urgent ? "text-red-600" : "text-amber-600"
                  }`}
                />
              )}
            </div>

            {status.issues.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {status.issues.map((i) => (
                  <li key={i} className="text-2xs text-red-700 dark:text-red-300">
                    {describeIssue(i)}
                  </li>
                ))}
              </ul>
            )}

            {/* Emergency response first — the thing someone needs while
                holding the child, not the paperwork about it. */}
            {p.emergencyResponse && (
              <div className="mt-3 rounded-lg bg-surface p-3">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
                  If it happens
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {p.emergencyResponse}
                </p>
              </div>
            )}

            {p.medicationRequired && (
              <p className="mt-2 text-xs text-foreground">
                <strong>Medication:</strong> {p.medicationDetails || "—"}
                {p.medicationLocation && ` · kept ${p.medicationLocation}`}
              </p>
            )}

            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-brand">
                Risk minimisation &amp; communication plans
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
                    Risk minimisation
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {p.riskMinimisationPlan}
                  </p>
                </div>
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
                    Communication
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {p.communicationPlan}
                  </p>
                </div>
              </div>
            </details>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-2xs text-muted">
              {p.managementPlanUrl && (
                <a
                  href={p.managementPlanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  <FileText className="h-3 w-3" />
                  {p.managementPlanFileName || "Management plan"}
                </a>
              )}
              <span>Reviewed {fmt(p.lastReviewedAt)}</span>
              {p.parentAcknowledgedAt && (
                <span>
                  Confirmed by {p.parentAcknowledgedName} on{" "}
                  {fmt(p.parentAcknowledgedAt)}
                </span>
              )}
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => review.mutate(p.id)}
                    className="text-brand hover:underline"
                  >
                    Mark reviewed
                  </button>
                  <button
                    type="button"
                    onClick={() => archive.mutate(p.id)}
                    className="text-muted hover:text-red-600 hover:underline"
                  >
                    Archive
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {adding && canEdit && (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-muted">
              Condition type
              <select
                className={`${field} mt-1`}
                value={form.conditionType}
                onChange={(e) =>
                  setForm({ ...form, conditionType: e.target.value })
                }
              >
                {CONDITION_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Severity
              <select
                className={`${field} mt-1`}
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </label>
          </div>

          <label className="block text-xs font-medium text-muted">
            Condition, as it should read on the medical wall
            <input
              className={`${field} mt-1`}
              placeholder="e.g. Anaphylaxis — peanut and tree nut"
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
            />
          </label>

          <label className="block text-xs font-medium text-muted">
            If it happens — the steps, in order
            <textarea
              className={`${field} mt-1`}
              rows={3}
              placeholder="1. Lay flat, do not stand. 2. Give EpiPen to outer thigh. 3. Call 000…"
              value={form.emergencyResponse}
              onChange={(e) =>
                setForm({ ...form, emergencyResponse: e.target.value })
              }
            />
          </label>

          <label className="block text-xs font-medium text-muted">
            Risk minimisation plan <span className="text-red-600">*</span>
            <textarea
              className={`${field} mt-1`}
              rows={3}
              placeholder="What we do day to day so it doesn't happen — no nut products, hand washing before food…"
              value={form.riskMinimisationPlan}
              onChange={(e) =>
                setForm({ ...form, riskMinimisationPlan: e.target.value })
              }
            />
          </label>

          <label className="block text-xs font-medium text-muted">
            Communication plan <span className="text-red-600">*</span>
            <textarea
              className={`${field} mt-1`}
              rows={2}
              placeholder="How staff — including a casual who's never met this child — find out, and how the family tells us when things change."
              value={form.communicationPlan}
              onChange={(e) =>
                setForm({ ...form, communicationPlan: e.target.value })
              }
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-muted">
              Practitioner who signed the plan
              <input
                className={`${field} mt-1`}
                value={form.practitionerName}
                onChange={(e) =>
                  setForm({ ...form, practitionerName: e.target.value })
                }
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              Plan review date
              <input
                type="date"
                className={`${field} mt-1`}
                value={form.planExpiryDate}
                onChange={(e) =>
                  setForm({ ...form, planExpiryDate: e.target.value })
                }
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-muted">
              Medication
              <input
                className={`${field} mt-1`}
                placeholder="EpiPen Jr 150mcg"
                value={form.medicationDetails}
                onChange={(e) =>
                  setForm({ ...form, medicationDetails: e.target.value })
                }
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              Where it&apos;s kept
              <input
                className={`${field} mt-1`}
                placeholder="Office medical cupboard, red pouch"
                value={form.medicationLocation}
                onChange={(e) =>
                  setForm({ ...form, medicationLocation: e.target.value })
                }
              />
            </label>
          </div>

          {/* Reg 90(1)(c)(ii) — consultation is the part that gets
              challenged, so it is recorded rather than assumed. */}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={form.developedWithParent}
              onChange={(e) =>
                setForm({ ...form, developedWithParent: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-sm text-foreground">
              Developed with the family
              <span className="block text-xs text-muted">
                Reg 90 requires the risk minimisation plan be written in
                consultation with them. Leave unticked until it has been.
              </span>
            </span>
          </label>

          <div className="flex gap-2">
            <Button
              disabled={
                create.isPending ||
                !form.condition.trim() ||
                !form.riskMinimisationPlan.trim() ||
                !form.communicationPlan.trim()
              }
              onClick={() =>
                create.mutate({
                  conditionType: form.conditionType,
                  condition: form.condition.trim(),
                  severity: form.severity,
                  riskMinimisationPlan: form.riskMinimisationPlan.trim(),
                  communicationPlan: form.communicationPlan.trim(),
                  ...(form.emergencyResponse.trim()
                    ? { emergencyResponse: form.emergencyResponse.trim() }
                    : {}),
                  ...(form.practitionerName.trim()
                    ? { practitionerName: form.practitionerName.trim() }
                    : {}),
                  ...(form.planExpiryDate
                    ? { planExpiryDate: form.planExpiryDate }
                    : {}),
                  ...(form.medicationDetails.trim()
                    ? {
                        medicationRequired: true,
                        medicationDetails: form.medicationDetails.trim(),
                      }
                    : {}),
                  ...(form.medicationLocation.trim()
                    ? { medicationLocation: form.medicationLocation.trim() }
                    : {}),
                  ...(form.developedWithParent
                    ? { developedWithParentAt: new Date().toISOString() }
                    : {}),
                })
              }
            >
              {create.isPending ? "Saving…" : "Add plan"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
