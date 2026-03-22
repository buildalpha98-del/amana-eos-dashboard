"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EnrolmentFormData, ParentDetails, AUSTRALIAN_STATES } from "../types";
import { stateFromPostcode } from "@/lib/au-postcodes";

interface Props {
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
}

function Input({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground/80 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
      />
    </div>
  );
}

function ParentSection({
  title,
  parent,
  onChange,
  required,
  childAddress,
  onCopyChildAddress,
}: {
  title: string;
  parent: ParentDetails;
  onChange: (field: keyof ParentDetails, value: string) => void;
  required?: boolean;
  childAddress?: { street: string; suburb: string; state: string; postcode: string };
  onCopyChildAddress?: () => void;
}) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="First Name" value={parent.firstName} onChange={(v) => onChange("firstName", v)} required={required} />
        <Input label="Surname" value={parent.surname} onChange={(v) => onChange("surname", v)} required={required} />
        <Input label="Date of Birth" value={parent.dob} onChange={(v) => onChange("dob", v)} type="date" required={required} />
        <Input label="Email" value={parent.email} onChange={(v) => onChange("email", v)} type="email" required={required} />
        <Input label="Mobile" value={parent.mobile} onChange={(v) => onChange("mobile", v)} type="tel" required={required} />
        <Input label="Relationship to Child" value={parent.relationship} onChange={(v) => onChange("relationship", v)} required={required} />
      </div>

      <div className="flex items-center justify-between mt-6 mb-3">
        <h4 className="text-sm font-semibold text-muted">Address</h4>
        {onCopyChildAddress && (
          <button
            type="button"
            onClick={onCopyChildAddress}
            className="text-xs text-brand hover:underline"
          >
            Same as child's address
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input label="Street" value={parent.street} onChange={(v) => onChange("street", v)} />
        </div>
        <Input label="Suburb" value={parent.suburb} onChange={(v) => onChange("suburb", v)} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">State</label>
            <select
              value={parent.state}
              onChange={(e) => onChange("state", e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-card"
            >
              <option value="">Select...</option>
              {AUSTRALIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <Input
            label="Postcode"
            value={parent.postcode}
            onChange={(v) => {
              onChange("postcode", v);
              if (v.length === 4) {
                const state = stateFromPostcode(v);
                if (state) onChange("state", state);
              }
            }}
          />
        </div>
      </div>

      <h4 className="text-sm font-semibold text-muted mt-6 mb-3">Employment</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Occupation" value={parent.occupation} onChange={(v) => onChange("occupation", v)} />
        <Input label="Workplace" value={parent.workplace} onChange={(v) => onChange("workplace", v)} />
        <Input label="Work Phone" value={parent.workPhone} onChange={(v) => onChange("workPhone", v)} type="tel" />
        <Input label="CRN (Customer Reference Number)" value={parent.crn} onChange={(v) => onChange("crn", v)} required={required} />
      </div>
    </div>
  );
}

export function ParentDetailsStep({ data, updateData }: Props) {
  const [showSecondary, setShowSecondary] = useState(true);

  const updatePrimary = (field: keyof ParentDetails, value: string) => {
    updateData({ primaryParent: { ...data.primaryParent, [field]: value } });
  };

  const updateSecondary = (field: keyof ParentDetails, value: string) => {
    updateData({ secondaryParent: { ...data.secondaryParent, [field]: value } });
  };

  const copyChildAddress = () => {
    const child = data.children[0];
    updateData({
      primaryParent: {
        ...data.primaryParent,
        street: child.street,
        suburb: child.suburb,
        state: child.state,
        postcode: child.postcode,
      },
    });
  };

  return (
    <div className="space-y-8">
      <ParentSection
        title="Primary Parent / Guardian"
        parent={data.primaryParent}
        onChange={updatePrimary}
        required
        childAddress={data.children[0]}
        onCopyChildAddress={copyChildAddress}
      />

      {/* Child CRNs */}
      {data.children.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-muted mb-3">
            Child CRN (Customer Reference Number)
          </h4>
          <div className="space-y-3">
            {data.children.map((child, i) => (
              <div key={i}>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {child.firstName || `Child ${i + 1}`}
                </label>
                <input
                  value={child.crn}
                  onChange={(e) => {
                    const children = [...data.children];
                    children[i] = { ...children[i], crn: e.target.value };
                    updateData({ children });
                  }}
                  placeholder="CRN"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <hr className="border-border" />

      <button
        onClick={() => setShowSecondary(!showSecondary)}
        className="flex items-center gap-2 text-brand font-medium text-sm hover:underline"
      >
        {showSecondary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showSecondary ? "Hide" : "Add"} Secondary Parent / Guardian
      </button>

      {showSecondary && (
        <>
          <ParentSection
            title="Secondary Parent / Guardian"
            parent={data.secondaryParent}
            onChange={updateSecondary}
          />

          <div className="mt-6">
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Does the primary parent/guardian have sole custody?
            </label>
            <div className="flex gap-3">
              {[true, false].map((opt) => (
                <button
                  key={String(opt)}
                  type="button"
                  onClick={() =>
                    updateData({
                      primaryParent: { ...data.primaryParent, soleCustody: opt },
                    })
                  }
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    data.primaryParent.soleCustody === opt
                      ? opt
                        ? "bg-green-50 border-green-300 text-green-700"
                        : "bg-red-50 border-red-300 text-red-700"
                      : "bg-surface/50 border-border text-muted hover:bg-surface"
                  }`}
                >
                  {opt ? "Yes" : "No"}
                </button>
              ))}
            </div>
            {data.primaryParent.soleCustody === true && (
              <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                If applicable, please upload any court orders or custody documents in the Consents section.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
