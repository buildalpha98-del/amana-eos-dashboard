"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  X,
  Plus,
} from "lucide-react";
import {
  useParentProfile,
  useCreateSiblingEnrolment,
  type CreateSiblingEnrolmentPayload,
} from "@/hooks/useParentPortal";

const STEPS = [
  "Child Details",
  "Care Requirements",
  "Medical",
  "Consents",
  "Review & Submit",
];

const GENDER_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Prefer not to say", label: "Prefer not to say" },
];

const DIETARY_PRESETS = [
  "Halal",
  "Vegetarian",
  "Vegan",
  "Nut-free",
  "Dairy-free",
  "Gluten-free",
];

const SESSION_OPTIONS = [
  { value: "BSC", label: "Before School Care" },
  { value: "ASC", label: "After School Care" },
  { value: "VAC", label: "Vacation Care" },
];

interface FormData {
  // Step 1
  childFirstName: string;
  childLastName: string;
  childDateOfBirth: string;
  childGender: string;
  childSchool: string;
  childYear: string;
  // Step 2
  serviceId: string;
  sessionTypes: string[];
  startDate: string;
  // Step 3
  medicalConditions: string[];
  dietaryRequirements: string[];
  medicationDetails: string;
  anaphylaxisActionPlan: string;
  additionalNeeds: string;
  // Step 4
  consentPhotography: boolean;
  consentSunscreen: boolean;
  consentFirstAid: boolean;
  consentExcursions: boolean;
  copyAuthorisedPickups: boolean;
  copyEmergencyContacts: boolean;
}

const INITIAL_FORM: FormData = {
  childFirstName: "",
  childLastName: "",
  childDateOfBirth: "",
  childGender: "",
  childSchool: "",
  childYear: "",
  serviceId: "",
  sessionTypes: [],
  startDate: "",
  medicalConditions: [],
  dietaryRequirements: [],
  medicationDetails: "",
  anaphylaxisActionPlan: "",
  additionalNeeds: "",
  consentPhotography: false,
  consentSunscreen: false,
  consentFirstAid: false,
  consentExcursions: false,
  copyAuthorisedPickups: true,
  copyEmergencyContacts: true,
};

