"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, ArrowLeft, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useContractTemplates,
  usePreviewContractTemplate,
  useIssueFromTemplate,
} from "@/hooks/useContractTemplates";
import { fetchApi } from "@/lib/fetch-api";
import type { UserOption } from "./constants";
import { SignaturePad } from "./SignaturePad";
import {
  deriveCustomFields,
  type DerivedCustomField,
} from "@/lib/contract-templates/extract-merge-tags";
import type { TipTapDoc } from "@/lib/contract-templates/render-html";
import { MERGE_TAGS_BY_KEY } from "@/lib/contract-templates/merge-tag-catalog";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  AWARD_LEVELS,
  AWARD_LEVEL_LABELS,
} from "./constants";

type Step = 1 | 2 | 3 | 4 | 5;

type ContractMetaState = {
  contractType: "ct_casual" | "ct_part_time" | "ct_permanent" | "ct_fixed_term";
  awardLevel: string | null;
  awardLevelCustom: string | null;
  payRate: number | string;
  hoursPerWeek: number | string;
  startDate: string;
  endDate: string;
  position: string;
};

const INITIAL_CONTRACT_META: ContractMetaState = {
  contractType: "ct_part_time",
  awardLevel: null,
  awardLevelCustom: null,
  payRate: "",
  hoursPerWeek: "",
  startDate: "",
  endDate: "",
  position: "",
};

