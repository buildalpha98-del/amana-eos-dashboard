"use client";

import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  EnrolmentFormData,
  ChildDetails,
  CULTURAL_OPTIONS,
  AUSTRALIAN_STATES,
  DOCUMENT_TYPES,
} from "../types";
import { stateFromPostcode } from "@/lib/au-postcodes";

interface Props {
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
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
      <FieldLabel label={label} required={required} />
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

export function ChildDetailsStep({ data, updateData, onAddChild, onRemoveChild }: Props) {
  const updateChild = (index: number, field: keyof ChildDetails, value: string | string[]) => {
    const children = [...data.children];
    children[index] = { ...children[index], [field]: value };
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
                className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
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
                  updateChild(i, "postcode", v);
                  if (v.length === 4) {
                    const state = stateFromPostcode(v);
                    if (state) updateChild(i, "state", state);
                  }
                }}
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
            <Input
              label="School Name"
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

  const existing = data.documentUploads.filter(
    (d) => d.childIndex === childIndex && d.type === docType
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
            documentUploads: [
              ...data.documentUploads,
              { childIndex, type: docType, filename: fileName, url: fileUrl },
            ],
          });
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
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
          className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg mb-2"
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
