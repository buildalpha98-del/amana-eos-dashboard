"use client";

import { useState } from "react";
import {
  X,
  User,
  GraduationCap,
  Clock,
  Heart,
  Shield,
  Users,
  Check,
  AlertCircle,
  Download,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/Sheet";
import {
  useEnrolmentApplicationDetail,
  useApproveEnrolmentApplication,
  useDeclineEnrolmentApplication,
  useDownloadOwnaCsv,
} from "@/hooks/useEnrolmentApplications";
import { Skeleton } from "@/components/ui/Skeleton";

interface Props {
  applicationId: string;
  onClose: () => void;
}

function calculateAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    years--;
  }
  return `${years} yrs`;
}

function formatDateAU(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const SESSION_LABELS: Record<string, string> = {
  BSC: "Before School Care",
  ASC: "After School Care",
  VAC: "Vacation Care",
};

export function SiblingApplicationReviewPanel({ applicationId, onClose }: Props) {
  const { data: app, isLoading } = useEnrolmentApplicationDetail(applicationId);
  const approve = useApproveEnrolmentApplication();
  const decline = useDeclineEnrolmentApplication();
  const download = useDownloadOwnaCsv();

  const [approveNotes, setApproveNotes] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);

  const handleApprove = () => {
    approve.mutate(
      { id: applicationId, notes: approveNotes || undefined },
      { onSuccess: () => onClose() },
    );
  };

  const handleDecline = () => {
    decline.mutate(
      { id: applicationId, reason: declineReason || undefined },
      { onSuccess: () => onClose() },
    );
  };

  const isPending = app?.status === "pending";

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent width="max-w-xl" className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <SheetTitle className="text-lg font-heading font-bold text-foreground">
              {isLoading ? (
                <Skeleton className="h-6 w-48" />
              ) : (
                `${app?.childFirstName} ${app?.childLastName}`
              )}
            </SheetTitle>
            <SheetDescription className="text-sm text-foreground/50 mt-0.5">
              Sibling enrolment application
            </SheetDescription>
          </div>
          <SheetClose className="p-2 rounded-lg hover:bg-surface transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X className="h-5 w-5" />
          </SheetClose>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : app ? (
            <>
              {app?.ownaExportedAt && (
                <div className="flex items-center gap-2 text-xs text-foreground/60 bg-surface/50 rounded-lg px-3 py-2">
                  <Check className="h-3.5 w-3.5 text-green-600" />
                  Exported to OWNA on{" "}
                  {new Date(app.ownaExportedAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              )}

              {/* Child Info */}
              <Section icon={User} title="Child Information">
                <InfoRow label="Full Name" value={`${app.childFirstName} ${app.childLastName}`} />
                <InfoRow label="Date of Birth" value={`${formatDateAU(app.childDateOfBirth)} (${calculateAge(app.childDateOfBirth)})`} />
                {app.childGender && <InfoRow label="Gender" value={app.childGender} />}
                {app.childSchool && <InfoRow label="School" value={app.childSchool} />}
                {app.childYear && <InfoRow label="Year Group" value={app.childYear} />}
              </Section>

              {/* Care Requirements */}
              <Section icon={Clock} title="Care Requirements">
                <InfoRow label="Service" value={app.serviceName} />
                <div>
                  <p className="text-xs text-foreground/50 mb-1">Session Types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {app.sessionTypes.map((st) => (
                      <span
                        key={st}
                        className="px-2 py-0.5 bg-brand/10 text-brand text-xs font-medium rounded-full"
                      >
                        {SESSION_LABELS[st] || st}
                      </span>
                    ))}
                  </div>
                </div>
                {app.startDate && (
                  <InfoRow label="Requested Start Date" value={formatDateAU(app.startDate)} />
                )}
              </Section>

              {/* Medical */}
              <Section icon={Heart} title="Medical Information">
                {app.medicalConditions.length > 0 ? (
                  <div>
                    <p className="text-xs text-foreground/50 mb-1">Medical Conditions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {app.medicalConditions.map((c) => (
                        <span key={c} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs font-medium rounded-full">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/50">No medical conditions</p>
                )}

                {app.dietaryRequirements.length > 0 && (
                  <div>
                    <p className="text-xs text-foreground/50 mb-1">Dietary Requirements</p>
                    <div className="flex flex-wrap gap-1.5">
                      {app.dietaryRequirements.map((d) => (
                        <span key={d} className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {app.medicationDetails && (
                  <InfoRow label="Medication Details" value={app.medicationDetails} />
                )}
                {app.anaphylaxisActionPlan && (
                  <InfoRow label="Anaphylaxis Action Plan" value={app.anaphylaxisActionPlan} />
                )}
                {app.additionalNeeds && (
                  <InfoRow label="Additional Needs" value={app.additionalNeeds} />
                )}
              </Section>

              {/* Consents */}
              <Section icon={Shield} title="Consents">
                <ConsentRow label="Photography & Social Media" granted={app.consentPhotography} />
                <ConsentRow label="Sunscreen Application" granted={app.consentSunscreen} />
                <ConsentRow label="First Aid Treatment" granted={app.consentFirstAid} />
                <ConsentRow label="Excursion Participation" granted={app.consentExcursions} />
              </Section>

              {/* Copy Settings */}
              <Section icon={Users} title="Copy Settings">
                <ConsentRow
                  label="Copy authorised pickups from sibling"
                  granted={app.copyAuthorisedPickups}
                />
                <ConsentRow
                  label="Copy emergency contacts from family profile"
                  granted={app.copyEmergencyContacts}
                />
              </Section>

              {/* Existing Siblings */}
              {app.siblings.length > 0 && (
                <Section icon={Users} title="Existing Siblings at Service">
                  {app.siblings.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-1.5">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {s.firstName} {s.lastName}
                        </p>
                        {s.yearLevel && (
                          <p className="text-xs text-foreground/50">{s.yearLevel}</p>
                        )}
                      </div>
                      <span className="text-xs text-foreground/40">
                        {s.authorisedPickups.length} pickup{s.authorisedPickups.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </Section>
              )}
            </>
          ) : null}
        </div>

        {/* Action buttons — Download OWNA CSV is always available; approve/decline only when pending */}
        <div className="shrink-0 px-6 py-4 border-t border-border bg-background space-y-3">
          <button
            onClick={() => download.mutate(applicationId)}
            disabled={download.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-surface transition-colors min-h-[44px] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {download.isPending
              ? "Downloading..."
              : app?.ownaExportedAt
                ? "Re-download OWNA CSV"
                : "Download OWNA CSV"}
          </button>

          {isPending && (
            showApproveConfirm ? (
              <div className="space-y-3">
                <textarea
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowApproveConfirm(false)}
                    className="flex-1 px-4 py-3 text-sm font-medium text-foreground/70 border border-border rounded-lg hover:bg-surface transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approve.isPending}
                    className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {approve.isPending ? "Approving..." : "Confirm Approve"}
                  </button>
                </div>
              </div>
            ) : showDeclineDialog ? (
              <div className="space-y-3">
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Reason for declining (optional)..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeclineDialog(false)}
                    className="flex-1 px-4 py-3 text-sm font-medium text-foreground/70 border border-border rounded-lg hover:bg-surface transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDecline}
                    disabled={decline.isPending}
                    className="flex-1 px-4 py-3 text-sm font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {decline.isPending ? "Declining..." : "Confirm Decline"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeclineDialog(true)}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors min-h-[44px]"
                >
                  Decline
                </button>
                <button
                  onClick={() => setShowApproveConfirm(true)}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors min-h-[44px]"
                >
                  Approve
                </button>
              </div>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-heading font-semibold text-foreground">
          {title}
        </h3>
      </div>
      <div className="space-y-2 pl-6">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-foreground/50">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function ConsentRow({ label, granted }: { label: string; granted: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {granted ? (
        <Check className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
      )}
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}