export function IssueFromTemplateModal({
  onClose,
  onSwitchToBlank,
}: {
  onClose: () => void;
  /** When provided (i.e. rendered from NewContractModal), shows a "Use blank form" link */
  onSwitchToBlank?: () => void;
}) {
  useEscapeClose(onClose);
  const [step, setStep] = useState<Step>(1);
  const [templateId, setTemplateId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [contractMeta, setContractMeta] = useState<ContractMetaState>(INITIAL_CONTRACT_META);
  const [previewData, setPreviewData] = useState<{
    html: string;
    missingTags: string[];
    resolved?: Record<string, string>;
  } | null>(null);
  /** Validation error surfaced inline on the final step if the merged data is still missing tags. */
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  /** Admin signature captured on the final review step. PNG data URL.
   *  Required before the "Issue & Email" button enables — issuing
   *  unsigned is a policy hole we're closing in this PR. */
  const [adminSignatureDataUrl, setAdminSignatureDataUrl] = useState<
    string | null
  >(null);

  const { data: templates = [] } = useContractTemplates({ status: "active" });
  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: () => fetchApi<UserOption[]>("/api/users"),
    retry: 2,
    staleTime: 60_000,
  });

  const previewMut = usePreviewContractTemplate();
  const issueMut = useIssueFromTemplate();

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

  /**
   * Walk the selected template's body and auto-derive an input field for every
   * `custom.*` merge tag it references. Replaces the legacy `manualFields`
   * config — template authors no longer have to declare these by hand.
   */
  const customFields: DerivedCustomField[] = useMemo(() => {
    if (!selectedTemplate?.contentJson) return [];
    return deriveCustomFields(selectedTemplate.contentJson as TipTapDoc);
  }, [selectedTemplate]);

  const customFieldKeys = useMemo(
    () => new Set(customFields.map((f) => f.key)),
    [customFields],
  );

  /** All custom fields filled with a non-empty value? Gates Step 3 → Step 4. */
  const allCustomFieldsFilled = useMemo(
    () =>
      customFields.every((f) => {
        const v = manualValues[f.key];
        return typeof v === "string" && v.trim().length > 0;
      }),
    [customFields, manualValues],
  );

  /** Tags missing values that the user must still fill — used for the submit gate. */
  const unfilledCustomFields = useMemo(
    () => customFields.filter((f) => !(manualValues[f.key]?.trim())),
    [customFields, manualValues],
  );

  // Reset downstream state when the template changes so values from a previously
  // selected template (award level, manual fields, etc.) don't leak across.
  useEffect(() => {
    setContractMeta(INITIAL_CONTRACT_META);
    setManualValues({});
    setPreviewData(null);
  }, [templateId]);

  // Step 2: auto-resolve preview (no manualValues yet, with userId)
  useEffect(() => {
    if (step !== 2 || !templateId || !userId) return;
    let cancelled = false;
    previewMut
      .mutateAsync({
        id: templateId,
        userId,
        contractMeta: contractMeta.startDate
          ? {
              contractType: contractMeta.contractType,
              awardLevel: contractMeta.awardLevel,
              awardLevelCustom: contractMeta.awardLevelCustom,
              payRate: contractMeta.payRate ? Number(contractMeta.payRate) : undefined,
              hoursPerWeek: contractMeta.hoursPerWeek
                ? Number(contractMeta.hoursPerWeek)
                : null,
              startDate: contractMeta.startDate,
              endDate: contractMeta.endDate || null,
              position: contractMeta.position || undefined,
            }
          : undefined,
      })
      .then((res) => {
        if (!cancelled) setPreviewData(res);
      })
      .catch(() => {
        if (!cancelled) setPreviewData(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, templateId, userId]);

  // Step 5: final preview with all merged data
  useEffect(() => {
    if (step !== 5 || !templateId || !userId) return;
    let cancelled = false;
    previewMut
      .mutateAsync({
        id: templateId,
        userId,
        contractMeta: {
          contractType: contractMeta.contractType,
          awardLevel: contractMeta.awardLevel,
          awardLevelCustom: contractMeta.awardLevelCustom,
          payRate: contractMeta.payRate ? Number(contractMeta.payRate) : undefined,
          hoursPerWeek: contractMeta.hoursPerWeek
            ? Number(contractMeta.hoursPerWeek)
            : null,
          startDate: contractMeta.startDate,
          endDate: contractMeta.endDate || null,
          position: contractMeta.position || undefined,
        },
        manualValues,
      })
      .then((res) => {
        if (!cancelled) setPreviewData(res);
      })
      .catch(() => {
        if (!cancelled) setPreviewData(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, templateId, userId, contractMeta, manualValues]);

  const handleNext = () => {
    // Skip step 3 if the template has no custom.* tags to collect.
    if (step === 2 && customFields.length === 0) {
      setStep(4);
    } else {
      setStep((s) => (s + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step === 4 && customFields.length === 0) {
      setStep(2);
    } else {
      setStep((s) => Math.max(1, s - 1) as Step);
    }
  };

  const handleIssue = async () => {
    setSubmissionError(null);
    // Safety-net validation: even if the user got here, double-check the
    // template doesn't reference any unresolved tags before hitting the API.
    if (unfilledCustomFields.length > 0) {
      setSubmissionError(
        `Missing values for: ${unfilledCustomFields.map((f) => f.label).join(", ")}. Go back to the manual fields step to fill them in.`,
      );
      return;
    }
    if (previewData?.missingTags?.length) {
      // Filter out tags we know about as custom fields — those are already
      // caught above. Anything left is a template authoring issue.
      const orphan = previewData.missingTags.filter(
        (t) => !customFieldKeys.has(t),
      );
      if (orphan.length > 0) {
        setSubmissionError(
          `Template references tags that can't be resolved: ${orphan.join(", ")}. The template needs to be updated.`,
        );
        return;
      }
    }

    if (!adminSignatureDataUrl) {
      setSubmissionError(
        "Please draw your signature before issuing the contract.",
      );
      return;
    }

    // The mutation hook handles its own toast on error — don't show our own.
    if (issueMut.isPending) return;
    try {
      await issueMut.mutateAsync({
        templateId,
        userId,
        contractMeta: {
          contractType: contractMeta.contractType,
          awardLevel: contractMeta.awardLevel || null,
          awardLevelCustom: contractMeta.awardLevelCustom || null,
          payRate: Number(contractMeta.payRate),
          hoursPerWeek: contractMeta.hoursPerWeek
            ? Number(contractMeta.hoursPerWeek)
            : null,
          startDate: contractMeta.startDate,
          endDate: contractMeta.endDate || null,
          position: contractMeta.position,
        },
        manualValues,
        adminSignatureDataUrl,
      });
      onClose();
    } catch {
      // toast handled by the hook's onError
    }
  };

  // Step 2 next-button disabled logic: block if staff.* tags are still missing.
  const hasBlockingMissingTags = Boolean(
    previewData?.missingTags.some((t) => t.startsWith("staff.")),
  );

  const getStepLabel = (s: Step): string => {
    const hasCustom = customFields.length > 0;
    const total = hasCustom ? 5 : 4;
    const labels = hasCustom
      ? ["Choose template & staff", "Review resolved tags", "Fill custom fields", "Contract details", "Final preview"]
      : ["Choose template & staff", "Review resolved tags", "Contract details", "Final preview"];
    // Internal step is 1,2,3,4,5 when custom fields exist; 1,2,_,4,5 when they don't.
    // Remap to displayed step number so users see a contiguous "Step X of N".
    const displayIdx = hasCustom
      ? s - 1
      : s === 1 ? 0 : s === 2 ? 1 : s === 4 ? 2 : 3;
    return `Step ${displayIdx + 1} of ${total} — ${labels[displayIdx] ?? ""}`;
  };

  // Portal to <body> so `position: fixed` ignores the dashboard <main>, which
  // has `animate-slide-up` → leaves a permanent `translate: 0 0` and creates
  // a containing block for fixed descendants (causing the modal to be
  // centered inside <main> instead of the viewport).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Issue contract from template
            </h2>
            <p className="text-xs text-muted mt-0.5">{getStepLabel(step)}</p>
          </div>
          <div className="flex items-center gap-2">
            {onSwitchToBlank && (
              <button
                type="button"
                onClick={onSwitchToBlank}
                className="text-xs text-muted hover:text-foreground transition-colors underline underline-offset-2"
                title="Use this to attach a contract that was already signed off-platform (e.g. previously signed in Employment Hero)"
              >
                Upload existing signed contract
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && (
            <Step1
              templates={templates}
              users={users}
              templateId={templateId}
              setTemplateId={setTemplateId}
              userId={userId}
              setUserId={setUserId}
            />
          )}
          {step === 2 && (
            <Step2
              previewData={previewData}
              loading={previewMut.isPending}
              userId={userId}
              customFieldKeys={customFieldKeys}
            />
          )}
          {step === 3 && (
            <Step3
              customFields={customFields}
              values={manualValues}
              setValues={setManualValues}
            />
          )}
          {step === 4 && (
            <Step4 meta={contractMeta} setMeta={setContractMeta} />
          )}
          {step === 5 && (
            <Step5
              previewData={previewData}
              loading={previewMut.isPending}
              submissionError={submissionError}
              adminSignatureDataUrl={adminSignatureDataUrl}
              onAdminSignatureChange={setAdminSignatureDataUrl}
              disabled={issueMut.isPending}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between p-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-1.5 text-sm text-muted disabled:opacity-50 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={
                (step === 1 && (!templateId || !userId)) ||
                (step === 2 && (!previewData || hasBlockingMissingTags)) ||
                (step === 3 && !allCustomFieldsFilled)
              }
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleIssue}
              disabled={issueMut.isPending || !adminSignatureDataUrl}
              title={
                !adminSignatureDataUrl
                  ? "Sign the contract first using the signature pad below."
                  : undefined
              }
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {issueMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {issueMut.isPending ? "Issuing…" : "Sign & Issue"}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ── Step 1: Choose template + staff ──────────────────────────────────────────

function Step1({
  templates,
  users,
  templateId,
  setTemplateId,
  userId,
  setUserId,
}: {
  templates: { id: string; name: string }[];
  users: UserOption[];
  templateId: string;
  setTemplateId: (id: string) => void;
  userId: string;
  setUserId: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Template
        </label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          <option value="">Choose a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Staff member
        </label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          <option value="">Choose a staff member…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Step 2: Review resolved tags ─────────────────────────────────────────────

function Step2({
  previewData,
  loading,
  userId,
  customFieldKeys,
}: {
  previewData: { html: string; missingTags: string[]; resolved?: Record<string, string> } | null;
  loading: boolean;
  userId: string;
  /** Keys that will be collected as custom inputs in Step 3 — don't surface them as "unresolved" here. */
  customFieldKeys: Set<string>;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Resolving staff data…
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="flex items-center justify-center py-16 text-muted text-sm">
        Preview unavailable. Check that the template is valid and try again.
      </div>
    );
  }

  const staffMissingTags = previewData.missingTags.filter((t) => t.startsWith("staff."));
  // Tags that can't be resolved automatically and won't be collected by the
  // dynamic custom-fields step. These usually indicate a template bug.
  const orphanMissingTags = previewData.missingTags.filter(
    (t) => !t.startsWith("staff.") && !customFieldKeys.has(t),
  );

  // Resolved staff.* tags to show as a read-only summary.
  const resolvedStaffEntries = previewData.resolved
    ? Object.entries(previewData.resolved).filter(
        ([k, v]) => k.startsWith("staff.") && v && v.length > 0,
      )
    : [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Confirm the values pulled from the staff member&apos;s profile. Missing{" "}
        <code className="text-xs bg-surface px-1 py-0.5 rounded">staff.*</code> tags must be
        fixed before continuing.
      </p>

      {staffMissingTags.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">
              Missing staff profile fields ({staffMissingTags.length})
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              {staffMissingTags.join(", ")}
            </p>
            <a
              href={`/staff/${userId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-red-700 underline hover:text-red-900"
            >
              Fix on staff profile <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {orphanMissingTags.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Unresolved tags ({orphanMissingTags.length})
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {orphanMissingTags.join(", ")} — these tags aren&apos;t in the staff profile, the
              contract details, or the custom-fields step. The template likely needs to be updated.
            </p>
          </div>
        </div>
      )}

      {staffMissingTags.length === 0 && orphanMissingTags.length === 0 && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          All automatic tags resolved successfully.
        </div>
      )}

      {resolvedStaffEntries.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-3">
          <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Resolved from staff profile
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {resolvedStaffEntries.map(([key, value]) => {
              const label = MERGE_TAGS_BY_KEY[key]?.label ?? key;
              return (
                <div key={key} className="flex items-baseline gap-2">
                  <dt className="text-muted text-xs shrink-0">{label}:</dt>
                  <dd className="text-foreground font-medium truncate">{value}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      <div className="bg-surface rounded-lg border border-border p-3">
        <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
          Document preview
        </p>
        <iframe
          title="Tag resolution preview"
          sandbox="allow-same-origin"
          srcDoc={previewData.html}
          className="w-full h-64 bg-white rounded border border-border/50"
        />
      </div>
    </div>
  );
}

// ── Step 3: Custom fields (auto-derived from template body) ──────────────────

function Step3({
  customFields,
  values,
  setValues,
}: {
  customFields: DerivedCustomField[];
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  if (customFields.length === 0) {
    return (
      <p className="text-sm text-muted py-8 text-center">
        This template doesn&apos;t reference any custom tags.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Fill in the custom values referenced by this template. All fields are required.
      </p>
      {customFields.map((field) => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {field.label}
            <span className="text-red-500 ml-1">*</span>
            <code className="ml-2 text-[10px] font-normal text-muted bg-surface px-1 py-0.5 rounded">
              {`{{${field.key}}}`}
            </code>
          </label>
          {field.type === "longtext" ? (
            <textarea
              value={values[field.key] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [field.key]: e.target.value })
              }
              rows={4}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
            />
          ) : (
            <input
              type={field.type === "number" ? "number" : "text"}
              value={values[field.key] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [field.key]: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 4: Contract metadata ────────────────────────────────────────────────

function Step4({
  meta,
  setMeta,
}: {
  meta: ContractMetaState;
  setMeta: (m: ContractMetaState) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Enter the contract details. These will be merged into the template.
      </p>

      {/* Contract type */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Contract Type <span className="text-red-500">*</span>
        </label>
        <select
          value={meta.contractType}
          onChange={(e) =>
            setMeta({
              ...meta,
              contractType: e.target.value as ContractMetaState["contractType"],
            })
          }
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          {CONTRACT_TYPES.map((ct) => (
            <option key={ct} value={ct}>
              {CONTRACT_TYPE_LABELS[ct] ?? ct}
            </option>
          ))}
        </select>
      </div>

      {/* Position */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Position / Role Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={meta.position}
          onChange={(e) => setMeta({ ...meta, position: e.target.value })}
          placeholder="e.g. Educator, Assistant Director"
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        />
      </div>

      {/* Pay rate + hours per week */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Pay Rate ($/hr) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={meta.payRate}
            onChange={(e) => setMeta({ ...meta, payRate: e.target.value })}
            placeholder="e.g. 28.50"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Hours per Week
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={meta.hoursPerWeek}
            onChange={(e) => setMeta({ ...meta, hoursPerWeek: e.target.value })}
            placeholder="e.g. 38"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>
      </div>

      {/* Award level */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Award Level
        </label>
        <select
          value={meta.awardLevel ?? ""}
          onChange={(e) =>
            setMeta({ ...meta, awardLevel: e.target.value || null })
          }
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
        >
          <option value="">None</option>
          {AWARD_LEVELS.map((al) => (
            <option key={al} value={al}>
              {AWARD_LEVEL_LABELS[al] ?? al}
            </option>
          ))}
        </select>
      </div>

      {meta.awardLevel === "custom" && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Custom Award Level
          </label>
          <input
            type="text"
            value={meta.awardLevelCustom ?? ""}
            onChange={(e) =>
              setMeta({ ...meta, awardLevelCustom: e.target.value || null })
            }
            placeholder="Describe the custom level"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>
      )}

      {/* Start date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Start Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={meta.startDate}
            onChange={(e) => setMeta({ ...meta, startDate: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            End Date{" "}
            <span className="text-muted font-normal">(fixed-term only)</span>
          </label>
          <input
            type="date"
            value={meta.endDate}
            onChange={(e) => setMeta({ ...meta, endDate: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 5: Final preview ────────────────────────────────────────────────────

function Step5({
  previewData,
  loading,
  submissionError,
  adminSignatureDataUrl,
  onAdminSignatureChange,
  disabled,
}: {
  previewData: { html: string; missingTags: string[]; resolved?: Record<string, string> } | null;
  loading: boolean;
  submissionError: string | null;
  adminSignatureDataUrl: string | null;
  onAdminSignatureChange: (dataUrl: string | null) => void;
  disabled: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Rendering final preview…
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="flex items-center justify-center py-16 text-muted text-sm">
        Preview unavailable. You can still issue the contract.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {submissionError && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="font-medium">{submissionError}</div>
        </div>
      )}

      {!submissionError && previewData.missingTags.length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">
              {previewData.missingTags.length} unresolved tag
              {previewData.missingTags.length === 1 ? "" : "s"}
            </span>
            : {previewData.missingTags.join(", ")}. These will appear as
            placeholders in the issued contract.
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden" style={{ height: "50vh" }}>
        <iframe
          title="Final contract preview"
          sandbox="allow-same-origin"
          srcDoc={previewData.html}
          className="w-full h-full bg-white"
        />
      </div>

      {/* Admin signature — required before issue. The PNG is embedded
          into the rendered PDF via the signature.admin merge tag
          placeholder. */}
      <div className="rounded-lg border border-border bg-surface/40 p-4">
        <SignaturePad
          label="Sign as the issuing admin"
          onChange={onAdminSignatureChange}
          initial={adminSignatureDataUrl}
          disabled={disabled}
        />
        <p className="text-xs text-muted mt-2">
          Your signature is captured and embedded in the contract PDF
          the staff member receives. They&apos;ll then sign their
          half before the contract is fully executed.
        </p>
      </div>
    </div>
  );
}
