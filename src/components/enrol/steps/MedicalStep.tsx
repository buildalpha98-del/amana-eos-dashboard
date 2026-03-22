"use client";

import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { EnrolmentFormData, MedicalInfo, MedicationEntry } from "../types";
import { ChildTabs } from "../ChildTabs";

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

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground/80 mb-2">{label}</label>
      <div className="flex gap-3">
        {[true, false].map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              value === opt
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
  );
}

function FileUploadButton({
  childIndex,
  fileType,
  data,
  updateData,
}: {
  childIndex: number;
  fileType: string;
  data: EnrolmentFormData;
  updateData: (d: Partial<EnrolmentFormData>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const existing = data.medicalFiles.filter(
    (f) => f.childIndex === childIndex && f.type === fileType
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
            medicalFiles: [
              ...data.medicalFiles,
              { childIndex, type: fileType, filename: fileName, url: fileUrl },
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

  return (
    <div className="mt-2">
      {existing.map((f, fi) => (
        <div key={fi} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg mb-1">
          <span>{f.filename}</span>
          <button
            type="button"
            onClick={() =>
              updateData({
                medicalFiles: data.medicalFiles.filter(
                  (mf) => !(mf.childIndex === childIndex && mf.type === fileType && mf.filename === f.filename)
                ),
              })
            }
            className="text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-sm text-muted hover:border-brand hover:text-brand cursor-pointer transition-colors">
        <Upload className="h-4 w-4" />
        {uploading ? "Uploading..." : `Upload ${fileType.replace(/_/g, " ")}`}
        <input type="file" className="sr-only" onChange={handleUpload} accept=".pdf,.jpg,.jpeg,.png" />
      </label>
    </div>
  );
}

export function MedicalStep({ data, updateData }: Props) {
  const [activeChild, setActiveChild] = useState(0);

  const medical = data.medicals[activeChild] || data.medicals[0];

  const updateMedical = (field: keyof MedicalInfo, value: unknown) => {
    const medicals = [...data.medicals];
    medicals[activeChild] = { ...medicals[activeChild], [field]: value };
    updateData({ medicals });
  };

  const addMedication = () => {
    updateMedical("medications", [...medical.medications, { name: "", dosage: "", frequency: "" }]);
  };

  const removeMedication = (i: number) => {
    updateMedical("medications", medical.medications.filter((_, idx) => idx !== i));
  };

  const updateMedication = (i: number, field: keyof MedicationEntry, value: string) => {
    const meds = [...medical.medications];
    meds[i] = { ...meds[i], [field]: value };
    updateMedical("medications", meds);
  };

  return (
    <div className="space-y-6">
      <ChildTabs children={data.children} activeIndex={activeChild} onChange={setActiveChild} />

      <h3 className="text-lg font-semibold text-foreground">
        Medical Information — {data.children[activeChild]?.firstName || `Child ${activeChild + 1}`}
      </h3>

      <h4 className="text-sm font-semibold text-muted">Doctor Details</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Doctor's Name" value={medical.doctorName} onChange={(v) => updateMedical("doctorName", v)} />
        <Input label="Practice" value={medical.doctorPractice} onChange={(v) => updateMedical("doctorPractice", v)} />
        <Input label="Phone" value={medical.doctorPhone} onChange={(v) => updateMedical("doctorPhone", v)} type="tel" />
      </div>

      <h4 className="text-sm font-semibold text-muted mt-6">Medicare</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input label="Medicare Number" value={medical.medicareNumber} onChange={(v) => updateMedical("medicareNumber", v)} />
        <Input label="Reference Number" value={medical.medicareRef} onChange={(v) => updateMedical("medicareRef", v)} />
        <Input label="Expiry Date" value={medical.medicareExpiry} onChange={(v) => updateMedical("medicareExpiry", v)} type="date" />
      </div>

      <div className="space-y-4 mt-6">
        <YesNo label="Immunisation up to date?" value={medical.immunisationUpToDate} onChange={(v) => updateMedical("immunisationUpToDate", v)} />
        {medical.immunisationUpToDate === false && (
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Details</label>
            <textarea
              value={medical.immunisationDetails}
              onChange={(e) => updateMedical("immunisationDetails", e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
        )}

        <YesNo label="Anaphylaxis risk?" value={medical.anaphylaxisRisk} onChange={(v) => updateMedical("anaphylaxisRisk", v)} />
        {medical.anaphylaxisRisk && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 mb-2 font-medium">
              ASCIA Action Plan required
            </p>
            <FileUploadButton childIndex={activeChild} fileType="ascia_action_plan" data={data} updateData={updateData} />
          </div>
        )}

        <YesNo label="Any allergies?" value={medical.allergies} onChange={(v) => updateMedical("allergies", v)} />
        {medical.allergies && (
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Allergy Details</label>
            <textarea
              value={medical.allergyDetails}
              onChange={(e) => updateMedical("allergyDetails", e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            <FileUploadButton childIndex={activeChild} fileType="allergy_plan" data={data} updateData={updateData} />
          </div>
        )}

        <YesNo label="Asthma?" value={medical.asthma} onChange={(v) => updateMedical("asthma", v)} />
        {medical.asthma && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 mb-2 font-medium">Asthma Care Plan required</p>
            <FileUploadButton childIndex={activeChild} fileType="asthma_care_plan" data={data} updateData={updateData} />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Other Medical Conditions</label>
          <textarea
            value={medical.otherConditions}
            onChange={(e) => updateMedical("otherConditions", e.target.value)}
            rows={2}
            placeholder="Any other conditions we should be aware of..."
            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>

        {/* Medications */}
        <div>
          <h4 className="text-sm font-semibold text-muted mb-3">Regular Medications</h4>
          {medical.medications.map((med, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3 items-end">
              <Input label="Name" value={med.name} onChange={(v) => updateMedication(i, "name", v)} />
              <Input label="Dosage" value={med.dosage} onChange={(v) => updateMedication(i, "dosage", v)} />
              <Input label="Frequency" value={med.frequency} onChange={(v) => updateMedication(i, "frequency", v)} />
              <button
                type="button"
                onClick={() => removeMedication(i)}
                className="text-red-500 hover:text-red-700 p-2.5 rounded-lg hover:bg-red-50 transition-colors self-end"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addMedication}
            className="flex items-center gap-2 text-sm text-brand hover:underline"
          >
            <Plus className="h-4 w-4" /> Add Medication
          </button>
        </div>

        {/* Dietary */}
        <YesNo label="Dietary requirements?" value={medical.dietaryRequirements} onChange={(v) => updateMedical("dietaryRequirements", v)} />
        {medical.dietaryRequirements && (
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Dietary Details (halal, vegetarian, allergies, other)
            </label>
            <textarea
              value={medical.dietaryDetails}
              onChange={(e) => updateMedical("dietaryDetails", e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
        )}
      </div>
    </div>
  );
}
