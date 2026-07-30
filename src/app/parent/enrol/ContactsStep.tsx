"use client";

/**
 * Step 3 — second parent, emergency contacts, and authorised pickup.
 *
 * Two emergency contacts are required and must be different people. One
 * contact is a single point of failure, which is the exact thing the
 * requirement exists to prevent.
 */

import { Plus } from "lucide-react";
import { field, Field, RepeatCard, SectionHeading, YesNo } from "./ui";
import type { DraftContact, DraftContacts } from "@/lib/enrol-draft";
import { RELATIONSHIP_OPTIONS } from "@/components/enrol/types";

function ContactFields({
  idPrefix,
  value,
  onChange,
  withEmail,
}: {
  idPrefix: string;
  value: DraftContact;
  onChange: (p: Partial<DraftContact>) => void;
  withEmail?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field id={`${idPrefix}-name`} label="Full name" required>
        <input
          id={`${idPrefix}-name`}
          className={field}
          value={value.name ?? ""}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <Field id={`${idPrefix}-rel`} label="Relationship to child" required>
        <select
          id={`${idPrefix}-rel`}
          className={field}
          value={value.relationship ?? ""}
          onChange={(e) => onChange({ relationship: e.target.value })}
        >
          <option value="">Select…</option>
          {RELATIONSHIP_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${idPrefix}-phone`} label="Phone" required>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          className={field}
          value={value.phone ?? ""}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </Field>
      {withEmail && (
        <Field id={`${idPrefix}-email`} label="Email">
          <input
            id={`${idPrefix}-email`}
            type="email"
            className={field}
            value={value.email ?? ""}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}

export function ContactsStep({
  data,
  onChange,
}: {
  data: DraftContacts;
  onChange: (patch: Partial<DraftContacts>) => void;
}) {
  // Always render two emergency rows — the requirement is two, so showing
  // one and hiding the second behind "Add" buries it.
  const emergency = [...(data.emergency ?? [])];
  while (emergency.length < 2) emergency.push({});
  const authorised = data.authorised ?? [];
  const secondary = data.secondaryParent ?? {};

  const patchEmergency = (i: number, p: Partial<DraftContact>) =>
    onChange({
      emergency: emergency.map((c, idx) => (idx === i ? { ...c, ...p } : c)),
    });

  const patchAuthorised = (i: number, p: Partial<DraftContact>) =>
    onChange({
      authorised: authorised.map((c, idx) => (idx === i ? { ...c, ...p } : c)),
    });

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          Second parent or carer{" "}
          <span className="font-normal text-muted">(optional)</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="sp-first" label="First name">
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
          <Field id="sp-last" label="Last name">
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
          <Field id="sp-email" label="Email">
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
          <Field id="sp-mobile" label="Mobile">
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
        </div>
      </div>

      <SectionHeading>Emergency contacts</SectionHeading>
      <p className="text-xs text-muted -mt-2">
        Two people we can reach if we can&apos;t reach you. They must be two
        different people.
      </p>

      {emergency.map((c, i) => (
        <RepeatCard
          key={i}
          title={`Emergency contact ${i + 1}`}
          onRemove={i >= 2 ? () => onChange({ emergency: emergency.filter((_, x) => x !== i) }) : undefined}
        >
          <ContactFields
            idPrefix={`ec${i}`}
            value={c}
            onChange={(p) => patchEmergency(i, p)}
            withEmail
          />
        </RepeatCard>
      ))}

      <button
        type="button"
        onClick={() => onChange({ emergency: [...emergency, {}] })}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
      >
        <Plus className="w-4 h-4" /> Add another emergency contact
      </button>

      <SectionHeading>Authorised for pickup</SectionHeading>
      <p className="text-xs text-muted -mt-2">
        Anyone else allowed to collect your child. We will not release a
        child to someone who isn&apos;t listed here.
      </p>

      {authorised.map((c, i) => (
        <RepeatCard
          key={i}
          title={c.name?.trim() || `Authorised person ${i + 1}`}
          onRemove={() =>
            onChange({ authorised: authorised.filter((_, x) => x !== i) })
          }
        >
          <ContactFields
            idPrefix={`ap${i}`}
            value={c}
            onChange={(p) => patchAuthorised(i, p)}
          />
        </RepeatCard>
      ))}

      <button
        type="button"
        onClick={() => onChange({ authorised: [...authorised, {}] })}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
      >
        <Plus className="w-4 h-4" /> Add an authorised person
      </button>

      <div className="pt-4 border-t border-border">
        <span className="block text-sm font-medium text-foreground mb-2">
          Are there any court orders or parenting plans we need to know about?
        </span>
        <YesNo
          label="Court orders"
          value={data.courtOrders}
          onChange={(v) => onChange({ courtOrders: v })}
        />
        {data.courtOrders && (
          <p className="mt-2 text-xs text-muted">
            Please email a copy to director@amanaoshc.com.au. We can&apos;t act
            on an order we haven&apos;t seen.
          </p>
        )}
      </div>
    </div>
  );
}
