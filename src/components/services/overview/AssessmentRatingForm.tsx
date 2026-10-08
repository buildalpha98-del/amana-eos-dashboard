"use client";

/**
 * Service Information → Assessment & rating (2026-10-08, after OWNA's
 * "Assessment & Rating (A&R)" tab): the centre's overall NQS rating, the
 * seven quality-area ratings and its assessment dates. The overall rating
 * feeds the centre health score.
 */
import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { useUpdateService } from "@/hooks/useServices";
import { Button } from "@/components/ui/Button";
import { Field } from "./CentreDetailsForm";
import {
  NQS_RATINGS,
  NQS_RATING_LABELS,
  QA_RATINGS,
  QUALITY_AREAS,
} from "@/lib/nqs-rating";

const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-surface/60 disabled:text-muted";

interface Values {
  nqsRating: string;
  nqsLastAssessedAt: string;
  nqsNextAssessmentAt: string;
  qa: Record<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromService(s: any): Values {
  const day = (d: unknown) => (typeof d === "string" ? d.slice(0, 10) : "");
  return {
    nqsRating: s.nqsRating ?? "",
    nqsLastAssessedAt: day(s.nqsLastAssessedAt),
    nqsNextAssessmentAt: day(s.nqsNextAssessmentAt),
    qa: (s.nqsQaRatings as Record<string, string> | null) ?? {},
  };
}

export function AssessmentRatingForm({
  service,
  canEdit,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
  canEdit: boolean;
}) {
  const update = useUpdateService();
  const initial = useMemo(() => fromService(service), [service]);
  const [values, setValues] = useState<Values>(initial);
  const [seededFrom, setSeededFrom] = useState(initial);
  if (seededFrom !== initial) {
    setSeededFrom(initial);
    setValues(initial);
  }

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const disabled = !canEdit || update.isPending;

  function save() {
    const qa = Object.fromEntries(Object.entries(values.qa).filter(([, v]) => v));
    update.mutate({
      id: service.id,
      nqsRating: values.nqsRating || null,
      nqsLastAssessedAt: values.nqsLastAssessedAt || null,
      nqsNextAssessmentAt: values.nqsNextAssessmentAt || null,
      nqsQaRatings: Object.keys(qa).length ? qa : null,
    } as never);
  }

  return (
    <div className="space-y-5" data-testid="assessment-rating-form">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Overall rating" note="As published by ACECQA. Feeds the centre's health score.">
          <select
            className={inputClass}
            value={values.nqsRating}
            disabled={disabled}
            onChange={(e) => setValues((v) => ({ ...v, nqsRating: e.target.value }))}
          >
            <option value="">Not recorded</option>
            {NQS_RATINGS.map((r) => (
              <option key={r} value={r}>{NQS_RATING_LABELS[r]}</option>
            ))}
          </select>
        </Field>
        <Field label="Last assessment" note="The date of the visit the rating came from.">
          <input
            type="date"
            className={inputClass}
            value={values.nqsLastAssessedAt}
            disabled={disabled}
            onChange={(e) => setValues((v) => ({ ...v, nqsLastAssessedAt: e.target.value }))}
          />
        </Field>
        <Field label="Next assessment (if known)" note="Shows on the centre so nobody is caught out.">
          <input
            type="date"
            className={inputClass}
            value={values.nqsNextAssessmentAt}
            disabled={disabled}
            onChange={(e) => setValues((v) => ({ ...v, nqsNextAssessmentAt: e.target.value }))}
          />
        </Field>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-brand border-b border-border pb-1.5 mb-3">
          Quality areas
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {QUALITY_AREAS.map((qa) => (
            <Field key={qa.key} label={`${qa.key} — ${qa.label}`}>
              <select
                className={inputClass}
                value={values.qa[qa.key] ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  setValues((v) => ({ ...v, qa: { ...v.qa, [qa.key]: e.target.value } }))
                }
              >
                <option value="">Not recorded</option>
                {QA_RATINGS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setValues(initial)} disabled={update.isPending}>
              Undo
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || update.isPending}>
            <Save className="w-4 h-4" aria-hidden />
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
