"use client";

/**
 * Step 2 — the children being enrolled, with their medical details.
 *
 * Medical sits here rather than in its own step on purpose: it belongs to
 * a child, and splitting it out is what makes a parent with two children
 * fill in one child's allergies against the other's name.
 */

import { Plus } from "lucide-react";
import { field, Field, RepeatCard, SectionHeading, YesNo } from "./ui";
import type { DraftChild } from "@/lib/enrol-draft";
import { CULTURAL_OPTIONS, KNOWN_SCHOOL_OPTIONS } from "@/components/enrol/types";

const YEAR_LEVELS = [
  "Kindergarten",
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
];

// NOT named `children`: React treats that prop specially, and handing it
// an array of plain objects is asking for a confusing render-time error.
export function ChildStep({
  items,
  onChange,
}: {
  items: DraftChild[];
  onChange: (next: DraftChild[]) => void;
}) {
  const patch = (i: number, p: Partial<DraftChild>) =>
    onChange(items.map((c, idx) => (idx === i ? { ...c, ...p } : c)));

  const add = () => onChange([...items, {}]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
      {items.map((c, i) => (
        <RepeatCard
          key={i}
          title={
            c.firstName?.trim()
              ? `${c.firstName}${c.surname ? ` ${c.surname}` : ""}`
              : `Child ${i + 1}`
          }
          onRemove={items.length > 1 ? () => remove(i) : undefined}
          removeLabel="Remove child"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id={`c${i}-first`} label="First name" required>
              <input
                id={`c${i}-first`}
                className={field}
                value={c.firstName ?? ""}
                onChange={(e) => patch(i, { firstName: e.target.value })}
              />
            </Field>
            <Field id={`c${i}-last`} label="Last name" required>
              <input
                id={`c${i}-last`}
                className={field}
                value={c.surname ?? ""}
                onChange={(e) => patch(i, { surname: e.target.value })}
              />
            </Field>
            <Field id={`c${i}-dob`} label="Date of birth" required>
              <input
                id={`c${i}-dob`}
                type="date"
                className={field}
                value={c.dob ?? ""}
                onChange={(e) => patch(i, { dob: e.target.value })}
              />
            </Field>
            <Field id={`c${i}-gender`} label="Gender">
              <select
                id={`c${i}-gender`}
                className={field}
                value={c.gender ?? ""}
                onChange={(e) => patch(i, { gender: e.target.value })}
              >
                <option value="">Select…</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </Field>
            <Field id={`c${i}-school`} label="School" required>
              <select
                id={`c${i}-school`}
                className={field}
                value={c.schoolName ?? ""}
                onChange={(e) => patch(i, { schoolName: e.target.value })}
              >
                <option value="">Select a school…</option>
                {KNOWN_SCHOOL_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`c${i}-year`} label="Year level" required>
              <select
                id={`c${i}-year`}
                className={field}
                value={c.yearLevel ?? ""}
                onChange={(e) => patch(i, { yearLevel: e.target.value })}
              >
                <option value="">Select…</option>
                {YEAR_LEVELS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id={`c${i}-crn`}
              label="Child's CRN"
              hint="Leave blank if you don't have one yet."
            >
              <input
                id={`c${i}-crn`}
                className={field}
                value={c.crn ?? ""}
                onChange={(e) => patch(i, { crn: e.target.value })}
              />
            </Field>
            <Field id={`c${i}-cultural`} label="Cultural background">
              <select
                id={`c${i}-cultural`}
                className={field}
                value={c.culturalBackground ?? ""}
                onChange={(e) => patch(i, { culturalBackground: e.target.value })}
              >
                <option value="">Select…</option>
                {CULTURAL_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <SectionHeading>Health &amp; medical</SectionHeading>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={c.medicalNone ?? false}
              onChange={(e) =>
                patch(i, {
                  medicalNone: e.target.checked,
                  ...(e.target.checked
                    ? { allergies: "", conditions: "", medications: "", dietary: "" }
                    : {}),
                })
              }
              className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-sm text-foreground">
              {c.firstName?.trim() || "This child"} has no allergies, medical
              conditions, medications or dietary requirements.
            </span>
          </label>

          {!c.medicalNone && (
            <div className="grid grid-cols-1 gap-4">
              <Field
                id={`c${i}-allergies`}
                label="Allergies"
                hint="Include what happens on exposure and how severe it is."
              >
                <textarea
                  id={`c${i}-allergies`}
                  rows={2}
                  className={field}
                  value={c.allergies ?? ""}
                  onChange={(e) => patch(i, { allergies: e.target.value })}
                />
              </Field>
              <Field id={`c${i}-conditions`} label="Medical conditions">
                <textarea
                  id={`c${i}-conditions`}
                  rows={2}
                  className={field}
                  value={c.conditions ?? ""}
                  onChange={(e) => patch(i, { conditions: e.target.value })}
                />
              </Field>
              <Field
                id={`c${i}-meds`}
                label="Medications"
                hint="Anything we may need to administer, with the dose."
              >
                <textarea
                  id={`c${i}-meds`}
                  rows={2}
                  className={field}
                  value={c.medications ?? ""}
                  onChange={(e) => patch(i, { medications: e.target.value })}
                />
              </Field>
              <Field id={`c${i}-diet`} label="Dietary requirements">
                <input
                  id={`c${i}-diet`}
                  className={field}
                  value={c.dietary ?? ""}
                  onChange={(e) => patch(i, { dietary: e.target.value })}
                />
              </Field>
              <div>
                <span className="block text-sm font-medium text-foreground mb-2">
                  Is there a medical management or action plan?
                </span>
                <YesNo
                  label="Medical management plan"
                  value={c.hasMedicalPlan}
                  onChange={(v) => patch(i, { hasMedicalPlan: v })}
                />
                {c.hasMedicalPlan && (
                  <p className="mt-2 text-xs text-muted">
                    Please bring a copy to your first session — we can&apos;t
                    accept your child without it on file.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id={`c${i}-doc`} label="Doctor / medical centre">
              <input
                id={`c${i}-doc`}
                className={field}
                value={c.doctorName ?? ""}
                onChange={(e) => patch(i, { doctorName: e.target.value })}
              />
            </Field>
            <Field id={`c${i}-docphone`} label="Doctor's phone">
              <input
                id={`c${i}-docphone`}
                type="tel"
                className={field}
                value={c.doctorPhone ?? ""}
                onChange={(e) => patch(i, { doctorPhone: e.target.value })}
              />
            </Field>
            <Field
              id={`c${i}-medicare`}
              label="Medicare number"
              className="sm:col-span-2"
            >
              <input
                id={`c${i}-medicare`}
                inputMode="numeric"
                className={field}
                value={c.medicareNumber ?? ""}
                onChange={(e) => patch(i, { medicareNumber: e.target.value })}
              />
            </Field>
          </div>
        </RepeatCard>
      ))}

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
      >
        <Plus className="w-4 h-4" /> Add another child
      </button>

      <p className="text-xs text-muted">
        Enrolling siblings? Add them all here — one form covers your whole
        family.
      </p>
    </div>
  );
}
