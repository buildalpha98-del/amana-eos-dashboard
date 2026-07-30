"use client";

/**
 * Step 3 — second carer and emergency contacts.
 *
 * 2026-07-30 rework, per Daniel:
 *   - The second parent/carer is REQUIRED, not optional. The only way out
 *     is answering "yes" to the court order question, which is also what
 *     unlocks the court order upload.
 *   - ONE emergency contact, not two. The old rule forced a second and
 *     silently blocked Next when families only had one person to give.
 *     That was the bug he hit.
 *   - No email on emergency contacts — name, relationship, phone.
 *   - "Mum" and "Dad" are not offered as relationships here, so parents
 *     don't list themselves as their own emergency contact.
 *   - The separate "authorised for pickup" list is gone; pickup is now one
 *     of the per-contact authorisations.
 */

import { Plus, Info } from "lucide-react";
import {
  field,
  Field,
  FileUploadField,
  RepeatCard,
  SectionHeading,
  YesNo,
} from "./ui";
import {
  EMERGENCY_CONSENTS,
  EMERGENCY_RELATIONSHIP_OPTIONS,
  ENROLMENTS_EMAIL,
  type DraftContacts,
  type DraftEmergencyContact,
  type DraftUpload,
} from "@/lib/enrol-draft";
import { RELATIONSHIP_OPTIONS } from "@/components/enrol/types";

export function ContactsStep({
  data,
  onChange,
}: {
  data: DraftContacts;
  onChange: (patch: Partial<DraftContacts>) => void;
}) {
  // Exactly one row by default. Never pad to two — forcing a second
  // contact is what blocked families who only have one.
  const emergency = data.emergency?.length ? data.emergency : [{}];
  const secondary = data.secondaryParent ?? {};
  const courtOrders = data.courtOrders;
  const secondaryRequired = courtOrders === false;

  const patchEmergency = (i: number, p: Partial<DraftEmergencyContact>) =>
    onChange({
      emergency: emergency.map((c, idx) => (idx === i ? { ...c, ...p } : c)),
    });

  const setCourtUpload = (u: DraftUpload | undefined) =>
    onChange({ courtOrderUploads: u ? [u] : [] });

  return (
    <div className="space-y-6">
      {/* ── Court orders first: it decides whether a second carer is
             mandatory, so asking it after would be back to front. ── */}
      <div>
        <span className="block text-sm font-medium text-foreground mb-2">
          Are there any court orders or parenting plans we need to know about?
          <span className="text-red-500"> *</span>
        </span>
        <YesNo
          label="Court orders"
          value={courtOrders}
          onChange={(v) => onChange({ courtOrders: v })}
        />
        {courtOrders === true && (
          <div className="mt-3 space-y-3">
            <FileUploadField
              label="Court order or parenting plan"
              type="court_order"
              required
              hint="We can't act on an order we haven't seen."
              value={data.courtOrderUploads?.[0]}
              onChange={setCourtUpload}
            />
          </div>
        )}
      </div>

      <SectionHeading>Second parent or carer</SectionHeading>

      {secondaryRequired ? (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-3 -mt-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
            A second carer is required. They&apos;ll be emailed an invitation
            to the Family Portal so they can view their child&apos;s bookings
            and updates too. If a court order or parenting plan means you
            can&apos;t provide one, answer <strong>Yes</strong> to the court
            order question above.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted -mt-2">
          Optional because a court order applies — but please add them if you
          can.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field id="sp-first" label="First name" required={secondaryRequired}>
          <input
            id="sp-first"
            className={field}
            value={secondary.firstName ?? ""}
            onChange={(e) =>
              onChange({
                secondaryParent: { ...secondary, firstName: e.target.value },
              })
            }
          />
        </Field>
        <Field id="sp-last" label="Last name" required={secondaryRequired}>
          <input
            id="sp-last"
            className={field}
            value={secondary.surname ?? ""}
            onChange={(e) =>
              onChange({
                secondaryParent: { ...secondary, surname: e.target.value },
              })
            }
          />
        </Field>
        <Field id="sp-mobile" label="Mobile" required={secondaryRequired}>
          <input
            id="sp-mobile"
            type="tel"
            className={field}
            value={secondary.mobile ?? ""}
            onChange={(e) =>
              onChange({
                secondaryParent: { ...secondary, mobile: e.target.value },
              })
            }
          />
        </Field>
        <Field
          id="sp-email"
          label="Email"
          hint="We'll send their Family Portal invitation here."
        >
          <input
            id="sp-email"
            type="email"
            className={field}
            value={secondary.email ?? ""}
            onChange={(e) =>
              onChange({
                secondaryParent: { ...secondary, email: e.target.value },
              })
            }
          />
        </Field>
        <Field id="sp-rel" label="Relationship to child">
          <select
            id="sp-rel"
            className={field}
            value={secondary.relationship ?? ""}
            onChange={(e) =>
              onChange({
                secondaryParent: { ...secondary, relationship: e.target.value },
              })
            }
          >
            <option value="">Select…</option>
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <SectionHeading>Emergency contact</SectionHeading>
      <p className="text-xs text-muted -mt-2">
        Someone we can reach if we can&apos;t reach you — so it must be
        someone other than you or the second carer. One is enough; add more
        if you&apos;d like.
      </p>

      {emergency.map((c, i) => (
        <RepeatCard
          key={i}
          title={c.name?.trim() || `Emergency contact ${i + 1}`}
          onRemove={
            i > 0
              ? () => onChange({ emergency: emergency.filter((_, x) => x !== i) })
              : undefined
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id={`ec${i}-name`} label="Full name" required>
              <input
                id={`ec${i}-name`}
                className={field}
                value={c.name ?? ""}
                onChange={(e) => patchEmergency(i, { name: e.target.value })}
              />
            </Field>
            <Field id={`ec${i}-rel`} label="Relationship to child" required>
              <select
                id={`ec${i}-rel`}
                className={field}
                value={c.relationship ?? ""}
                onChange={(e) =>
                  patchEmergency(i, { relationship: e.target.value })
                }
              >
                <option value="">Select…</option>
                {EMERGENCY_RELATIONSHIP_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id={`ec${i}-phone`}
              label="Phone"
              required
              className="sm:col-span-2"
            >
              <input
                id={`ec${i}-phone`}
                type="tel"
                className={field}
                value={c.phone ?? ""}
                onChange={(e) => patchEmergency(i, { phone: e.target.value })}
              />
            </Field>
          </div>

          <div className="pt-2 border-t border-border space-y-4">
            <p className="text-xs text-muted pt-2">
              What is this person authorised to do?
            </p>
            {EMERGENCY_CONSENTS.map((q) => (
              <div
                key={q.key}
                className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
              >
                <p className="text-sm text-foreground sm:pr-6 min-w-0 leading-relaxed">
                  {q.label}
                  <span className="text-red-500"> *</span>
                </p>
                <div className="shrink-0">
                  <YesNo
                    label={q.label}
                    value={c[q.key]}
                    onChange={(v) => patchEmergency(i, { [q.key]: v })}
                  />
                </div>
              </div>
            ))}
          </div>
        </RepeatCard>
      ))}

      <button
        type="button"
        onClick={() => onChange({ emergency: [...emergency, {}] })}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
      >
        <Plus className="w-4 h-4" /> Add another emergency contact
      </button>

      <p className="text-xs text-muted">
        Questions about any of this? Email{" "}
        <a href={`mailto:${ENROLMENTS_EMAIL}`} className="underline font-medium">
          {ENROLMENTS_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
