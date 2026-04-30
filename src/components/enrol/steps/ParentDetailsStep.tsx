"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Upload, Trash2 } from "lucide-react";
import { EnrolmentFormData, ParentDetails, AUSTRALIAN_STATES, RELATIONSHIP_OPTIONS } from "../types";
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
  maxLength,
  inputMode,
  pattern,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: "numeric" | "tel" | "text";
  pattern?: string;
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
        maxLength={maxLength}
        inputMode={inputMode}
        pattern={pattern}
        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
      />
    </div>
  );
}

function ParentSection({
  title,
  parent,
  onChange,
  onBatchChange,
  required,
  childAddress,
  onCopyChildAddress,
  copyAddressLabel,
}: {
  title: string;
  parent: ParentDetails;
  onChange: (field: keyof ParentDetails, value: string) => void;
  onBatchChange?: (fields: Partial<ParentDetails>) => void;
  required?: boolean;
  childAddress?: { street: string; suburb: string; state: string; postcode: string };
  onCopyChildAddress?: () => void;
  copyAddressLabel?: string;
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
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            Relationship to Child
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <select
            value={parent.relationship}
            onChange={(e) => onChange("relationship", e.target.value)}
            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-card"
          >
            <option value="">Select...</option>
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 mb-3">
        <h4 className="text-sm font-semibold text-muted">Address</h4>
        {onCopyChildAddress && (
          <button
            type="button"
            onClick={onCopyChildAddress}
            className="text-xs text-brand hover:underline"
          >
            {copyAddressLabel || "Same as child's address"}
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
              const digits = v.replace(/\D/g, "").slice(0, 4);
              if (digits.length === 4 && onBatchChange) {
                const state = stateFromPostcode(digits);
                onBatchChange(state ? { postcode: digits, state } : { postcode: digits });
              } else {
                onChange("postcode", digits);
              }
            }}
            maxLength={4}
            inputMode="numeric"
            pattern="[0-9]*"
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
  const [uploading, setUploading] = useState(false);

  const updatePrimary = (field: keyof ParentDetails, value: string) => {
    updateData({ primaryParent: { ...data.primaryParent, [field]: value } });
  };

  const batchUpdatePrimary = (fields: Partial<ParentDetails>) => {
    updateData({ primaryParent: { ...data.primaryParent, ...fields } });
  };

  const updateSecondary = (field: keyof ParentDetails, value: string) => {
    updateData({ secondaryParent: { ...data.secondaryParent, [field]: value } });
  };

  const batchUpdateSecondary = (fields: Partial<ParentDetails>) => {
    updateData({ secondaryParent: { ...data.secondaryParent, ...fields } });
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

  const handleCourtOrderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch("/api/upload/enrolment-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: base64, filename: file.name, contentType: file.type }),
        });
        if (res.ok) {
          const { fileUrl, fileName } = await res.json();
          updateData({
            courtOrderFiles: [...data.courtOrderFiles, { filename: fileName, url: fileUrl }],
          });
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <ParentSection
        title="Primary Parent / Guardian"
        parent={data.primaryParent}
        onChange={updatePrimary}
        onBatchChange={batchUpdatePrimary}
        required
        childAddress={data.children[0]}
        onCopyChildAddress={copyChildAddress}
        copyAddressLabel="Same as child's address"
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
                  {child.firstName || `Child ${i + 1}`} <span className="text-red-500 ml-0.5">*</span>
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

      {/* Court Orders question */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Court Orders</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Are there any court orders or parenting orders related to this child?
            </label>
            <div className="flex gap-3">
              {[true, false].map((opt) => (
                <button
                  key={String(opt)}
                  type="button"
                  onClick={() => updateData({ courtOrders: opt })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    data.courtOrders === opt
                      ? opt
                        ? "bg-red-50 border-red-300 text-red-700"
                        : "bg-green-50 border-green-300 text-green-700"
                      : "bg-surface/50 border-border text-muted hover:bg-surface"
                  }`}
                >
                  {opt ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>

          {data.courtOrders && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800 mb-3 font-medium">
                Please upload any relevant court orders or parenting plans.
              </p>

              {data.courtOrderFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg mb-2">
                  <span>{f.filename}</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateData({ courtOrderFiles: data.courtOrderFiles.filter((_, fi) => fi !== i) })
                    }
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-sm text-muted hover:border-brand hover:text-brand cursor-pointer transition-colors">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading..." : "Upload court order document"}
                <input type="file" className="sr-only" onChange={handleCourtOrderUpload} accept=".pdf,.jpg,.jpeg,.png" />
              </label>
            </div>
          )}
        </div>
      </div>

      <hr className="border-border" />

      {/* Secondary parent — hidden when court orders exist */}
      {!data.courtOrders && (
        <>
          <button
            onClick={() => setShowSecondary(!showSecondary)}
            className="flex items-center gap-2 text-brand font-medium text-sm hover:underline"
          >
            {showSecondary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showSecondary ? "Hide" : "Show"} Secondary Parent / Guardian
          </button>

          {showSecondary && (
            <>
              <ParentSection
                title="Secondary Parent / Guardian"
                parent={data.secondaryParent}
                onChange={updateSecondary}
                onBatchChange={batchUpdateSecondary}
                onCopyChildAddress={() => {
                  updateData({
                    secondaryParent: {
                      ...data.secondaryParent,
                      street: data.primaryParent.street,
                      suburb: data.primaryParent.suburb,
                      state: data.primaryParent.state,
                      postcode: data.primaryParent.postcode,
                    },
                  });
                }}
                copyAddressLabel="Same as primary parent"
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
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
