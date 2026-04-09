"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertCircle, Check, CheckCircle, ChevronLeft, ChevronRight, Clock, FileText, Loader2, Mail, Phone, RotateCcw } from "lucide-react";
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
  /** Pre-fill and lock primary parent fields (portal sibling enrolment) */
  parentPrefill?: import("./types").ParentDetails;
  /** Step indices to skip (e.g. [1] to skip Parent step) */
  skipSteps?: number[];
  /** Called on successful submission instead of showing the success screen */
  onComplete?: (result: { token: string; childNames: string }) => void;
  /** Visual variant: "standalone" = dark bg (default), "portal" = neutral bg */
  variant?: "standalone" | "portal";
}

export function EnrolmentWizard({
  prefillToken,
  parentPrefill,
  skipSteps = [],
  onComplete,
  variant = "standalone",
}: EnrolmentWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<EnrolmentFormData>(INITIAL_FORM_DATA);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    token: string;
    childNames: string;
    parentName: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const savedProgressRef = useRef<{ data: EnrolmentFormData; step: number } | null>(null);

  // Load from localStorage — merge with prefill if both exist
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    let savedData: { data: EnrolmentFormData; step: number } | null = null;
    if (saved) {
      try {
        savedData = JSON.parse(saved);
      } catch {
        // ignore corrupt data
      }
    }

    if (prefillToken) {
      fetch(`/api/enrol/${prefillToken}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((prefill) => {
          if (prefill && savedData) {
            // Both saved progress and prefill exist — check if saved has real data
            const hasFilledFields = savedData.data.primaryParent?.firstName ||
              savedData.data.children?.[0]?.firstName;
            if (hasFilledFields) {
              // Show resume banner — let parent choose
              savedProgressRef.current = savedData;
              setData((prev) => ({ ...prev, ...prefill }));
              setShowResumeBanner(true);
            } else {
              setData((prev) => ({ ...prev, ...prefill }));
            }
          } else if (prefill) {
            setData((prev) => ({ ...prev, ...prefill }));
          } else if (savedData) {
            setData((prev) => ({ ...prev, ...savedData!.data }));
            setStep(savedData.step || 0);
          }
          setLoaded(true);
        })
        .catch(() => {
          if (savedData) {
            setData((prev) => ({ ...prev, ...savedData!.data }));
            setStep(savedData.step || 0);
          }
          setLoaded(true);
        });
    } else if (savedData) {
      const hasFilledFields = savedData.data.primaryParent?.firstName ||
        savedData.data.children?.[0]?.firstName;
      if (hasFilledFields && savedData.step > 0) {
        setShowResumeBanner(true);
      }
      setData((prev) => ({ ...prev, ...savedData!.data }));
      setStep(savedData.step || 0);
      setLoaded(true);
    } else {
      setLoaded(true);
    }
  }, [prefillToken]);

  // Inject parentPrefill into form data when provided (portal sibling enrolment)
  useEffect(() => {
    if (parentPrefill && loaded) {
      setData((prev) => ({
        ...prev,
        primaryParent: { ...prev.primaryParent, ...parentPrefill },
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentPrefill, loaded]);

  // Persist to localStorage on change
  useEffect(() => {
    if (loaded && !submitted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, step }));
    }
  }, [data, step, loaded, submitted]);

  // Warn before closing tab if form has progress
  useEffect(() => {
    const hasProgress = step > 0 || data.primaryParent.firstName || data.children[0]?.firstName;
    if (!hasProgress || submitted) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step, data.primaryParent.firstName, data.children, submitted]);

  const handleResumeProgress = () => {
    if (savedProgressRef.current) {
      setData((prev) => ({ ...prev, ...savedProgressRef.current!.data }));
      setStep(savedProgressRef.current.step || 0);
    }
    setShowResumeBanner(false);
  };

  const handleStartFresh = () => {
    localStorage.removeItem(STORAGE_KEY);
    savedProgressRef.current = null;
    setShowResumeBanner(false);
  };

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
    let nextStep = step + 1;
    while (nextStep < STEPS.length && skipSteps.includes(nextStep)) {
      nextStep++;
    }
    setStep(Math.min(STEPS.length - 1, nextStep));
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
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Submission failed");
      }
      localStorage.removeItem(STORAGE_KEY);
      if (onComplete) {
        onComplete({ token: result.token, childNames: result.childNames });
        return;
      }
      setSubmitResult({
        token: result.token,
        childNames: result.childNames,
        parentName: result.parentName,
      });
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
    const TIMELINE = [
      {
        icon: CheckCircle,
        title: "Form Received",
        description: "Your enrolment has been submitted successfully.",
        status: "done" as const,
      },
      {
        icon: Mail,
        title: "Confirmation Email Sent",
        description: `A confirmation email has been sent to ${data.primaryParent.email}.`,
        status: "done" as const,
      },
      {
        icon: FileText,
        title: "Under Review",
        description: "Our team will review your details within 1-2 business days.",
        status: "current" as const,
      },
      {
        icon: Phone,
        title: "We'll Be in Touch",
        description: "A coordinator will contact you to confirm booking details and answer any questions.",
        status: "upcoming" as const,
      },
      {
        icon: Clock,
        title: "First Session",
        description: "We'll send you a 'What to Bring' guide before your child's first day.",
        status: "upcoming" as const,
      },
    ];

    return (
      <div className="space-y-6">
        <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Welcome to the Amana Family!
          </h2>
          <p className="text-muted">
            Thank you{submitResult?.parentName ? `, ${submitResult.parentName.split(" ")[0]}` : ""}! Your enrolment
            {submitResult?.childNames ? ` for ${submitResult.childNames}` : ""} has been submitted.
          </p>
        </div>

        {/* What Happens Next */}
        <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 sm:p-8">
          <h3 className="text-lg font-bold text-foreground mb-6">What Happens Next</h3>
          <div className="space-y-0">
            {TIMELINE.map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      item.status === "done"
                        ? "bg-green-100 text-green-600"
                        : item.status === "current"
                        ? "bg-brand/10 text-brand"
                        : "bg-surface text-muted"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                  </div>
                  {i < TIMELINE.length - 1 && (
                    <div
                      className={`w-0.5 h-full min-h-[24px] ${
                        item.status === "done" ? "bg-green-200" : "bg-border"
                      }`}
                    />
                  )}
                </div>
                <div className="pb-6">
                  <p
                    className={`text-sm font-semibold ${
                      item.status === "done"
                        ? "text-green-700"
                        : item.status === "current"
                        ? "text-brand"
                        : "text-muted"
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="text-sm text-muted mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status tracking link */}
        {submitResult?.token && (
          <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 text-center">
            <p className="text-sm text-muted mb-3">
              Bookmark this link to check your enrolment status anytime:
            </p>
            <a
              href={`/enrol/status/${submitResult.token}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-medium hover:bg-brand-hover transition-colors"
            >
              <FileText className="h-4 w-4" />
              Track My Enrolment
            </a>
          </div>
        )}

        {/* Contact info */}
        <div className="text-center text-white/60 text-sm">
          <p>
            Questions? Contact us at{" "}
            <a href="mailto:info@amanaoshc.company" className="text-white/80 underline">
              info@amanaoshc.company
            </a>
          </p>
        </div>
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
                    : "bg-card/20 text-white/60"
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
        <div className="h-1.5 bg-card/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FECE00] rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Resume banner */}
      {showResumeBanner && (
        <div className="mb-4 p-4 bg-[#FECE00]/10 backdrop-blur border border-[#FECE00]/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <RotateCcw className="h-5 w-5 text-[#FECE00] shrink-0 mt-0.5 sm:mt-0" />
          <div className="flex-1">
            <p className="text-white text-sm font-medium">
              You have saved progress from a previous session
            </p>
            <p className="text-white/60 text-xs mt-0.5">
              Would you like to continue where you left off?
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={handleResumeProgress}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-[#FECE00] text-[#002E3D] text-sm font-semibold hover:bg-[#e5b900] transition-colors"
            >
              Resume
            </button>
            <button
              onClick={handleStartFresh}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-card/20 text-white text-sm font-medium hover:bg-card/30 transition-colors"
            >
              Start Fresh
            </button>
          </div>
        </div>
      )}

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
      <div className="bg-card/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 sm:p-8">
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
              let prevStep = step - 1;
              while (prevStep >= 0 && skipSteps.includes(prevStep)) {
                prevStep--;
              }
              setStep(Math.max(0, prevStep));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={step === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-card/10 text-white font-medium hover:bg-card/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
