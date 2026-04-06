"use client";

import { useState, useEffect } from "react";
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
  Users,
  FileText,
  Pencil,
  Plus,
  Loader2,
  AlertTriangle,
  UtensilsCrossed,
  Trash2,
} from "lucide-react";
import { useChild, useUpdateChild, type ChildRecord } from "@/hooks/useChildren";
import {
  useChildMedical,
  useUpdateChildMedical,
  useChildPickups,
  useAddChildPickup,
  useDeleteChildPickup,
  type AuthorisedPickup,
} from "@/hooks/useChildProfile";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { ChildMedicalTab } from "./ChildMedicalTab";
import { ChildPickupsTab } from "./ChildPickupsTab";
import { ChildDocumentsTab } from "./ChildDocumentsTab";
import { cn } from "@/lib/utils";

interface Props {
  childId: string;
  onClose: () => void;
}

const PANEL_TABS = [
  { key: "overview", label: "Overview", icon: User },
  { key: "medical", label: "Medical & Dietary", icon: Heart },
  { key: "pickups", label: "Pickups", icon: Users },
  { key: "documents", label: "Documents", icon: FileText },
] as const;

type PanelTabKey = (typeof PANEL_TABS)[number]["key"];

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
  action,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-3.5 bg-surface/50">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-brand transition-colors flex-1"
        >
          <Icon className="h-4 w-4 text-brand" />
          {title}
          {open ? (
            <ChevronUp className="h-4 w-4 text-foreground/40 ml-auto" />
          ) : (
            <ChevronDown className="h-4 w-4 text-foreground/40 ml-auto" />
          )}
        </button>
        {action && <div className="ml-2 shrink-0">{action}</div>}
      </div>
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
  const [panelTab, setPanelTab] = useState<PanelTabKey>("overview");

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

        {/* Tab pills */}
        <div className="shrink-0 flex gap-1 px-4 py-2 border-b border-border overflow-x-auto">
          {PANEL_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setPanelTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  panelTab === tab.key
                    ? "bg-brand text-white"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {panelTab === "medical" && (
          <div className="flex-1 overflow-y-auto">
            <ChildMedicalTab childId={childId} />
          </div>
        )}
        {panelTab === "pickups" && (
          <div className="flex-1 overflow-y-auto">
            <ChildPickupsTab childId={childId} />
          </div>
        )}
        {panelTab === "documents" && (
          <div className="flex-1 overflow-y-auto">
            <ChildDocumentsTab childId={childId} />
          </div>
        )}

        {/* Overview tab — existing content */}
        {panelTab === "overview" && (
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
                <Field label="Type" value={(bp.bookingType as string)?.replace("_", " ") || "Not set"} />
                <Field label="Start Date" value={bp.startDate as string} />
                {/* Enrolled days — styled pills per session type */}
                <div className="py-1.5">
                  <p className="text-xs text-muted/70 mb-1">Enrolled Days</p>
                  {bp.days && typeof bp.days === "object" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(bp.days as Record<string, string[]>).map(([session, days]) => {
                        if (!Array.isArray(days) || days.length === 0) return null;
                        const dayMap: Record<string, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri" };
                        return (
                          <span
                            key={session}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-brand/10 text-brand px-2 py-1 rounded-md"
                          >
                            <span className="font-semibold">{session.toUpperCase()}:</span>
                            {days.map((d) => dayMap[d] ?? d).join(", ")}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">Not configured</p>
                  )}
                </div>
                {bp.requirements && <Field label="Requirements" value={bp.requirements as string} />}
              </>
            )}
          </Section>

          {/* Medical & Dietary — expanded fields */}
          <MedicalSection child={child} med={med} />

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

          {/* Authorised Pickups */}
          <AuthorisedPickupsSection childId={child.id} />

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
        )}
      </div>
    </div>
  );
}

// ── Constants ────────────────────────────────────────────────

const COMMON_CONDITIONS = [
  "Anaphylaxis",
  "Asthma",
  "Diabetes",
  "Epilepsy",
  "ADHD",
  "Autism",
  "Hearing Impairment",
  "Vision Impairment",
];

const COMMON_DIETARY = [
  "Halal",
  "Vegetarian",
  "Vegan",
  "Nut Free",
  "Dairy Free",
  "Gluten Free",
  "Egg Free",
  "Shellfish Free",
];

// ── Medical Section ──────────────────────────────────────────

