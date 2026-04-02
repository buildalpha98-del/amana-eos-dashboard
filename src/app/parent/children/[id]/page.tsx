"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Stethoscope,
  Phone,
  Pill,
  ShieldCheck,
  AlertTriangle,
  Pencil,
  Loader2,
  Upload,
  CheckCircle2,
  FileText,
  UserCheck,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useParentChildren,
  useChildAttendance,
  useUpdateChildMedical,
  type ParentChild,
  type AttendanceDay,
  type UpdateChildMedicalPayload,
} from "@/hooks/useParentPortal";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

type Tab = "attendance" | "medical" | "documents" | "pickups" | "contacts";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "attendance", label: "Attendance", icon: CalendarDays },
  { key: "medical", label: "Medical", icon: Stethoscope },
  { key: "documents", label: "Docs", icon: FileText },
  { key: "pickups", label: "Pickups", icon: UserCheck },
  { key: "contacts", label: "Contacts", icon: Phone },
];

export default function ChildDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("attendance");

  const { data: children, isLoading: childrenLoading } = useParentChildren();
  const { data: attendance, isLoading: attendanceLoading } =
    useChildAttendance(id);

  const child = children?.find((c) => c.id === id);

  if (childrenLoading) {
    return <DetailSkeleton />;
  }

  if (!child) {
    return (
      <div className="space-y-4">
        <Link
          href="/parent/children"
          className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to children
        </Link>
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <p className="text-[#7c7c8a] text-sm">Child not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/parent/children"
        className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to children
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          {child.firstName} {child.lastName}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          {child.yearLevel && (
            <span className="text-sm text-[#7c7c8a]">{child.yearLevel}</span>
          )}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#004E64]/10 text-[#004E64] text-xs font-medium">
            {child.serviceName}
          </span>
        </div>
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-1 bg-[#F2EDE8] rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium transition-all min-h-[44px] whitespace-nowrap shrink-0",
              activeTab === tab.key
                ? "bg-white text-[#004E64] shadow-sm"
                : "text-[#7c7c8a] hover:text-[#1a1a2e]"
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden xs:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "attendance" && (
        <AttendanceTab
          attendance={attendance ?? []}
          loading={attendanceLoading}
        />
      )}
      {activeTab === "medical" && <MedicalTab child={child} />}
      {activeTab === "documents" && <DocumentsTab childId={child.id} />}
      {activeTab === "pickups" && <PickupsTab childId={child.id} />}
      {activeTab === "contacts" && <ContactsTab child={child} />}
    </div>
  );
}

// ── Attendance Tab ───────────────────────────────────────

