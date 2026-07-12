"use client";

import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  EnrolmentFormData,
  ChildDetails,
  CULTURAL_OPTIONS,
  AUSTRALIAN_STATES,
  COUNTRY_OF_BIRTH_QUICK_PICKS,
  DOCUMENT_TYPES,
  KNOWN_SCHOOLS,
  KNOWN_SCHOOL_OPTIONS,
} from "../types";
import { stateFromPostcode } from "@/lib/au-postcodes";

interface Props {
  data: EnrolmentFormData;
  updateData: (
    d:
      | Partial<EnrolmentFormData>
      | ((prev: EnrolmentFormData) => Partial<EnrolmentFormData>)
  ) => void;
  onAddChild: () => void;
  onRemoveChild: (index: number) => void;
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-foreground/80 mb-1">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
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
      <FieldLabel label={label} required={required} />
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

/**
 * Quick-pick segmented control for "Country of Birth".
 * Stores the final display string directly on the child record:
 *   - Australia / New Zealand pills → that exact label
 *   - "Other" → reveals a text input; whatever is typed becomes the value
 * Derivation rule: if `value` matches a quick-pick label exactly, that
 * pill is selected; if `value` is non-empty and not a quick-pick, the
 * Other pill is selected with the text pre-filled.
 */
function CountryOfBirthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isQuickPick = COUNTRY_OF_BIRTH_QUICK_PICKS.some((p) => p === value);
  const otherSelected = !isQuickPick && value !== "";
  // local controlled flag so the Other input shows immediately on click
  // even before any keystroke has populated `value`.
  const [showOther, setShowOther] = useState(otherSelected);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {COUNTRY_OF_BIRTH_QUICK_PICKS.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setShowOther(false);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                selected
                  ? "bg-brand/10 border-brand text-brand"
                  : "bg-surface/50 border-border text-muted hover:bg-surface"
              }`}
            >
              {opt}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setShowOther(true);
            // Clear quick-pick selection if user is switching from one
            if (isQuickPick) onChange("");
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            showOther || otherSelected
              ? "bg-brand/10 border-brand text-brand"
              : "bg-surface/50 border-border text-muted hover:bg-surface"
          }`}
        >
          Other
        </button>
      </div>
      {(showOther || otherSelected) && (
        <input
          type="text"
          value={otherSelected ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the country of birth"
          autoFocus={showOther && !otherSelected}
          className="mt-2 w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
        />
      )}
    </div>
  );
}

/**
 * Multi-campus school picker. Renders a grouped <select> so parents pick
 * the exact campus (e.g. "Malek Fahd Greenacre") instead of typing a
 * bare "Malek Fahd" that a coordinator later has to disambiguate.
 *
 * Value shape (stored on ChildDetails.schoolName as a single string):
 *   - Empty       → no selection
 *   - Quick-pick  → e.g. "Malek Fahd Greenacre" — exact match against
 *                   KNOWN_SCHOOL_OPTIONS
 *   - Other       → whatever the parent typed into the "Other school"
 *                   text input
 * Derivation: if `value` matches a known option we render the select
 * with that option chosen; otherwise if non-empty we render the "Other"
 * mode with the text input pre-filled.
 */
function SchoolPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isKnown = KNOWN_SCHOOL_OPTIONS.includes(value);
  const otherSelected = !isKnown && value !== "";
  const [showOther, setShowOther] = useState(otherSelected);

  const selectValue = otherSelected || showOther
    ? "__other"
    : isKnown
      ? value
      : "";

  return (
    <div>
      <FieldLabel label="School" />
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other") {
            setShowOther(true);
            if (isKnown) onChange("");
          } else {
            setShowOther(false);
            onChange(v);
          }
        }}
        className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-card"
      >
        <option value="">Select school...</option>
        {KNOWN_SCHOOLS.map((school) => (
          <optgroup key={school.name} label={school.name}>
            {school.campuses.map((campus) => {
              const optionValue = `${school.name} ${campus}`;
              return (
                <option key={campus} value={optionValue}>
                  {campus}
                </option>
              );
            })}
          </optgroup>
        ))}
        <option value="__other">Other school…</option>
      </select>
      {(showOther || otherSelected) && (
        <input
          type="text"
          value={otherSelected ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your child's school"
          autoFocus={showOther && !otherSelected}
          className="mt-2 w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
        />
      )}
    </div>
  );
}

