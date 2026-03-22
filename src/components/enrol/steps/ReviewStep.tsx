"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Edit2 } from "lucide-react";
import { EnrolmentFormData, STEPS } from "../types";
import { SignaturePad } from "../SignaturePad";

interface Props {
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
  onSubmit: () => void;
  submitting: boolean;
}

function Section({
  title,
  stepIndex,
  children,
  onEdit,
}: {
  title: string;
  stepIndex: number;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-surface/50 hover:bg-surface transition-colors"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <div className="flex items-center gap-2">
          {onEdit && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="text-xs text-brand hover:underline flex items-center gap-1"
            >
              <Edit2 className="h-3 w-3" /> Edit
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </div>
      </button>
      {open && <div className="p-4 text-sm text-muted space-y-2">{children}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | boolean | null }) {
  if (value === null || value === undefined || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <span className="text-muted sm:w-40 shrink-0">{label}:</span>
      <span className="text-foreground font-medium">{display}</span>
    </div>
  );
}

const REFERRAL_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "social_media", label: "Social Media" },
  { value: "school", label: "School" },
  { value: "friend", label: "Friend / Word of Mouth" },
  { value: "other", label: "Other" },
];

export function ReviewStep({ data, updateData, onSubmit, submitting }: Props) {
  const canSubmit =
    data.termsAccepted &&
    data.privacyAccepted &&
    data.signature &&
    data.children[0]?.firstName &&
    data.primaryParent.firstName &&
    data.primaryParent.email;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted mb-2">
        Please review all details below before submitting your enrolment.
      </p>

      {/* Children */}
      <Section title="Child Details" stepIndex={0}>
        {data.children.map((child, i) => (
          <div key={i} className="mb-3">
            {data.children.length > 1 && (
              <p className="font-semibold text-foreground mb-1">{child.firstName} {child.surname}</p>
            )}
            <Field label="Name" value={`${child.firstName} ${child.surname}`} />
            <Field label="DOB" value={child.dob} />
            <Field label="Gender" value={child.gender} />
            <Field label="Address" value={[child.street, child.suburb, child.state, child.postcode].filter(Boolean).join(", ")} />
            <Field label="School" value={child.schoolName} />
            <Field label="Year" value={child.yearLevel} />
            {child.culturalBackground.length > 0 && (
              <Field label="Cultural Background" value={child.culturalBackground.join(", ")} />
            )}
            {(() => {
              const docs = data.documentUploads.filter((d) => d.childIndex === i);
              return docs.length > 0 ? (
                <Field label="Documents" value={docs.map((d) => d.filename).join(", ")} />
              ) : null;
            })()}
          </div>
        ))}
      </Section>

      {/* Parents */}
      <Section title="Parent / Guardian" stepIndex={1}>
        <p className="font-semibold text-foreground mb-1">Primary</p>
        <Field label="Name" value={`${data.primaryParent.firstName} ${data.primaryParent.surname}`} />
        <Field label="Email" value={data.primaryParent.email} />
        <Field label="Mobile" value={data.primaryParent.mobile} />
        <Field label="Relationship" value={data.primaryParent.relationship} />
        <Field label="Occupation" value={data.primaryParent.occupation} />
        <Field label="CRN" value={data.primaryParent.crn} />
        <Field label="Sole Custody" value={data.primaryParent.soleCustody} />
        {data.secondaryParent.firstName && (
          <>
            <p className="font-semibold text-foreground mt-3 mb-1">Secondary</p>
            <Field label="Name" value={`${data.secondaryParent.firstName} ${data.secondaryParent.surname}`} />
            <Field label="Email" value={data.secondaryParent.email} />
            <Field label="Mobile" value={data.secondaryParent.mobile} />
          </>
        )}
      </Section>

      {/* Medical */}
      <Section title="Medical Information" stepIndex={2}>
        {data.medicals.map((med, i) => (
          <div key={i} className="mb-3">
            {data.children.length > 1 && (
              <p className="font-semibold text-foreground mb-1">
                {data.children[i]?.firstName || `Child ${i + 1}`}
              </p>
            )}
            <Field label="Doctor" value={`${med.doctorName} — ${med.doctorPractice}`} />
            <Field label="Medicare" value={med.medicareNumber} />
            <Field label="Immunisation Up to Date" value={med.immunisationUpToDate} />
            <Field label="Anaphylaxis" value={med.anaphylaxisRisk} />
            <Field label="Allergies" value={med.allergies ? med.allergyDetails : "No"} />
            <Field label="Asthma" value={med.asthma} />
            <Field label="Other Conditions" value={med.otherConditions} />
            <Field label="Dietary" value={med.dietaryRequirements ? med.dietaryDetails : "No"} />
            {med.medications.length > 0 && (
              <Field
                label="Medications"
                value={med.medications.map((m) => `${m.name} (${m.dosage}, ${m.frequency})`).join("; ")}
              />
            )}
          </div>
        ))}
      </Section>

      {/* Emergency Contacts */}
      <Section title="Emergency Contacts" stepIndex={3}>
        {data.emergencyContacts.filter((c) => c.name).map((c, i) => (
          <div key={i}>
            <Field label={`Contact ${i + 1}`} value={`${c.name} (${c.relationship}) — ${c.phone}`} />
          </div>
        ))}
        {data.authorisedPickup.length > 0 && (
          <>
            <p className="font-semibold text-foreground mt-3 mb-1">Authorised Pickup</p>
            {data.authorisedPickup.map((p, i) => (
              <Field key={i} label={p.name} value={p.relationship} />
            ))}
          </>
        )}
      </Section>

      {/* Consents */}
      <Section title="Consents" stepIndex={4}>
        <Field label="First Aid" value={data.consents.firstAid} />
        <Field label="Medication" value={data.consents.medication} />
        <Field label="Ambulance" value={data.consents.ambulance} />
        <Field label="Transport" value={data.consents.transport} />
        <Field label="Excursions" value={data.consents.excursions} />
        <Field label="Photos" value={data.consents.photos} />
        <Field label="Sunscreen" value={data.consents.sunscreen} />
        <Field label="Court Orders" value={data.courtOrders} />
      </Section>

      {/* Booking */}
      <Section title="Booking Preferences" stepIndex={5}>
        {data.bookingPrefs.map((bp, i) => (
          <div key={i} className="mb-3">
            {data.children.length > 1 && (
              <p className="font-semibold text-foreground mb-1">
                {data.children[i]?.firstName || `Child ${i + 1}`}
              </p>
            )}
            <Field label="Sessions" value={bp.sessionTypes.join(", ").toUpperCase()} />
            <Field label="Booking Type" value={bp.bookingType} />
            <Field label="Start Date" value={bp.startDate} />
            <Field label="Requirements" value={bp.requirements} />
          </div>
        ))}
      </Section>

      {/* Payment */}
      <Section title="Payment" stepIndex={6}>
        <Field
          label="Method"
          value={data.payment.method === "credit_card" ? "Credit Card" : data.payment.method === "bank_account" ? "Bank Account" : "Not selected"}
        />
        {data.payment.method === "credit_card" && (
          <Field label="Card" value={`**** **** **** ${data.payment.cardNumber.slice(-4)}`} />
        )}
        {data.payment.method === "bank_account" && (
          <Field label="Account" value={`BSB: ***${data.payment.bankBsb.slice(-3)} Acc: ****${data.payment.bankAccountNumber.slice(-4)}`} />
        )}
        <Field label="Direct Debit Agreement" value={data.debitAgreement} />
      </Section>

      <hr className="border-border my-6" />

      {/* Referral Source */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-2">
          How did you hear about us?
        </label>
        <select
          value={data.referralSource}
          onChange={(e) => updateData({ referralSource: e.target.value })}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-card"
        >
          <option value="">Select...</option>
          {REFERRAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Terms */}
      <div className="space-y-3">
        <label className="flex items-start gap-3 p-4 rounded-xl border bg-surface/50 border-border cursor-pointer">
          <input
            type="checkbox"
            checked={data.termsAccepted}
            onChange={(e) => updateData({ termsAccepted: e.target.checked })}
            className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <div>
            <p className="text-sm font-medium text-foreground">
              Terms & Conditions <span className="text-red-500">*</span>
            </p>
            <p className="text-xs text-muted mt-0.5">
              I accept the Amana OSHC Terms & Conditions.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-4 rounded-xl border bg-surface/50 border-border cursor-pointer">
          <input
            type="checkbox"
            checked={data.privacyAccepted}
            onChange={(e) => updateData({ privacyAccepted: e.target.checked })}
            className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          <div>
            <p className="text-sm font-medium text-foreground">
              Privacy Policy <span className="text-red-500">*</span>
            </p>
            <p className="text-xs text-muted mt-0.5">
              I accept the Amana OSHC Privacy Policy.
            </p>
          </div>
        </label>
      </div>

      {/* Signature */}
      <div>
        <label className="block text-sm font-medium text-foreground/80 mb-2">
          Digital Signature <span className="text-red-500">*</span>
        </label>
        <SignaturePad value={data.signature} onChange={(v) => updateData({ signature: v })} />
      </div>

      {/* Submit */}
      <button
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        className="w-full py-4 rounded-xl bg-brand text-white font-semibold text-base hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit Enrolment"
        )}
      </button>
    </div>
  );
}