function AttendanceTab({
  attendance,
  loading,
}: {
  attendance: AttendanceDay[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (attendance.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
        <CalendarDays className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
        <p className="text-[#7c7c8a] text-sm">
          No attendance records found for the last 30 days.
        </p>
      </div>
    );
  }

  const weeks = groupByWeek(attendance);

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#7c7c8a]">Last 30 days</p>
      <div className="grid grid-cols-5 gap-1 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
          <span key={d} className="text-[10px] font-semibold text-[#7c7c8a] uppercase">
            {d}
          </span>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-5 gap-1">
          {week.map((day, di) => (
            <div
              key={di}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center text-[10px]",
                day === null
                  ? "bg-transparent"
                  : day.status === "present"
                    ? "bg-green-100 text-green-700"
                    : day.status === "absent"
                      ? "bg-red-100 text-red-600"
                      : "bg-[#F2EDE8] text-[#7c7c8a]"
              )}
            >
              {day && (
                <>
                  <span className="font-medium">{new Date(day.date).getDate()}</span>
                  <span className="text-[8px]">
                    {day.status === "present" ? "Present" : day.status === "absent" ? "Absent" : "No session"}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-4 justify-center pt-2">
        <LegendDot color="bg-green-500" label="Present" />
        <LegendDot color="bg-red-500" label="Absent" />
        <LegendDot color="bg-[#e8e4df]" label="No session" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-[#7c7c8a]">
      <span className={cn("w-2 h-2 rounded-full", color)} />
      {label}
    </span>
  );
}

function groupByWeek(days: AttendanceDay[]): (AttendanceDay | null)[][] {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const weeks: (AttendanceDay | null)[][] = [];
  let currentWeek: (AttendanceDay | null)[] = [];

  for (const day of sorted) {
    const date = new Date(day.date);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const slotIndex = dow - 1;
    if (currentWeek.length > slotIndex) {
      while (currentWeek.length < 5) currentWeek.push(null);
      weeks.push(currentWeek);
      currentWeek = [];
    }
    while (currentWeek.length < slotIndex) currentWeek.push(null);
    currentWeek.push(day);
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 5) currentWeek.push(null);
    weeks.push(currentWeek);
  }
  return weeks;
}

// ── Medical Tab ──────────────────────────────────────────

function MedicalTab({ child }: { child: ParentChild }) {
  const [editOpen, setEditOpen] = useState(false);

  const hasAny =
    child.medicalConditions.length > 0 ||
    child.allergies.length > 0 ||
    child.medications.length > 0 ||
    child.immunisationStatus;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] transition-colors min-h-[44px]"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit Details
        </button>
      </div>

      {!hasAny ? (
        <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
          <Stethoscope className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
          <p className="text-[#7c7c8a] text-sm">
            No medical information on file. Tap &ldquo;Edit Details&rdquo; to add.
          </p>
        </div>
      ) : (
        <>
          {child.medicalConditions.length > 0 && (
            <InfoCard icon={AlertTriangle} iconColor="text-amber-600" title="Medical Conditions" items={child.medicalConditions} />
          )}
          {child.allergies.length > 0 && (
            <InfoCard icon={AlertTriangle} iconColor="text-red-500" title="Allergies" items={child.allergies} />
          )}
          {child.medications.length > 0 && (
            <InfoCard icon={Pill} iconColor="text-blue-500" title="Medications" items={child.medications} />
          )}
          {child.immunisationStatus && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                <h3 className="text-sm font-heading font-semibold text-[#1a1a2e]">Immunisation Status</h3>
              </div>
              <p className="text-sm text-[#7c7c8a] ml-6">{child.immunisationStatus}</p>
            </div>
          )}
        </>
      )}

      <EditMedicalDialog child={child} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function InfoCard({ icon: Icon, iconColor, title, items }: { icon: React.ComponentType<{ className?: string }>; iconColor: string; title: string; items: string[] }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", iconColor)} />
        <h3 className="text-sm font-heading font-semibold text-[#1a1a2e]">{title}</h3>
      </div>
      <div className="flex flex-wrap gap-1.5 ml-6">
        {items.map((item, i) => (
          <span key={i} className="inline-flex px-2 py-0.5 rounded-full bg-[#F2EDE8] text-xs text-[#1a1a2e]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Edit Medical Dialog ─────────────────────────────────

function EditMedicalDialog({ child, open, onOpenChange }: { child: ParentChild; open: boolean; onOpenChange: (open: boolean) => void }) {
  const updateMedical = useUpdateChildMedical();
  const [conditions, setConditions] = useState(child.medicalConditions.join(", "));
  const [allergies, setAllergies] = useState(child.allergies.join(", "));
  const [medications, setMedications] = useState(child.medications.join(", "));
  const [immunisation, setImmunisation] = useState(child.immunisationStatus ?? "");
  const [dietaryNotes, setDietaryNotes] = useState("");
  const [actionPlanUploaded, setActionPlanUploaded] = useState(false);

  const splitToArray = (s: string) => s.split(",").map((v) => v.trim()).filter(Boolean);

  const handleSave = () => {
    const payload: UpdateChildMedicalPayload = {
      medicalConditions: splitToArray(conditions),
      allergies: splitToArray(allergies),
      medications: splitToArray(medications),
      immunisationStatus: immunisation || undefined,
      dietary: dietaryNotes ? { notes: dietaryNotes } : undefined,
      actionPlanUrl: actionPlanUploaded ? `/uploads/action-plan-${child.id}.pdf` : undefined,
    };
    updateMedical.mutate({ childId: child.id, payload }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Edit Medical Details</DialogTitle>
        <DialogDescription>Update {child.firstName}&apos;s medical and dietary information.</DialogDescription>
        <div className="space-y-4 mt-4">
          <MedicalFormField label="Medical Conditions" value={conditions} onChange={setConditions} placeholder="e.g. Asthma, Eczema (comma-separated)" />
          <MedicalFormField label="Allergies" value={allergies} onChange={setAllergies} placeholder="e.g. Peanuts, Penicillin (comma-separated)" />
          <MedicalFormField label="Medications" value={medications} onChange={setMedications} placeholder="e.g. Ventolin, EpiPen (comma-separated)" />
          <MedicalFormField label="Immunisation Status" value={immunisation} onChange={setImmunisation} placeholder="e.g. Up to date" />
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">Dietary Notes</label>
            <textarea value={dietaryNotes} onChange={(e) => setDietaryNotes(e.target.value)} placeholder="Any dietary requirements..." maxLength={500} rows={3} className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">Action Plan (Asthma/Anaphylaxis)</label>
            {actionPlanUploaded ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                Action plan uploaded
              </div>
            ) : (
              <button type="button" onClick={() => { setActionPlanUploaded(true); toast({ description: "Action plan uploaded (simulated)" }); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-[#e8e4df] hover:border-[#004E64]/30 text-sm text-[#7c7c8a] hover:text-[#004E64] transition-colors w-full justify-center min-h-[44px]">
                <Upload className="w-4 h-4" />
                Upload Action Plan
              </button>
            )}
          </div>
          <button onClick={handleSave} disabled={updateMedical.isPending} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]">
            {updateMedical.isPending ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving...</>) : "Save Changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MedicalFormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] placeholder-[#7c7c8a]/60 focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]" />
    </div>
  );
}

// ── Documents Tab ───────────────────────────────────────

interface ParentDoc {
  id: string;
  docType: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  expiryDate: string | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  immunisation: "Immunisation Record",
  medical_action_plan: "Medical Action Plan",
  birth_certificate: "Birth Certificate",
  custody_order: "Custody Order",
  other: "Other",
};

function DocumentsTab({ childId }: { childId: string }) {
  const [docs, setDocs] = useState<ParentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("immunisation");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    fetchApi<ParentDoc[]>(`/api/parent/children/${childId}/documents`)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  const handleUpload = async () => {
    if (!fileName) return;
    setUploading(true);
    try {
      const doc = await mutateApi<ParentDoc>(`/api/parent/children/${childId}/documents`, {
        method: "POST",
        body: { docType, fileName, fileUrl: `/uploads/${fileName}` }, // TODO: S3 integration
      });
      setDocs((prev) => [doc, ...prev]);
      setUploadOpen(false);
      setFileName("");
      toast({ description: "Document uploaded" });
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <Skeleton className="h-32 w-full rounded-xl" />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] transition-colors min-h-[44px]">
          <Plus className="w-3.5 h-3.5" />
          Upload Document
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
          <FileText className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
          <p className="text-[#7c7c8a] text-sm">No documents uploaded yet.</p>
        </div>
      ) : (
        docs.map((doc) => (
          <div key={doc.id} className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-[#1a1a2e]">{doc.fileName}</p>
                <p className="text-xs text-[#7c7c8a] mt-0.5">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</p>
                <p className="text-xs text-[#7c7c8a]">Uploaded {new Date(doc.uploadedAt).toLocaleDateString("en-AU")}</p>
                {doc.expiryDate && <p className="text-xs text-amber-600">Expires {new Date(doc.expiryDate).toLocaleDateString("en-AU")}</p>}
              </div>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] min-h-[44px] flex items-center">
                View
              </a>
            </div>
          </div>
        ))
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Select a document type and file to upload.</DialogDescription>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">Document Type</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]">
                {Object.entries(DOC_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">File</label>
              <button type="button" onClick={() => setFileName(`${docType}-${Date.now()}.pdf`)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-[#e8e4df] hover:border-[#004E64]/30 text-sm text-[#7c7c8a] hover:text-[#004E64] transition-colors w-full justify-center min-h-[44px]">
                <Upload className="w-4 h-4" />
                {fileName || "Select file (simulated)"}
              </button>
            </div>
            <button onClick={handleUpload} disabled={!fileName || uploading} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]">
              {uploading ? (<><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>) : "Upload"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Pickups Tab ──────────────────────────────────────────

interface PickupPerson {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  active: boolean;
}

function PickupsTab({ childId }: { childId: string }) {
  const [pickups, setPickups] = useState<PickupPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    fetchApi<PickupPerson[]>(`/api/parent/children/${childId}/pickups`)
      .then(setPickups)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  const handleAdd = async () => {
    if (!name || !relationship || !phone) return;
    setAdding(true);
    try {
      const pickup = await mutateApi<PickupPerson>(`/api/parent/children/${childId}/pickups`, {
        method: "POST",
        body: { name, relationship, phone },
      });
      setPickups((prev) => [pickup, ...prev]);
      setAddOpen(false);
      setName(""); setRelationship(""); setPhone("");
      toast({ description: "Authorised person added" });
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Failed to add" });
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (pickup: PickupPerson) => {
    try {
      await mutateApi(`/api/parent/children/${childId}/pickups`, {
        method: "PATCH",
        body: { pickupId: pickup.id, active: !pickup.active },
      });
      setPickups((prev) => prev.map((p) => (p.id === pickup.id ? { ...p, active: !p.active } : p)));
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Update failed" });
    }
  };

  if (loading) return <Skeleton className="h-32 w-full rounded-xl" />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#004E64] hover:text-[#0A7E9E] transition-colors min-h-[44px]">
          <Plus className="w-3.5 h-3.5" />
          Add Person
        </button>
      </div>

      {pickups.length === 0 ? (
        <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
          <UserCheck className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
          <p className="text-[#7c7c8a] text-sm">No authorised pickup persons added yet.</p>
        </div>
      ) : (
        pickups.map((pickup) => (
          <div key={pickup.id} className={cn("bg-white rounded-xl p-4 shadow-sm border", pickup.active ? "border-[#e8e4df]" : "border-red-200 opacity-60")}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-[#1a1a2e]">{pickup.name}</p>
                <p className="text-xs text-[#7c7c8a] mt-0.5">{pickup.relationship}</p>
                <a href={`tel:${pickup.phone}`} className="inline-flex items-center gap-1 mt-1 text-xs text-[#004E64] hover:text-[#0A7E9E] font-medium min-h-[44px]">
                  <Phone className="w-3.5 h-3.5" />
                  {pickup.phone}
                </a>
              </div>
              <button onClick={() => toggleActive(pickup)} className={cn("text-xs font-medium px-2.5 py-1 rounded-full min-h-[44px] flex items-center", pickup.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600")}>
                {pickup.active ? "Active" : "Inactive"}
              </button>
            </div>
          </div>
        ))
      )}

      {/* Add Person Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogTitle>Add Authorised Person</DialogTitle>
          <DialogDescription>Add someone authorised to collect your child.</DialogDescription>
          <div className="space-y-4 mt-4">
            <MedicalFormField label="Full Name" value={name} onChange={setName} placeholder="Jane Smith" />
            <MedicalFormField label="Relationship" value={relationship} onChange={setRelationship} placeholder="e.g. Grandmother" />
            <MedicalFormField label="Phone" value={phone} onChange={setPhone} placeholder="0400 000 000" />
            <button onClick={handleAdd} disabled={!name || !relationship || !phone || adding} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]">
              {adding ? (<><Loader2 className="w-4 h-4 animate-spin" />Adding...</>) : "Add Person"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Contacts Tab ─────────────────────────────────────────

function ContactsTab({ child }: { child: ParentChild }) {
  if (child.emergencyContacts.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 text-center shadow-sm border border-[#e8e4df]">
        <Phone className="w-8 h-8 text-[#7c7c8a] mx-auto mb-2" />
        <p className="text-[#7c7c8a] text-sm">
          No emergency contacts on file. You can add them in your account settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {child.emergencyContacts.map((contact) => (
        <div key={contact.id} className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]">
          <h3 className="text-sm font-heading font-semibold text-[#1a1a2e]">{contact.name}</h3>
          <p className="text-xs text-[#7c7c8a] mt-0.5">{contact.relationship}</p>
          <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 mt-2 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]">
            <Phone className="w-4 h-4" />
            {contact.phone}
          </a>
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-5 w-32" />
      <div>
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