export function SiblingEnrolmentForm() {
  const router = useRouter();
  const { data: profile } = useParentProfile();
  const createEnrolment = useCreateSiblingEnrolment();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  // Get unique services where parent has enrolled children
  const services = (profile?.children ?? []).reduce<
    Array<{ id: string; name: string }>
  >((acc, child) => {
    if (
      child.serviceId &&
      child.serviceName &&
      !acc.some((s) => s.id === child.serviceId)
    ) {
      acc.push({ id: child.serviceId, name: child.serviceName });
    }
    return acc;
  }, []);

  // Get siblings at selected service for copy settings
  const siblingsAtService = (profile?.children ?? []).filter(
    (c) => c.serviceId === form.serviceId,
  );
  const siblingForCopy = siblingsAtService[0];

  // Validation per step
  const validateStep = (stepIndex: number): boolean => {
    const errs: Record<string, string> = {};

    if (stepIndex === 0) {
      if (!form.childFirstName.trim()) errs.childFirstName = "First name is required";
      if (!form.childLastName.trim()) errs.childLastName = "Last name is required";
      if (!form.childDateOfBirth) errs.childDateOfBirth = "Date of birth is required";
    } else if (stepIndex === 1) {
      if (!form.serviceId) errs.serviceId = "Please select a service";
      if (form.sessionTypes.length === 0) errs.sessionTypes = "Select at least one session type";
    } else if (stepIndex === 3) {
      if (!form.consentPhotography) errs.consentPhotography = "This consent is required";
      if (!form.consentSunscreen) errs.consentSunscreen = "This consent is required";
      if (!form.consentFirstAid) errs.consentFirstAid = "This consent is required";
      if (!form.consentExcursions) errs.consentExcursions = "This consent is required";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = () => {
    if (!validateStep(3)) return; // Re-validate consents

    const payload: CreateSiblingEnrolmentPayload = {
      serviceId: form.serviceId,
      childFirstName: form.childFirstName.trim(),
      childLastName: form.childLastName.trim(),
      childDateOfBirth: form.childDateOfBirth,
      childGender: form.childGender || undefined,
      childSchool: form.childSchool || undefined,
      childYear: form.childYear || undefined,
      sessionTypes: form.sessionTypes,
      startDate: form.startDate || undefined,
      medicalConditions: form.medicalConditions,
      dietaryRequirements: form.dietaryRequirements,
      medicationDetails: form.medicationDetails || undefined,
      anaphylaxisActionPlan: form.anaphylaxisActionPlan || undefined,
      additionalNeeds: form.additionalNeeds || undefined,
      consentPhotography: form.consentPhotography,
      consentSunscreen: form.consentSunscreen,
      consentFirstAid: form.consentFirstAid,
      consentExcursions: form.consentExcursions,
      copyAuthorisedPickups: form.copyAuthorisedPickups,
      copyEmergencyContacts: form.copyEmergencyContacts,
    };

    createEnrolment.mutate(payload, {
      onSuccess: () => {
        router.push("/parent/enrolments");
      },
    });
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i < step
                    ? "bg-green-500 text-white"
                    : i === step
                      ? "bg-[#004E64] text-white"
                      : "bg-[#e8e4df] text-[#7c7c8a]"
                }`}
              >
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-4 sm:w-8 mx-1 ${
                    i < step ? "bg-green-500" : "bg-[#e8e4df]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-sm font-semibold text-[#1a1a2e] text-center">
          {STEPS[step]}
        </p>
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-[#e8e4df]">
        {step === 0 && (
          <Step1ChildDetails form={form} errors={errors} update={update} />
        )}
        {step === 1 && (
          <Step2CareRequirements
            form={form}
            errors={errors}
            update={update}
            services={services}
          />
        )}
        {step === 2 && (
          <Step3Medical form={form} update={update} />
        )}
        {step === 3 && (
          <Step4Consents
            form={form}
            errors={errors}
            update={update}
            siblingName={siblingForCopy ? `${siblingForCopy.firstName}'s` : "sibling's"}
          />
        )}
        {step === 4 && (
          <Step5Review form={form} services={services} />
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-4">
        {step > 0 && (
          <button
            onClick={handleBack}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-[#1a1a2e] bg-white border border-[#e8e4df] rounded-xl hover:bg-[#f8f5f2] transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-[#004E64] rounded-xl hover:bg-[#003d4f] transition-colors min-h-[44px]"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={createEnrolment.isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-[#004E64] rounded-xl hover:bg-[#003d4f] transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {createEnrolment.isPending ? "Submitting..." : "Submit Application"}
          </button>
        )}
      </div>

      {step === 4 && (
        <p className="text-xs text-[#7c7c8a] text-center mt-3">
          Your application will be reviewed by your centre coordinator. You will
          receive an email confirmation once approved.
        </p>
      )}
    </div>
  );
}

// ── Step Components ────────────────────────────────────────

function Step1ChildDetails({
  form,
  errors,
  update,
}: {
  form: FormData;
  errors: Record<string, string>;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField
        label="First Name"
        required
        error={errors.childFirstName}
      >
        <input
          type="text"
          value={form.childFirstName}
          onChange={(e) => update("childFirstName", e.target.value)}
          placeholder="Enter first name"
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px]"
        />
      </FormField>

      <FormField label="Last Name" required error={errors.childLastName}>
        <input
          type="text"
          value={form.childLastName}
          onChange={(e) => update("childLastName", e.target.value)}
          placeholder="Enter last name"
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px]"
        />
      </FormField>

      <FormField label="Date of Birth" required error={errors.childDateOfBirth}>
        <input
          type="date"
          value={form.childDateOfBirth}
          onChange={(e) => update("childDateOfBirth", e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px]"
        />
      </FormField>

      <FormField label="Gender">
        <select
          value={form.childGender}
          onChange={(e) => update("childGender", e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px]"
        >
          {GENDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="School Name">
        <input
          type="text"
          value={form.childSchool}
          onChange={(e) => update("childSchool", e.target.value)}
          placeholder="Enter school name"
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px]"
        />
      </FormField>

      <FormField label="Year Group">
        <input
          type="text"
          value={form.childYear}
          onChange={(e) => update("childYear", e.target.value)}
          placeholder="e.g. Year 3"
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px]"
        />
      </FormField>
    </div>
  );
}

function Step2CareRequirements({
  form,
  errors,
  update,
  services,
}: {
  form: FormData;
  errors: Record<string, string>;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  services: Array<{ id: string; name: string }>;
}) {
  const toggleSession = (value: string) => {
    const current = form.sessionTypes;
    if (current.includes(value)) {
      update("sessionTypes", current.filter((s) => s !== value));
    } else {
      update("sessionTypes", [...current, value]);
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="Service" required error={errors.serviceId}>
        <select
          value={form.serviceId}
          onChange={(e) => update("serviceId", e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px]"
        >
          <option value="">Select a service...</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {services.length === 0 && (
          <p className="text-xs text-red-500 mt-1">
            No services found with enrolled children.
          </p>
        )}
      </FormField>

      <FormField
        label="Session Types"
        required
        error={errors.sessionTypes}
      >
        <div className="space-y-2">
          {SESSION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-3 p-3 rounded-lg border border-[#e8e4df] hover:bg-[#f8f5f2] transition-colors cursor-pointer min-h-[44px]"
            >
              <input
                type="checkbox"
                checked={form.sessionTypes.includes(opt.value)}
                onChange={() => toggleSession(opt.value)}
                className="w-5 h-5 rounded border-[#e8e4df] text-[#004E64] focus:ring-[#004E64]"
              />
              <span className="text-sm font-medium text-[#1a1a2e]">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </FormField>

      <FormField label="Preferred Start Date">
        <input
          type="date"
          value={form.startDate}
          onChange={(e) => update("startDate", e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px]"
        />
      </FormField>
    </div>
  );
}

function Step3Medical({
  form,
  update,
}: {
  form: FormData;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField label="Medical Conditions">
        <TagInput
          tags={form.medicalConditions}
          onChange={(tags) => update("medicalConditions", tags)}
          placeholder="Type and press Enter to add..."
        />
      </FormField>

      <FormField label="Dietary Requirements">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DIETARY_PRESETS.map((preset) => {
            const active = form.dietaryRequirements.includes(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  if (active) {
                    update(
                      "dietaryRequirements",
                      form.dietaryRequirements.filter((d) => d !== preset),
                    );
                  } else {
                    update("dietaryRequirements", [
                      ...form.dietaryRequirements,
                      preset,
                    ]);
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[32px] ${
                  active
                    ? "bg-[#004E64] text-white"
                    : "bg-[#f8f5f2] text-[#7c7c8a] hover:bg-[#e8e4df]"
                }`}
              >
                {preset}
              </button>
            );
          })}
        </div>
        <TagInput
          tags={form.dietaryRequirements.filter(
            (d) => !DIETARY_PRESETS.includes(d),
          )}
          onChange={(custom) => {
            const presets = form.dietaryRequirements.filter((d) =>
              DIETARY_PRESETS.includes(d),
            );
            update("dietaryRequirements", [...presets, ...custom]);
          }}
          placeholder="Add other requirements..."
        />
      </FormField>

      <FormField label="Medication Details">
        <textarea
          value={form.medicationDetails}
          onChange={(e) => update("medicationDetails", e.target.value)}
          placeholder="List any medications your child takes regularly..."
          rows={3}
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px] resize-none"
        />
      </FormField>

      <FormField label="Anaphylaxis Action Plan">
        <textarea
          value={form.anaphylaxisActionPlan}
          onChange={(e) => update("anaphylaxisActionPlan", e.target.value)}
          placeholder="Describe the action plan if applicable..."
          rows={3}
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px] resize-none"
        />
      </FormField>

      <FormField label="Additional Needs">
        <textarea
          value={form.additionalNeeds}
          onChange={(e) => update("additionalNeeds", e.target.value)}
          placeholder="Any additional support needs, behavioural considerations, etc."
          rows={3}
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px] resize-none"
        />
      </FormField>
    </div>
  );
}

function Step4Consents({
  form,
  errors,
  update,
  siblingName,
}: {
  form: FormData;
  errors: Record<string, string>;
  update: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  siblingName: string;
}) {
  const consents: Array<{
    key: keyof FormData;
    label: string;
  }> = [
    { key: "consentPhotography", label: "Photography & social media consent" },
    { key: "consentSunscreen", label: "Sunscreen application consent" },
    { key: "consentFirstAid", label: "First aid treatment consent" },
    { key: "consentExcursions", label: "Excursion participation consent" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3">
          Required Consents
        </h3>
        <div className="space-y-2">
          {consents.map(({ key, label }) => (
            <label
              key={key}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer min-h-[44px] ${
                errors[key]
                  ? "border-red-300 bg-red-50"
                  : "border-[#e8e4df] hover:bg-[#f8f5f2]"
              }`}
            >
              <input
                type="checkbox"
                checked={form[key] as boolean}
                onChange={(e) => update(key, e.target.checked as never)}
                className="w-5 h-5 rounded border-[#e8e4df] text-[#004E64] focus:ring-[#004E64]"
              />
              <span className="text-sm text-[#1a1a2e]">{label}</span>
            </label>
          ))}
        </div>
        {Object.keys(errors).some((k) => k.startsWith("consent")) && (
          <p className="text-xs text-red-500 mt-2">
            All consents are required to proceed.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[#1a1a2e] mb-3">
          Copy from Family Profile
        </h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-[#e8e4df] hover:bg-[#f8f5f2] transition-colors cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={form.copyAuthorisedPickups}
              onChange={(e) => update("copyAuthorisedPickups", e.target.checked)}
              className="w-5 h-5 rounded border-[#e8e4df] text-[#004E64] focus:ring-[#004E64]"
            />
            <span className="text-sm text-[#1a1a2e]">
              Copy authorised pickups from {siblingName} profile
            </span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-[#e8e4df] hover:bg-[#f8f5f2] transition-colors cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={form.copyEmergencyContacts}
              onChange={(e) =>
                update("copyEmergencyContacts", e.target.checked)
              }
              className="w-5 h-5 rounded border-[#e8e4df] text-[#004E64] focus:ring-[#004E64]"
            />
            <span className="text-sm text-[#1a1a2e]">
              Copy emergency contacts from existing family profile
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

function Step5Review({
  form,
  services,
}: {
  form: FormData;
  services: Array<{ id: string; name: string }>;
}) {
  const serviceName =
    services.find((s) => s.id === form.serviceId)?.name ?? "—";

  const sessionLabels: Record<string, string> = {
    BSC: "Before School Care",
    ASC: "After School Care",
    VAC: "Vacation Care",
  };

  return (
    <div className="space-y-4">
      <ReviewSection title="Child Details">
        <ReviewRow label="Name" value={`${form.childFirstName} ${form.childLastName}`} />
        <ReviewRow
          label="Date of Birth"
          value={
            form.childDateOfBirth
              ? new Date(form.childDateOfBirth).toLocaleDateString("en-AU")
              : "—"
          }
        />
        {form.childGender && <ReviewRow label="Gender" value={form.childGender} />}
        {form.childSchool && <ReviewRow label="School" value={form.childSchool} />}
        {form.childYear && <ReviewRow label="Year" value={form.childYear} />}
      </ReviewSection>

      <ReviewSection title="Care Requirements">
        <ReviewRow label="Service" value={serviceName} />
        <ReviewRow
          label="Sessions"
          value={form.sessionTypes.map((s) => sessionLabels[s] || s).join(", ")}
        />
        {form.startDate && (
          <ReviewRow
            label="Start Date"
            value={new Date(form.startDate).toLocaleDateString("en-AU")}
          />
        )}
      </ReviewSection>

      {(form.medicalConditions.length > 0 ||
        form.dietaryRequirements.length > 0 ||
        form.medicationDetails ||
        form.additionalNeeds) && (
        <ReviewSection title="Medical Information">
          {form.medicalConditions.length > 0 && (
            <ReviewRow
              label="Conditions"
              value={form.medicalConditions.join(", ")}
            />
          )}
          {form.dietaryRequirements.length > 0 && (
            <ReviewRow
              label="Dietary"
              value={form.dietaryRequirements.join(", ")}
            />
          )}
          {form.medicationDetails && (
            <ReviewRow label="Medication" value={form.medicationDetails} />
          )}
          {form.additionalNeeds && (
            <ReviewRow label="Additional Needs" value={form.additionalNeeds} />
          )}
        </ReviewSection>
      )}

      <ReviewSection title="Settings">
        <ReviewRow
          label="Copy Pickups"
          value={form.copyAuthorisedPickups ? "Yes" : "No"}
        />
        <ReviewRow
          label="Copy Emergency Contacts"
          value={form.copyEmergencyContacts ? "Yes" : "No"}
        />
      </ReviewSection>
    </div>
  );
}

// ── Shared UI ──────────────────────────────────────────────

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1a1a2e] mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  };

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-1 bg-[#004E64]/10 text-[#004E64] text-xs font-medium rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className="p-0.5 hover:bg-[#004E64]/20 rounded-full"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 text-sm border border-[#e8e4df] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#004E64]/30 min-h-[44px] flex-1"
        />
        <button
          type="button"
          onClick={addTag}
          className="px-3 py-2 bg-[#f8f5f2] border border-[#e8e4df] rounded-lg hover:bg-[#e8e4df] transition-colors min-h-[44px]"
        >
          <Plus className="w-4 h-4 text-[#7c7c8a]" />
        </button>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#e8e4df] rounded-lg p-3">
      <h4 className="text-xs font-semibold text-[#7c7c8a] uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs text-[#7c7c8a]">{label}</span>
      <span className="text-xs font-medium text-[#1a1a2e] text-right">
        {value}
      </span>
    </div>
  );
}
