"use client";

import { useState } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  User,
  Heart,
  Phone,
  Shield,
  Calendar,
  Building2,
  GraduationCap,
  CheckCircle,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { useChild, useUpdateChild, type ChildRecord } from "@/hooks/useChildren";
import { Skeleton } from "@/components/ui/Skeleton";

interface Props {
  childId: string;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-700", bg: "bg-amber-50" },
  active: { label: "Active", color: "text-green-700", bg: "bg-green-50" },
  withdrawn: { label: "Withdrawn", color: "text-red-700", bg: "bg-red-50" },
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
      <span className="text-foreground/50 w-32 shrink-0 text-xs">{label}</span>
      <span className="text-foreground text-xs font-medium">{display}</span>
    </div>
  );
}

export function ChildDetailPanel({ childId, onClose }: Props) {
  const { data: child, isLoading } = useChild(childId);
  const updateMutation = useUpdateChild();

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

  if (!child) return null;

  const statusInfo = STATUS_CONFIG[child.status] || STATUS_CONFIG.pending;
  const pp = child.enrolment?.primaryParent;
  const med = child.medical as Record<string, unknown> | null;
  const bp = child.bookingPrefs as Record<string, unknown> | null;
  const age = child.dob ? calculateAge(child.dob) : null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-background shadow-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 p-4 border-b border-border flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {child.firstName} {child.surname}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusInfo.color} ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
              {child.service && (
                <span className="text-xs text-foreground/50 bg-surface px-2 py-0.5 rounded-full">
                  {child.service.name}
                </span>
              )}
              {age && (
                <span className="text-xs text-foreground/50">
                  {age}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-foreground/50" />
          </button>
        </div>

        {/* Actions bar */}
        <div className="shrink-0 p-3 border-b border-border flex gap-2 flex-wrap">
          {child.status === "pending" && (
            <button
              onClick={() => updateMutation.mutate({ id: child.id, status: "active" })}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Activate
            </button>
          )}
          {child.status === "active" && (
            <button
              onClick={() => updateMutation.mutate({ id: child.id, status: "withdrawn" })}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Withdraw
            </button>
          )}
          {child.enrolment && (
            <a
              href={`/api/enrolments/${child.enrolmentId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface text-foreground/70 rounded-lg hover:bg-surface/80 transition-colors"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Enrolment PDF
            </a>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Child Details */}
          <Section title="Child Details" icon={User} defaultOpen>
            <Field label="Name" value={`${child.firstName} ${child.surname}`} />
            <Field label="Date of Birth" value={child.dob ? new Date(child.dob).toLocaleDateString("en-AU") : null} />
            <Field label="Gender" value={child.gender} />
            <Field label="School" value={child.schoolName} />
            <Field label="Year Level" value={child.yearLevel} />
            <Field label="CRN" value={child.crn} />
            {child.address && (
              <Field
                label="Address"
                value={[child.address.street, child.address.suburb, child.address.state, child.address.postcode].filter(Boolean).join(", ")}
              />
            )}
            {child.culturalBackground?.length > 0 && (
              <Field label="Cultural" value={child.culturalBackground.join(", ")} />
            )}
          </Section>

          {/* Parent/Guardian */}
          {pp && (
            <Section title="Parent/Guardian" icon={User} defaultOpen>
              <Field label="Name" value={`${pp.firstName} ${pp.surname}`} />
              <Field label="Email" value={pp.email} />
              <Field label="Mobile" value={pp.mobile} />
              <Field label="Relationship" value={pp.relationship as string} />
              <Field label="Occupation" value={pp.occupation as string} />
            </Section>
          )}

          {/* Service & Booking */}
          <Section title="Service & Booking" icon={Building2}>
            <Field label="Service" value={child.service?.name || "Not assigned"} />
            <Field label="Code" value={child.service?.code} />
            {bp && (
              <>
                <Field label="Sessions" value={(bp.sessionTypes as string[])?.join(", ")?.toUpperCase()} />
                <Field label="Type" value={bp.bookingType as string} />
                <Field label="Start Date" value={bp.startDate as string} />
                <Field label="Requirements" value={bp.requirements as string} />
              </>
            )}
          </Section>

          {/* Medical */}
          <Section title="Medical Information" icon={Heart}>
            {med ? (
              <>
                <Field label="Doctor" value={med.doctorName as string} />
                <Field label="Practice" value={med.doctorPractice as string} />
                <Field label="Doctor Phone" value={med.doctorPhone as string} />
                <Field label="Medicare" value={med.medicareNumber as string} />
                <Field label="Immunised" value={med.immunisationUpToDate as boolean} />
                <Field label="Anaphylaxis" value={med.anaphylaxisRisk as boolean} />
                <Field label="Allergies" value={med.allergies ? (med.allergyDetails as string) || "Yes" : "No"} />
                <Field label="Asthma" value={med.asthma as boolean} />
                <Field label="Conditions" value={med.otherConditions as string} />
                <Field label="Medications" value={med.medications as string} />
              </>
            ) : (
              <p className="text-xs text-foreground/40">No medical information recorded</p>
            )}
          </Section>

          {/* Dietary */}
          {child.dietary && (
            <Section title="Dietary Requirements" icon={Shield}>
              <Field label="Details" value={(child.dietary as Record<string, unknown>).details as string} />
            </Section>
          )}

          {/* Emergency Contacts */}
          {child.enrolment && (
            <Section title="Emergency Contacts" icon={Phone}>
              {(child.enrolment as unknown as { emergencyContacts: Array<{ name: string; relationship: string; phone: string }> }).emergencyContacts
                ?.filter((c) => c.name)
                .map((c, i) => (
                  <Field key={i} label={`Contact ${i + 1}`} value={`${c.name} (${c.relationship}) — ${c.phone}`} />
                )) || <p className="text-xs text-foreground/40">No emergency contacts</p>}
            </Section>
          )}

          {/* Enrolment Info */}
          <Section title="Enrolment" icon={GraduationCap}>
            <Field label="Enrolment Status" value={child.enrolment?.status} />
            <Field
              label="Submitted"
              value={child.enrolment?.createdAt ? new Date(child.enrolment.createdAt).toLocaleDateString("en-AU") : null}
            />
            <Field label="Child Status" value={child.status} />
            <Field
              label="Record Created"
              value={new Date(child.createdAt).toLocaleDateString("en-AU")}
            />
          </Section>

          {/* Consents */}
          {child.enrolment && (child.enrolment as unknown as { consents?: Record<string, boolean> }).consents && (
            <Section title="Consents" icon={Calendar}>
              {Object.entries((child.enrolment as unknown as { consents: Record<string, boolean> }).consents).map(([key, val]) => (
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
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function calculateAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
  return `${years} yrs`;
}
