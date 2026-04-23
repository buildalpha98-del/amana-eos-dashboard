"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Download,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  User,
  Baby,
  Heart,
  Phone,
  Shield,
  CreditCard,
  Calendar,
  AlertCircle,
  Eye,
  EyeOff,
  Archive,
  Send,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useEnrolment, useUpdateEnrolment, type EnrolmentSubmission } from "@/hooks/useEnrolments";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";

interface Props {
  enrolmentId: string;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: "Submitted", color: "text-blue-700", bg: "bg-blue-50" },
  under_review: { label: "Reviewing", color: "text-amber-700", bg: "bg-amber-50" },
  processed: { label: "Confirmed", color: "text-green-700", bg: "bg-green-50" },
  needs_info: { label: "Needs Info", color: "text-orange-700", bg: "bg-orange-50" },
  archived: { label: "Archived", color: "text-gray-500", bg: "bg-gray-50" },
};

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3.5 bg-surface/50 hover:bg-surface transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-brand" />
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-foreground/40" />
        ) : (
          <ChevronDown className="h-4 w-4 text-foreground/40" />
        )}
      </button>
      {open && <div className="p-3.5 text-sm space-y-1.5">{children}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | boolean | null }) {
  if (value === null || value === undefined || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  return (
    <div className="flex gap-2">
      <span className="text-foreground/50 w-28 shrink-0 text-xs">{label}</span>
      <span className="text-foreground text-xs font-medium">{display}</span>
    </div>
  );
}

interface DecryptedPayment {
  method: string;
  // Credit card fields
  cardName?: string;
  cardNumber?: string;
  expiryMonth?: string;
  expiryYear?: string;
  ccv?: string;
  // Bank account fields
  accountName?: string;
  bsb?: string;
  accountNumber?: string;
}

function PaymentReveal({ enrolmentId }: { enrolmentId: string }) {
  const [payment, setPayment] = useState<DecryptedPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Auto-hide after 30 seconds
  useEffect(() => {
    if (revealed) {
      clearTimer();
      timerRef.current = setTimeout(() => {
        setRevealed(false);
        setPayment(null);
      }, 30_000);
    }
    return clearTimer;
  }, [revealed, clearTimer]);

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      setPayment(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/enrolments/${enrolmentId}/payment`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to decrypt payment details" }));
        throw new Error(body.error || `Error ${res.status}`);
      }
      const data: DecryptedPayment = await res.json();
      setPayment(data);
      setRevealed(true);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to reveal payment details",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        onClick={handleReveal}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : revealed ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        {loading ? "Decrypting..." : revealed ? "Hide Details" : "Reveal Full Details"}
      </button>

      {revealed && payment && (
        <div className="mt-2 space-y-1.5 bg-amber-50/50 border border-amber-200 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
            Decrypted — auto-hides in 30s
          </p>
          {payment.method === "credit_card" ? (
            <>
              <Field label="Name on Card" value={payment.cardName} />
              <Field label="Card Number" value={payment.cardNumber} />
              <Field
                label="Expiry"
                value={
                  payment.expiryMonth && payment.expiryYear
                    ? `${payment.expiryMonth}/${payment.expiryYear}`
                    : undefined
                }
              />
              <Field label="CCV" value={payment.ccv} />
            </>
          ) : (
            <>
              <Field label="Account Name" value={payment.accountName} />
              <Field label="BSB" value={payment.bsb} />
              <Field label="Account No." value={payment.accountNumber} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function EnrolmentDetailPanel({ enrolmentId, onClose }: Props) {
  const { data: session } = useSession();
  const { data: enrolment, isLoading } = useEnrolment(enrolmentId);
  const updateMutation = useUpdateEnrolment();
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [resending, setResending] = useState(false);
  const canViewPayment = session?.user?.role === "owner" || session?.user?.role === "head_office";

  const handleResendInvite = async () => {
    if (!enrolment) return;
    const email = enrolment.primaryParent?.email;
    const serviceId = enrolment.serviceId;
    if (!email || !serviceId) {
      toast({
        variant: "destructive",
        description: "Cannot resend — missing parent email or service.",
      });
      return;
    }
    setResending(true);
    try {
      const res = await mutateApi<{ sent: boolean; email?: string }>(
        `/api/enrolments/${enrolment.id}/resend-parent-invite`,
        { method: "POST" },
      );
      toast({
        description: res.sent
          ? `Invite email sent to ${res.email}.`
          : "Invite could not be sent.",
      });
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Failed to resend invite.",
      });
    } finally {
      setResending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-background shadow-2xl p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-4 w-32 mb-6" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!enrolment) return null;

  const e = enrolment;
  const pp = e.primaryParent;
  const statusInfo = STATUS_CONFIG[e.status] || STATUS_CONFIG.submitted;
  const childNames = e.children.map((c) => `${c.firstName} ${c.surname}`).join(", ");

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ id: e.id, status: newStatus });
  };

  const handleSaveNotes = () => {
    updateMutation.mutate({ id: e.id, notes });
    setShowNotes(false);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-background shadow-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 p-4 border-b border-border flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {pp.firstName} {pp.surname}
            </h2>
            <p className="text-sm text-foreground/50 mt-0.5">{childNames}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.color} ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
              <span className="text-xs text-foreground/40">
                {new Date(e.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-foreground/50" />
          </button>
        </div>

        {/* Actions bar */}
        <div className="shrink-0 p-3 border-b border-border flex gap-2 flex-wrap">
          <a
            href={`/api/enrolments/${e.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </a>
          {e.status === "submitted" && (
            <button
              onClick={() => handleStatusChange("under_review")}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <Clock className="h-3.5 w-3.5" />
              Mark Reviewing
            </button>
          )}
          {(e.status === "submitted" || e.status === "under_review") && (
            <button
              onClick={() => handleStatusChange("processed")}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Confirm
            </button>
          )}
          <button
            onClick={() => {
              setNotes(e.notes || "");
              setShowNotes(!showNotes);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface text-foreground/70 rounded-lg hover:bg-surface/80 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Notes
          </button>
          {e.status === "processed" && (
            <>
              <button
                onClick={handleResendInvite}
                disabled={resending}
                title="Resend the parent portal log-in email to the primary parent"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {resending ? "Sending..." : "Resend Invite"}
              </button>
              <button
                onClick={() => handleStatusChange("archived")}
                disabled={updateMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
            </>
          )}
        </div>

        {/* Notes editor */}
        {showNotes && (
          <div className="shrink-0 p-3 border-b border-border bg-surface/30">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes about this enrolment..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 bg-background"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setShowNotes(false)}
                className="px-3 py-1 text-xs text-foreground/50 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={updateMutation.isPending}
                className="px-3 py-1 text-xs bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Children */}
          <Section title={`Children (${e.children.length})`} icon={Baby} defaultOpen>
            {e.children.map((child, i) => (
              <div key={i} className={i > 0 ? "pt-2 border-t border-border" : ""}>
                <p className="font-semibold text-foreground text-xs mb-1">
                  {child.firstName} {child.surname}
                </p>
                <Field label="DOB" value={child.dob} />
                <Field label="Gender" value={child.gender} />
                <Field label="School" value={child.schoolName as string} />
                <Field label="Year" value={child.yearLevel as string} />
                <Field label="CRN" value={child.crn as string} />
              </div>
            ))}
          </Section>

          {/* Primary Parent */}
          <Section title="Primary Parent" icon={User} defaultOpen>
            <Field label="Name" value={`${pp.firstName} ${pp.surname}`} />
            <Field label="Email" value={pp.email} />
            <Field label="Mobile" value={pp.mobile} />
            <Field label="Relationship" value={pp.relationship} />
            <Field label="Occupation" value={pp.occupation as string} />
            <Field label="CRN" value={pp.crn as string} />
          </Section>

          {/* Secondary Parent */}
          {e.secondaryParent?.firstName && (
            <Section title="Secondary Parent" icon={User}>
              <Field label="Name" value={`${e.secondaryParent.firstName} ${e.secondaryParent.surname}`} />
              <Field label="Email" value={e.secondaryParent.email as string} />
              <Field label="Mobile" value={e.secondaryParent.mobile as string} />
            </Section>
          )}

          {/* Medical */}
          <Section title="Medical" icon={Heart}>
            {e.children.map((child, i) => {
              const med = child.medical as Record<string, unknown> | undefined;
              if (!med) return null;
              return (
                <div key={i} className={i > 0 ? "pt-2 border-t border-border" : ""}>
                  {e.children.length > 1 && (
                    <p className="font-semibold text-foreground text-xs mb-1">{child.firstName}</p>
                  )}
                  <Field label="Doctor" value={`${med.doctorName} — ${med.doctorPractice}`} />
                  <Field label="Medicare" value={med.medicareNumber as string} />
                  <Field label="Immunised" value={med.immunisationUpToDate as boolean} />
                  <Field label="Anaphylaxis" value={med.anaphylaxisRisk as boolean} />
                  <Field label="Allergies" value={med.allergies ? (med.allergyDetails as string) : "No"} />
                  <Field label="Asthma" value={med.asthma as boolean} />
                  <Field label="Dietary" value={med.dietaryRequirements ? (med.dietaryDetails as string) : "No"} />
                </div>
              );
            })}
          </Section>

          {/* Emergency Contacts */}
          <Section title="Emergency Contacts" icon={Phone}>
            {e.emergencyContacts
              .filter((c) => c.name)
              .map((c, i) => (
                <Field key={i} label={`Contact ${i + 1}`} value={`${c.name} (${c.relationship}) — ${c.phone}`} />
              ))}
          </Section>

          {/* Consents */}
          <Section title="Consents" icon={Shield}>
            {Object.entries(e.consents).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                {val ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                )}
                <span className="text-xs text-foreground/70 capitalize">
                  {key.replace(/([A-Z])/g, " $1")}
                </span>
              </div>
            ))}
            <Field label="Court Orders" value={e.courtOrders} />
          </Section>

          {/* Booking */}
          <Section title="Booking Preferences" icon={Calendar}>
            {e.children.map((child, i) => {
              const bp = child.bookingPrefs as Record<string, unknown> | undefined;
              if (!bp) return null;
              return (
                <div key={i} className={i > 0 ? "pt-2 border-t border-border" : ""}>
                  {e.children.length > 1 && (
                    <p className="font-semibold text-foreground text-xs mb-1">{child.firstName}</p>
                  )}
                  <Field label="Sessions" value={(bp.sessionTypes as string[])?.join(", ")?.toUpperCase()} />
                  <Field label="Type" value={bp.bookingType as string} />
                  <Field label="Start Date" value={bp.startDate as string} />
                  <Field label="Requirements" value={bp.requirements as string} />
                </div>
              );
            })}
          </Section>

          {/* Payment */}
          <Section title="Payment" icon={CreditCard}>
            <Field
              label="Method"
              value={e.paymentMethod === "credit_card" ? "Credit Card" : e.paymentMethod === "bank_account" ? "Bank Account" : "—"}
            />
            {e.paymentDetails && (
              <>
                {e.paymentMethod === "credit_card" && (
                  <Field label="Card" value={`**** ${(e.paymentDetails as Record<string, string>).lastFour}`} />
                )}
                {e.paymentMethod === "bank_account" && (
                  <Field label="Account" value={`BSB ***${(e.paymentDetails as Record<string, string>).bsbLastThree}`} />
                )}
              </>
            )}
            <Field label="Direct Debit" value={e.debitAgreement} />
            {canViewPayment && <PaymentReveal enrolmentId={e.id} />}
          </Section>

          {/* Notes */}
          {e.notes && (
            <div className="bg-surface/50 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-foreground/50 mb-1">Staff Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{e.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