export function ChildDetailsStep({ data, updateData, onAddChild, onRemoveChild }: Props) {
  // Use functional updater so rapid back-to-back calls (e.g. postcode handler
  // firing updateChild(i, "postcode", ...) then updateChild(i, "state", ...)
  // on the same keystroke) each see the latest state instead of the stale
  // `data` captured in this render's closure.
  const updateChild = (index: number, field: keyof ChildDetails, value: string | string[]) => {
    updateData((prev) => {
      const children = [...prev.children];
      children[index] = { ...children[index], [field]: value };
      return { children };
    });
  };

  const batchUpdateChild = (index: number, fields: Partial<ChildDetails>) => {
    const children = [...data.children];
    children[index] = { ...children[index], ...fields };
    updateData({ children });
  };

  return (
    <div className="space-y-8">
      {data.children.map((child, i) => (
        <div key={i} className="relative">
          {data.children.length > 1 && (
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Child {i + 1}: {child.firstName || ""}
              </h3>
              <button
                onClick={() => onRemoveChild(i)}
                className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First Name"
              value={child.firstName}
              onChange={(v) => updateChild(i, "firstName", v)}
              required
            />
            <Input
              label="Surname"
              value={child.surname}
              onChange={(v) => updateChild(i, "surname", v)}
              required
            />
            <Input
              label="Date of Birth"
              value={child.dob}
              onChange={(v) => updateChild(i, "dob", v)}
              type="date"
              required
            />
            <div>
              <FieldLabel label="Gender" />
              <select
                value={child.gender}
                onChange={(e) => updateChild(i, "gender", e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-card"
              >
                <option value="">Select...</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <FieldLabel label="Country of Birth" required />
            <CountryOfBirthPicker
              value={child.countryOfBirth}
              onChange={(v) => updateChild(i, "countryOfBirth", v)}
            />
          </div>

          <h4 className="text-sm font-semibold text-muted mt-6 mb-3">Address</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Street"
                value={child.street}
                onChange={(v) => updateChild(i, "street", v)}
              />
            </div>
            <Input
              label="Suburb"
              value={child.suburb}
              onChange={(v) => updateChild(i, "suburb", v)}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="State" />
                <select
                  value={child.state}
                  onChange={(e) => updateChild(i, "state", e.target.value)}
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
                value={child.postcode}
                onChange={(v) => {
                  const digits = v.replace(/\D/g, "").slice(0, 4);
                  if (digits.length === 4) {
                    const state = stateFromPostcode(digits);
                    batchUpdateChild(i, state ? { postcode: digits, state } : { postcode: digits });
                  } else {
                    updateChild(i, "postcode", digits);
                  }
                }}
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
          </div>

          <h4 className="text-sm font-semibold text-muted mt-6 mb-3">
            Cultural / Language Background
          </h4>
          <div className="flex flex-wrap gap-2">
            {CULTURAL_OPTIONS.map((opt) => (
              <label
                key={opt}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors border ${
                  child.culturalBackground.includes(opt)
                    ? "bg-brand/10 border-brand text-brand font-medium"
                    : "bg-surface/50 border-border text-muted hover:bg-surface"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={child.culturalBackground.includes(opt)}
                  onChange={(e) => {
                    const val = e.target.checked
                      ? [...child.culturalBackground, opt]
                      : child.culturalBackground.filter((c) => c !== opt);
                    updateChild(i, "culturalBackground", val);
                  }}
                />
                {opt}
              </label>
            ))}
          </div>

          <h4 className="text-sm font-semibold text-muted mt-6 mb-3">School</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SchoolPicker
              value={child.schoolName}
              onChange={(v) => updateChild(i, "schoolName", v)}
            />
            <Input
              label="Class"
              value={child.yearLevel}
              onChange={(v) => updateChild(i, "yearLevel", v)}
              placeholder="e.g. 4A, K Blue"
            />
          </div>

          {/* Documents Upload */}
          <h4 className="text-sm font-semibold text-muted mt-6 mb-3">
            Documents
          </h4>
          <p className="text-xs text-muted mb-3">
            Please upload the following documents for {child.firstName || `this child`}.
          </p>
          <div className="space-y-3">
            {DOCUMENT_TYPES.map((docType) => (
              <DocumentUploadRow
                key={docType.value}
                childIndex={i}
                docType={docType.value}
                label={docType.label}
                data={data}
                updateData={updateData}
              />
            ))}
          </div>

          {i < data.children.length - 1 && (
            <hr className="mt-8 border-border" />
          )}
        </div>
      ))}

      <button
        onClick={onAddChild}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-border text-muted hover:border-brand hover:text-brand transition-colors text-sm font-medium w-full justify-center"
      >
        <Plus className="h-4 w-4" />
        Add Another Child
      </button>
    </div>
  );
}

function DocumentUploadRow({
  childIndex,
  docType,
  label,
  data,
  updateData,
}: {
  childIndex: number;
  docType: string;
  label: string;
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = data.documentUploads.filter(
    (d) => d.childIndex === childIndex && d.type === docType
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Client-side size check (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File is too large. Maximum size is 10 MB.");
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onerror = () => {
        setError("Could not read the file. Please try again.");
        setUploading(false);
      };
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          const res = await fetch("/api/upload/enrolment-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: base64, filename: file.name, contentType: file.type }),
          });
          if (res.ok) {
            const { fileUrl, fileName } = await res.json();
            updateData({
              documentUploads: [
                ...data.documentUploads,
                { childIndex, type: docType, filename: fileName, url: fileUrl },
              ],
            });
          } else {
            const body = await res.json().catch(() => null);
            setError(body?.error || "Upload failed. Please try again.");
          }
        } catch {
          setError("Upload failed. Please check your connection and try again.");
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setError("Could not process the file. Please try a different file.");
      setUploading(false);
    }
  };

  const removeFile = (filename: string) => {
    updateData({
      documentUploads: data.documentUploads.filter(
        (d) => !(d.childIndex === childIndex && d.type === docType && d.filename === filename)
      ),
    });
  };

  return (
    <div className="bg-surface/50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-foreground/80">{label}</span>
      </div>
      {existing.map((f, fi) => (
        <div
          key={fi}
          className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 px-3 py-1.5 rounded-lg mb-2"
        >
          <span className="truncate flex-1">{f.filename}</span>
          <button
            type="button"
            onClick={() => removeFile(f.filename)}
            className="text-red-500 hover:text-red-700 shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg mb-2">
          {error}
        </div>
      )}
      {existing.length === 0 && (
        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-sm text-muted hover:border-brand hover:text-brand cursor-pointer transition-colors">
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading..." : `Upload ${label.toLowerCase()}`}
          <input
            type="file"
            className="sr-only"
            onChange={handleUpload}
            accept=".pdf,.jpg,.jpeg,.png"
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
