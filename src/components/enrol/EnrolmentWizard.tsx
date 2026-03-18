"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  EnrolmentFormData,
  INITIAL_FORM_DATA,
  STEPS,
  EMPTY_CHILD,
  EMPTY_MEDICAL,
  EMPTY_BOOKING,
  validateStep,
} from "./types";
import { ChildDetailsStep } from "./steps/ChildDetailsStep";
import { ParentDetailsStep } from "./steps/ParentDetailsStep";
import { MedicalStep } from "./steps/MedicalStep";
import { EmergencyStep } from "./steps/EmergencyStep";
import { ConsentsStep } from "./steps/ConsentsStep";
import { BookingStep } from "./steps/BookingStep";
import { PaymentStep } from "./steps/PaymentStep";
import { ReviewStep } from "./steps/ReviewStep";

const STORAGE_KEY = "amana-enrolment-form";

interface EnrolmentWizardProps {
  prefillToken?: string;
}

export function EnrolmentWizard({ prefillToken }: EnrolmentWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<EnrolmentFormData>(INITIAL_FORM_DATA);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load from localStorage or prefill from token
  useEffect(() => {
    if (prefillToken) {
      fetch(`/api/enrol/${prefillToken}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((prefill) => {
          if (prefill) {
            setData((prev) => ({ ...prev, ...prefill }));
          }
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    } else {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setData((prev) => ({ ...prev, ...parsed.data }));
          setStep(parsed.step || 0);
        } catch {
          // ignore corrupt data
        }
      }
      setLoaded(true);
    }
  }, [prefillToken]);

  // Persist to localStorage on change
  useEffect(() => {
    if (loaded && !submitted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, step }));
    }
  }, [data, step, loaded, submitted]);

  // Clear validation errors when data changes
  useEffect(() => {
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const updateData = useCallback(
    (partial: Partial<EnrolmentFormData>) => {
      setData((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  // Keep medicals & bookingPrefs arrays in sync with children count
  useEffect(() => {
    if (!loaded) return;
    const childCount = data.children.length;
    if (data.medicals.length !== childCount) {
      const medicals = [...data.medicals];
      while (medicals.length < childCount) medicals.push({ ...EMPTY_MEDICAL });
      updateData({ medicals: medicals.slice(0, childCount) });
    }
    if (data.bookingPrefs.length !== childCount) {
      const bookingPrefs = [...data.bookingPrefs];
      while (bookingPrefs.length < childCount) bookingPrefs.push({ ...EMPTY_BOOKING });
      updateData({ bookingPrefs: bookingPrefs.slice(0, childCount) });
    }
  }, [data.children.length, loaded, data.medicals.length, data.bookingPrefs.length, updateData]);

  const handleAddChild = () => {
    updateData({
      children: [...data.children, { ...EMPTY_CHILD }],
      medicals: [...data.medicals, { ...EMPTY_MEDICAL }],
      bookingPrefs: [...data.bookingPrefs, { ...EMPTY_BOOKING }],
    });
  };

  const handleRemoveChild = (index: number) => {
    if (data.children.length <= 1) return;
    updateData({
      children: data.children.filter((_, i) => i !== index),
      medicals: data.medicals.filter((_, i) => i !== index),
      bookingPrefs: data.bookingPrefs.filter((_, i) => i !== index),
    });
  };

  const handleNext = () => {
    const errors = validateStep(step, data);
    if (errors.length > 0) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setValidationErrors([]);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, prefillToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Submission failed" }));
        throw new Error(err.error || "Submission failed");
      }
      localStorage.removeItem(STORAGE_KEY);
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Enrolment Submitted!</h2>
        <p className="text-gray-600 mb-6">
          Thank you for completing your enrolment form. Our team will review your
          submission and be in touch shortly.
        </p>
        <p className="text-sm text-gray-500">
          You will receive a confirmation email with your enrolment details.
        </p>
      </div>
    );
  }

  const stepProps = { data, updateData };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <ChildDetailsStep
            {...stepProps}
            onAddChild={handleAddChild}
            onRemoveChild={handleRemoveChild}
          />
        );
      case 1:
        return <ParentDetailsStep {...stepProps} />;
      case 2:
        return <MedicalStep {...stepProps} />;
      case 3:
        return <EmergencyStep {...stepProps} />;
      case 4:
        return <ConsentsStep {...stepProps} />;
      case 5:
        return <BookingStep {...stepProps} />;
      case 6:
        return <PaymentStep {...stepProps} />;
      case 7:
        return <ReviewStep {...stepProps} onSubmit={handleSubmit} submitting={submitting} />;
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => i <= step && setStep(i)}
              className={`flex flex-col items-center gap-1 transition-all ${
                i <= step ? "cursor-pointer" : "cursor-default opacity-40"
              }`}
            >
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  i < step
                    ? "bg-green-500 text-white"
                    : i === step
                    ? "bg-[#FECE00] text-[#002E3D]"
                    : "bg-white/20 text-white/60"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className="text-[10px] sm:text-xs text-white/80 hidden sm:block font-medium">
                {s.label}
              </span>
            </button>
          ))}
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FECE00] rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step heading */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-white">
          {STEPS[step].icon} {STEPS[step].label}
        </h1>
        <p className="text-white/60 text-sm mt-1">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="mb-4 p-4 bg-red-500/10 backdrop-blur border border-red-400/30 rounded-xl">
          <div className="flex items-center gap-2 text-red-200 font-medium text-sm mb-2">
            <AlertCircle className="h-4 w-4" />
            Please fix the following:
          </div>
          <ul className="space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-red-200/80 text-sm pl-6">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Card */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 sm:p-8">
        {renderStep()}

        {submitError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {submitError}
          </div>
        )}
      </div>

      {/* Navigation */}
      {step < 7 && (
        <div className="flex justify-between mt-6">
          <button
            onClick={() => {
              setValidationErrors([]);
              setStep((s) => Math.max(0, s - 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={step === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#FECE00] text-[#002E3D] font-semibold hover:bg-[#e5b900] transition-colors"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