function MedicalSection({
  child,
  med,
}: {
  child: ChildRecord;
  med: Record<string, unknown> | null;
}) {
  const [showEdit, setShowEdit] = useState(false);

  return (
    <>
      <Section
        title="Medical Information"
        icon={Heart}
        action={
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-brand bg-brand/10 rounded-md hover:bg-brand/20 transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        }
      >
        {/* Medical Conditions */}
        <div className="space-y-1">
          <p className="text-xs text-foreground/50 font-medium">Medical Conditions</p>
          {child.medicalConditions && child.medicalConditions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {child.medicalConditions.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-medium"
                >
                  <AlertTriangle className="w-3 h-3" />
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-foreground/40">None recorded</p>
          )}
        </div>

        {/* Dietary Requirements */}
        <div className="space-y-1 pt-1">
          <p className="text-xs text-foreground/50 font-medium">Dietary Requirements</p>
          {child.dietaryRequirements && child.dietaryRequirements.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {child.dietaryRequirements.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium"
                >
                  <UtensilsCrossed className="w-3 h-3" />
                  {d}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-foreground/40">None recorded</p>
          )}
        </div>

        {/* Anaphylaxis Action Plan */}
        <div className="space-y-1 pt-1">
          <p className="text-xs text-foreground/50 font-medium">Anaphylaxis Action Plan</p>
          {child.anaphylaxisActionPlan ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-semibold">
              <CheckCircle className="w-3 h-3" />
              On File
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-semibold">
              <AlertCircle className="w-3 h-3" />
              Not on File
            </span>
          )}
        </div>

        {/* Medication Details */}
        <div className="space-y-1 pt-1">
          <p className="text-xs text-foreground/50 font-medium">Medication Details</p>
          <p className="text-xs text-foreground">
            {child.medicationDetails || "None"}
          </p>
        </div>

        {/* Additional Needs */}
        <div className="space-y-1 pt-1">
          <p className="text-xs text-foreground/50 font-medium">Additional Needs</p>
          <p className="text-xs text-foreground">
            {child.additionalNeeds || "None"}
          </p>
        </div>

        {/* Legacy doctor/practice fields from enrolment JSON */}
        {med && (
          <div className="pt-2 mt-2 border-t border-border space-y-1.5">
            <p className="text-[10px] text-foreground/40 uppercase tracking-wider font-semibold">GP Details</p>
            <Field label="Doctor" value={med.doctorName as string} />
            <Field label="Practice" value={med.doctorPractice as string} />
            <Field label="Doctor Phone" value={med.doctorPhone as string} />
            <Field label="Medicare" value={med.medicareNumber as string} />
            <Field label="Immunised" value={med.immunisationUpToDate as boolean} />
          </div>
        )}
      </Section>

      {showEdit && (
        <EditMedicalDialog childId={child.id} onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}

// ── Edit Medical Dialog ──────────────────────────────────────

function EditMedicalDialog({
  childId,
  onClose,
}: {
  childId: string;
  onClose: () => void;
}) {
  const { data } = useChildMedical(childId);
  const updateMedical = useUpdateChildMedical();

  const [conditions, setConditions] = useState<string[]>([]);
  const [dietary, setDietary] = useState<string[]>([]);
  const [anaphylaxisPlan, setAnaphylaxisPlan] = useState(false);
  const [medicationDetails, setMedicationDetails] = useState("");
  const [additionalNeeds, setAdditionalNeeds] = useState("");
  const [customCondition, setCustomCondition] = useState("");
  const [customDietary, setCustomDietary] = useState("");

  useEffect(() => {
    if (data) {
      setConditions(data.medicalConditions);
      setDietary(data.dietaryRequirements);
      setAnaphylaxisPlan(data.anaphylaxisActionPlan);
      setMedicationDetails(data.medicationDetails ?? "");
      setAdditionalNeeds(data.additionalNeeds ?? "");
    }
  }, [data]);

  const toggleItem = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) => {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const addCustom = (
    value: string,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    setClear: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
    setClear("");
  };

  const handleSave = () => {
    updateMedical.mutate(
      {
        childId,
        medicalConditions: conditions,
        dietaryRequirements: dietary,
        anaphylaxisActionPlan: anaphylaxisPlan,
        medicationDetails: medicationDetails.trim() || null,
        additionalNeeds: additionalNeeds.trim() || null,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent size="lg" className="max-h-[85vh] overflow-y-auto">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Edit Medical & Dietary Information
        </DialogTitle>

        <div className="space-y-5 mt-4">
          {/* Medical Conditions */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Medical Conditions
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleItem(conditions, setConditions, c)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                    conditions.includes(c)
                      ? "bg-red-100 text-red-700 border-red-300"
                      : "bg-card text-muted border-border hover:border-red-200 hover:bg-red-50",
                  )}
                >
                  {c}
                </button>
              ))}
              {/* Custom conditions that aren't in the common list */}
              {conditions
                .filter((c) => !COMMON_CONDITIONS.includes(c))
                .map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleItem(conditions, setConditions, c)}
                    className="px-3 py-1.5 text-xs font-medium rounded-full border bg-red-100 text-red-700 border-red-300 transition-colors"
                  >
                    {c} ×
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customCondition}
                onChange={(e) => setCustomCondition(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom(customCondition, conditions, setConditions, setCustomCondition);
                  }
                }}
                placeholder="Add custom condition..."
                className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => addCustom(customCondition, conditions, setConditions, setCustomCondition)}
                disabled={!customCondition.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-surface text-foreground rounded-lg hover:bg-surface/80 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Dietary Requirements */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <UtensilsCrossed className="w-4 h-4 text-amber-500" />
              Dietary Requirements
            </label>
            <div className="flex flex-wrap gap-2">
              {COMMON_DIETARY.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleItem(dietary, setDietary, d)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                    dietary.includes(d)
                      ? "bg-amber-100 text-amber-700 border-amber-300"
                      : "bg-card text-muted border-border hover:border-amber-200 hover:bg-amber-50",
                  )}
                >
                  {d}
                </button>
              ))}
              {dietary
                .filter((d) => !COMMON_DIETARY.includes(d))
                .map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleItem(dietary, setDietary, d)}
                    className="px-3 py-1.5 text-xs font-medium rounded-full border bg-amber-100 text-amber-700 border-amber-300 transition-colors"
                  >
                    {d} ×
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customDietary}
                onChange={(e) => setCustomDietary(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom(customDietary, dietary, setDietary, setCustomDietary);
                  }
                }}
                placeholder="Add custom dietary requirement..."
                className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => addCustom(customDietary, dietary, setDietary, setCustomDietary)}
                disabled={!customDietary.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-surface text-foreground rounded-lg hover:bg-surface/80 disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Anaphylaxis Action Plan */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={anaphylaxisPlan}
              onChange={(e) => setAnaphylaxisPlan(e.target.checked)}
              className="rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-foreground">Anaphylaxis Action Plan on file</span>
          </label>

          {/* Medication Details */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Medication Details</label>
            <textarea
              value={medicationDetails}
              onChange={(e) => setMedicationDetails(e.target.value)}
              placeholder="Medications, dosage, and administration instructions..."
              rows={3}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

          {/* Additional Needs */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Additional Needs</label>
            <textarea
              value={additionalNeeds}
              onChange={(e) => setAdditionalNeeds(e.target.value)}
              placeholder="Any other care requirements..."
              rows={3}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateMedical.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
            >
              {updateMedical.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Authorised Pickups Section ───────────────────────────────

function AuthorisedPickupsSection({ childId }: { childId: string }) {
  const { data, isLoading } = useChildPickups(childId);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AuthorisedPickup | null>(null);
  const deletePickup = useDeleteChildPickup();

  const pickups = data?.pickups ?? [];

  const handleDelete = () => {
    if (!deleteTarget) return;
    deletePickup.mutate(
      { childId, pickupId: deleteTarget.id },
      { onSuccess: () => setDeleteTarget(null) },
    );
  };

  return (
    <>
      <Section
        title="Authorised Pickups"
        icon={Users}
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-brand bg-brand/10 rounded-md hover:bg-brand/20 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : pickups.length === 0 ? (
          <p className="text-xs text-foreground/40">No authorised pickups</p>
        ) : (
          <div className="space-y-2">
            {pickups.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground truncate">{p.name}</span>
                    <span className="text-[10px] text-foreground/50">({p.relationship})</span>
                    {p.isEmergencyContact && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[9px] font-semibold">
                        <Shield className="w-2.5 h-2.5" />
                        Emergency
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-foreground/50 flex items-center gap-1 mt-0.5">
                    <Phone className="w-2.5 h-2.5" />
                    {p.phone}
                  </p>
                </div>
                <button
                  onClick={() => setDeleteTarget(p)}
                  className="p-1 rounded-md text-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Add Pickup Dialog */}
      {showAdd && (
        <OverviewAddPickupDialog childId={childId} onClose={() => setShowAdd(false)} />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <Dialog open onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent size="sm">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Remove Pickup
            </DialogTitle>
            <p className="text-sm text-muted mt-2">
              Remove <strong>{deleteTarget.name}</strong> as an authorised pickup?
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deletePickup.isPending}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deletePickup.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Remove
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function OverviewAddPickupDialog({
  childId,
  onClose,
}: {
  childId: string;
  onClose: () => void;
}) {
  const addPickup = useAddChildPickup();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addPickup.mutate(
      {
        childId,
        name: name.trim(),
        relationship: relationship.trim(),
        phone: phone.trim(),
        isEmergencyContact: isEmergency,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Add Authorised Pickup
        </DialogTitle>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Relationship *</label>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              required
              placeholder="e.g. Grandmother, Uncle"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Phone Number *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
              className="rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-foreground">Emergency contact</span>
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addPickup.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
            >
              {addPickup.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add Pickup
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
