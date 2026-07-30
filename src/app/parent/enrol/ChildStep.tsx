"use client";

/**
 * Step 2 — the children being enrolled, their health screening, and their
 * documents.
 *
 * Medical sits here rather than in its own step on purpose: it belongs to
 * a child, and splitting it out is what makes a parent with two children
 * fill in one child's allergies against the other's name.
 *
 * The screening questions mirror the NQF-standard set Daniel supplied
 * (anaphylaxis / allergies / asthma / other condition / dietary /
 * paracetamol), each with the action a family needs to take when they
 * answer yes.
 */

import { Plus } from "lucide-react";
import {
  field,
  Field,
  FileUploadField,
  RepeatCard,
  ScreeningQuestion,
  SectionHeading,
} from "./ui";
import {
  ENROLMENTS_EMAIL,
  IMMUNISATION_STATUS_OPTIONS,
  formatMedicareExpiry,
  medicareExpiryValid,
  OPTIONAL_CHILD_DOCUMENTS,
  REQUIRED_CHILD_DOCUMENTS,
  type DraftChild,
  type DraftUpload,
} from "@/lib/enrol-draft";
import { KNOWN_SCHOOL_OPTIONS } from "@/components/enrol/types";

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

  const setUpload = (i: number, type: string, u: DraftUpload | undefined) => {
    const existing = (items[i]?.uploads ?? []).filter((x) => x.type !== type);
    patch(i, { uploads: u ? [...existing, u] : existing });
  };
  const getUpload = (i: number, type: string) =>
    (items[i]?.uploads ?? []).find((x) => x.type === type);

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
            {/* Free text, not a year dropdown — schools label rooms their
                own way and that's what educators need at pickup. */}
            <Field
              id={`c${i}-classroom`}
              label="Classroom"
              required
              hint="Your child's room or class code, for example D.G1Y"
            >
              <input
                id={`c${i}-classroom`}
                className={field}
                value={c.classroom ?? ""}
                onChange={(e) => patch(i, { classroom: e.target.value })}
                placeholder="e.g. D.G1Y"
              />
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
            <Field id={`c${i}-medicare`} label="Medicare number" required>
              <input
                id={`c${i}-medicare`}
                inputMode="numeric"
                className={field}
                value={c.medicareNumber ?? ""}
                onChange={(e) => patch(i, { medicareNumber: e.target.value })}
              />
            </Field>
            {/* MM/YYYY only — that's all a Medicare card shows. The slash
                is inserted as they type so nobody has to guess the shape. */}
            <Field
              id={`c${i}-medicare-exp`}
              label="Medicare expiry"
              required
              hint={
                c.medicareExpiry && !medicareExpiryValid(c.medicareExpiry)
                  ? "Please enter the month and year as MM/YYYY, e.g. 05/2030."
                  : "Month and year, as printed on the card."
              }
            >
              <input
                id={`c${i}-medicare-exp`}
                className={field}
                value={c.medicareExpiry ?? ""}
                onChange={(e) =>
                  patch(i, { medicareExpiry: formatMedicareExpiry(e.target.value) })
                }
                placeholder="MM/YYYY"
                inputMode="numeric"
                maxLength={7}
              />
            </Field>
          </div>

          <SectionHeading>Health &amp; medical</SectionHeading>

          <div className="space-y-5">
            <ScreeningQuestion
              label="Does your child have anaphylaxis?"
              value={c.anaphylaxis}
              onChange={(v) => patch(i, { anaphylaxis: v })}
            >
              <p className="font-semibold">Please also:</p>
              <p>
                1) Complete an Anaphylaxis Management, Risk Minimisation &amp;
                Communication Plan — we&apos;ll provide this.
              </p>
              <p>
                2) Complete an ASCIA Action Plan for Anaphylaxis Reactions
                (from{" "}
                <a
                  href="https://www.allergy.org.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold"
                >
                  allergy.org.au
                </a>
                ) and have it signed by your child&apos;s doctor. Upload it
                below as a medical / action plan.
              </p>
            </ScreeningQuestion>

            <ScreeningQuestion
              label="Does your child have any allergies?"
              value={c.allergies}
              onChange={(v) => patch(i, { allergies: v })}
            >
              <p className="font-semibold">Please also:</p>
              <p>
                1) Complete an Allergy Management, Risk Minimisation &amp;
                Communication Plan — we&apos;ll provide this.
              </p>
              <p>
                2) Complete an ASCIA Action Plan for Allergic Reactions (from{" "}
                <a
                  href="https://www.allergy.org.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold"
                >
                  allergy.org.au
                </a>
                ) and have it signed by your child&apos;s doctor.
              </p>
            </ScreeningQuestion>

            {(c.anaphylaxis || c.allergies) && (
              <Field
                id={`c${i}-allergy-detail`}
                label="Please describe the allergy and what happens on exposure"
              >
                <textarea
                  id={`c${i}-allergy-detail`}
                  rows={2}
                  className={field}
                  value={c.allergiesDetail ?? ""}
                  onChange={(e) => patch(i, { allergiesDetail: e.target.value })}
                />
              </Field>
            )}

            <ScreeningQuestion
              label="Does your child have asthma?"
              value={c.asthma}
              onChange={(v) => patch(i, { asthma: v })}
            >
              <p className="font-semibold">Please also:</p>
              <p>
                1) Complete an Asthma Management, Risk Minimisation &amp;
                Communication Plan — we&apos;ll provide this.
              </p>
              <p>
                2) Complete an Asthma Care Plan for Education and Care
                Services (from{" "}
                <a
                  href="https://www.asthmaaustralia.org.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold"
                >
                  asthmaaustralia.org.au
                </a>
                ) and have it signed by your child&apos;s doctor.
              </p>
            </ScreeningQuestion>

            <ScreeningQuestion
              label="Does your child have another medical condition not listed above (for example diabetes, epilepsy, hearing loss)?"
              value={c.otherCondition}
              onChange={(v) => patch(i, { otherCondition: v })}
            >
              <p className="font-semibold">Please also:</p>
              <p>
                1) Complete a Medical Management, Risk Minimisation &amp;
                Communication Plan — we&apos;ll provide this.
              </p>
              <p>2) Have the forms completed and signed by your doctor.</p>
              <p>3) Upload the signed forms below.</p>
            </ScreeningQuestion>

            {c.otherCondition && (
              <Field
                id={`c${i}-other-detail`}
                label="Please describe the condition"
              >
                <textarea
                  id={`c${i}-other-detail`}
                  rows={2}
                  className={field}
                  value={c.otherConditionDetail ?? ""}
                  onChange={(e) =>
                    patch(i, { otherConditionDetail: e.target.value })
                  }
                />
              </Field>
            )}

            <ScreeningQuestion
              label="Does your child have any dietary restrictions?"
              value={c.dietaryRestrictions}
              onChange={(v) => patch(i, { dietaryRestrictions: v })}
            />

            {c.dietaryRestrictions && (
              <Field
                id={`c${i}-diet-detail`}
                label="Please describe the dietary restrictions"
              >
                <input
                  id={`c${i}-diet-detail`}
                  className={field}
                  value={c.dietaryDetail ?? ""}
                  onChange={(e) => patch(i, { dietaryDetail: e.target.value })}
                />
              </Field>
            )}

            <ScreeningQuestion
              label="In the event that no parent or guardian can be contacted, do you give permission for a staff member to administer paracetamol to your child, in line with the Administration of First Aid and Medication Policy?"
              value={c.paracetamol}
              onChange={(v) => patch(i, { paracetamol: v })}
            />

            {/* Reg 160(3)(j) — special considerations / additional needs. */}
            <ScreeningQuestion
              label="Does your child have any additional needs, or a disability, that we should plan for?"
              value={c.additionalNeeds}
              onChange={(v) => patch(i, { additionalNeeds: v })}
            >
              <p>
                Tell us as much as you&apos;d like below. We&apos;ll talk it
                through with you before your child starts so we can put the
                right support in place.
              </p>
            </ScreeningQuestion>

            {c.additionalNeeds && (
              <Field
                id={`c${i}-needs-detail`}
                label="Please tell us about your child's additional needs"
              >
                <textarea
                  id={`c${i}-needs-detail`}
                  rows={3}
                  className={field}
                  value={c.additionalNeedsDetail ?? ""}
                  onChange={(e) =>
                    patch(i, { additionalNeedsDetail: e.target.value })
                  }
                />
              </Field>
            )}

            <Field
              id={`c${i}-meds`}
              label="Medications we may need to administer"
              hint="Include the dose and when it's given. Leave blank if none."
            >
              <textarea
                id={`c${i}-meds`}
                rows={2}
                className={field}
                value={c.medications ?? ""}
                onChange={(e) => patch(i, { medications: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id={`c${i}-doc`} label="Doctor / medical centre">
              <input
                id={`c${i}-doc`}
                className={field}
                value={c.doctorName ?? ""}
                onChange={(e) => patch(i, { doctorName: e.target.value })}
              />
            </Field>
            <Field id={`c${i}-docphone`} label="Doctor's phone" required>
              <input
                id={`c${i}-docphone`}
                type="tel"
                className={field}
                value={c.doctorPhone ?? ""}
                onChange={(e) => patch(i, { doctorPhone: e.target.value })}
              />
            </Field>
            {/* Reg 162(a) requires the practitioner's ADDRESS as well. */}
            <Field
              id={`c${i}-docaddr`}
              label="Doctor's address"
              required
              className="sm:col-span-2"
            >
              <input
                id={`c${i}-docaddr`}
                className={field}
                value={c.doctorAddress ?? ""}
                onChange={(e) => patch(i, { doctorAddress: e.target.value })}
                placeholder="Practice street address"
              />
            </Field>
          </div>

          {/* Reg 162(g), asked plainly. A tick beats a dropdown for three
              options, and "medical exemption" has to be offered or those
              families are forced to answer inaccurately. */}
          <div>
            <span className="block text-sm font-medium text-foreground mb-2">
              Is your child fully immunised?<span className="text-red-500"> *</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {IMMUNISATION_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => patch(i, { immunisationStatus: opt })}
                  aria-pressed={c.immunisationStatus === opt}
                  className={
                    "px-4 min-h-11 rounded-lg border text-sm font-medium transition-colors " +
                    (c.immunisationStatus === opt
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-card text-muted hover:border-brand/40")
                  }
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <SectionHeading>Documents</SectionHeading>
          <p className="text-xs text-muted -mt-2">
            A photo taken on your phone is fine. Any questions, email us at{" "}
            <a
              href={`mailto:${ENROLMENTS_EMAIL}`}
              className="underline font-medium"
            >
              {ENROLMENTS_EMAIL}
            </a>
            .
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {REQUIRED_CHILD_DOCUMENTS.map((d) => (
              <FileUploadField
                key={d.type}
                label={d.label}
                type={d.type}
                required
                value={getUpload(i, d.type)}
                onChange={(u) => setUpload(i, d.type, u)}
              />
            ))}
            {OPTIONAL_CHILD_DOCUMENTS.map((d) => (
              <FileUploadField
                key={d.type}
                label={d.label}
                type={d.type}
                hint={
                  d.type === "medical_action_plan"
                    ? "Upload here if your child has an action plan."
                    : undefined
                }
                value={getUpload(i, d.type)}
                onChange={(u) => setUpload(i, d.type, u)}
              />
            ))}
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
