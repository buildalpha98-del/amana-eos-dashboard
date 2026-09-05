"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { Role } from "@prisma/client";
import { X, Plus, UserPlus, Sparkles } from "lucide-react";
import { AiButton } from "@/components/ui/AiButton";
import { AiScreenBadge } from "@/components/recruitment/AiScreenBadge";
import { CandidateDetailPanel } from "@/components/recruitment/CandidateDetailPanel";
import { useAiScreenCandidate, useConvertCandidate } from "@/hooks/useRecruitment";
import { useOnboardingPacks } from "@/hooks/useOnboarding";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import { uploadFileSmart } from "@/lib/upload-client";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";

const ROLE_LABELS: Record<string, string> = {
  educator: "Educator",
  senior_educator: "Senior Educator",
  coordinator: "Coordinator",
  member: "Coordinator",
  director: "Director",
};

// "hired" is deliberately absent from STAGE_LABELS: it's a terminal stage
// stamped only by the convert-to-employee flow, never picked from the select.
const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screened: "Screened",
  interviewed: "Interviewed",
  offered: "Offered",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STAGE_STYLES: Record<string, string> = {
  applied: "bg-surface text-foreground/80",
  screened: "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",
  interviewed: "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",
  offered: "bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300",
  accepted: "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300",
  withdrawn: "bg-surface text-muted",
  hired: "bg-emerald-600 text-white",
};

// Same offerable roles as AddStaffModal — owner excluded; head_office only
// when the viewer is an owner. Centre roles inherit the vacancy's centre.
const CONVERT_BASE_ROLES: Role[] = [
  "staff",
  "member",
  "marketing",
  "admin",
  "eos_viewer",
  "eos_implementer",
];

interface VacancyDetailPanelProps {
  vacancyId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function VacancyDetailPanel({ vacancyId, onClose, onUpdated }: VacancyDetailPanelProps) {
  useEscapeClose(onClose);
  const queryClient = useQueryClient();
  const aiScreen = useAiScreenCandidate();
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    name: "",
    email: "",
    phone: "",
    source: "indeed",
    notes: "",
    resumeText: "",
    resumeFileUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [screenResults, setScreenResults] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [convertTarget, setConvertTarget] = useState<{
    id: string;
    name: string;
    email: string | null;
  } | null>(null);

  // Convert-to-employee is owner/admin only — the same gate as the
  // /api/recruitment/candidates/[id]/convert route (aligned with POST /api/users).
  const { data: authSession } = useSession();
  const viewerRole = authSession?.user?.role as Role | undefined;
  const canConvert = viewerRole === "owner" || viewerRole === "admin";

  const { data: vacancy, isLoading } = useQuery({
    queryKey: ["recruitment-vacancy", vacancyId],
    queryFn: async () => {
      const res = await fetch(`/api/recruitment/${vacancyId}`);
      if (!res.ok) throw new Error("Failed to fetch vacancy");
      return res.json();
    },
  });

  const handleStatusChange = async (status: string) => {
    try {
      await mutateApi(`/api/recruitment/${vacancyId}`, {
        method: "PATCH",
        body: { status },
      });
      queryClient.invalidateQueries({ queryKey: ["recruitment-vacancy", vacancyId] });
      onUpdated();
    } catch (err) {
      toast({
        variant: "destructive",
        description: (err as Error).message || "Failed to update vacancy status",
      });
    }
  };

  // Toggle whether this role appears on the public careers page by adding /
  // removing "website" from postedChannels (the PATCH API already supports it).
  const handleWebsiteToggle = async (show: boolean) => {
    const current: string[] = vacancy?.postedChannels ?? [];
    const next = show
      ? Array.from(new Set([...current, "website"]))
      : current.filter((c: string) => c !== "website");
    try {
      await mutateApi(`/api/recruitment/${vacancyId}`, {
        method: "PATCH",
        body: { postedChannels: next },
      });
      queryClient.invalidateQueries({ queryKey: ["recruitment-vacancy", vacancyId] });
      onUpdated();
    } catch (err) {
      toast({
        variant: "destructive",
        description: (err as Error).message || "Failed to update careers page visibility",
      });
    }
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateForm.name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/recruitment/${vacancyId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidateForm),
      });
      if (!res.ok) throw new Error("Failed to add candidate");
      setCandidateForm({ name: "", email: "", phone: "", source: "indeed", notes: "", resumeText: "", resumeFileUrl: "" });
      setShowAddCandidate(false);
      queryClient.invalidateQueries({ queryKey: ["recruitment-vacancy", vacancyId] });
    } catch (err) {
      toast({
        variant: "destructive",
        description: (err as Error)?.message || "Failed to add candidate",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStageChange = async (candidateId: string, stage: string) => {
    try {
      await mutateApi(`/api/recruitment/candidates/${candidateId}`, {
        method: "PATCH",
        body: { stage },
      });
      queryClient.invalidateQueries({ queryKey: ["recruitment-vacancy", vacancyId] });
    } catch (err) {
      toast({
        variant: "destructive",
        description: (err as Error).message || "Failed to update candidate stage",
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Was reading `data.url`, but the upload route returns `fileUrl` — the
      // resume URL was silently stored as undefined. uploadFileSmart also
      // enforces the size cap, so the old pre-check is gone.
      const { fileUrl } = await uploadFileSmart(file);
      setCandidateForm((prev) => ({ ...prev, resumeFileUrl: fileUrl }));
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Failed to upload file",
      });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
        <div className="bg-card rounded-t-xl sm:rounded-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-border border-t-blue-600 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!vacancy) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-card rounded-t-xl sm:rounded-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card z-10">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {ROLE_LABELS[vacancy.role] || vacancy.role}
            </h3>
            <p className="text-sm text-muted">
              {vacancy.service?.name} &middot; {vacancy.employmentType.replace("_", " ")}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-2">Status</label>
            <div className="flex flex-wrap gap-2">
              {["open", "interviewing", "offered", "filled", "cancelled"].map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`px-3 py-1.5 text-xs rounded-full font-medium capitalize transition-colors ${
                    vacancy.status === s
                      ? "bg-blue-600 text-white"
                      : "bg-surface text-muted hover:bg-border"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Website publishing */}
          <label className="flex items-start gap-3 rounded-lg border border-border bg-surface/40 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={(vacancy.postedChannels ?? []).includes("website")}
              onChange={(e) => handleWebsiteToggle(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium text-foreground/90">Show on public careers page</span>
              <span className="block text-xs text-muted mt-0.5">
                Lists this role at amanaoshc.com.au/careers with an apply link, while
                status is &ldquo;open&rdquo;. The Notes below become the public job ad.
              </span>
            </span>
          </label>

          {/* Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted">Qualification</span>
              <p className="font-medium text-foreground capitalize">
                {vacancy.qualificationRequired?.replace("_", " ") || "None"}
              </p>
            </div>
            <div>
              <span className="text-muted">Assigned To</span>
              <p className="font-medium text-foreground">
                {vacancy.assignedTo?.name || "Unassigned"}
              </p>
            </div>
            <div>
              <span className="text-muted">Target Fill Date</span>
              <p className="font-medium text-foreground">
                {vacancy.targetFillDate
                  ? new Date(vacancy.targetFillDate).toLocaleDateString("en-AU")
                  : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted">Created</span>
              <p className="font-medium text-foreground">
                {new Date(vacancy.createdAt).toLocaleDateString("en-AU")}
              </p>
            </div>
          </div>

          {vacancy.notes && (
            <div>
              <span className="text-sm text-muted">Notes</span>
              <p className="text-sm text-foreground/80 mt-1">{vacancy.notes}</p>
            </div>
          )}

          {/* Position Description — surfaces the formal selection
              criteria to the interview panel. Linked at vacancy
              creation; null for legacy vacancies. */}
          {vacancy.positionDescription && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                  Position Description ·{" "}
                  {vacancy.positionDescription.title}
                </p>
                <a
                  href={`/position-descriptions`}
                  className="text-xs text-blue-700 hover:underline"
                >
                  View library →
                </a>
              </div>
              {vacancy.positionDescription.summary && (
                <PdField
                  label="Summary"
                  value={vacancy.positionDescription.summary}
                />
              )}
              {vacancy.positionDescription.responsibilities && (
                <PdField
                  label="Key responsibilities"
                  value={vacancy.positionDescription.responsibilities}
                />
              )}
              {vacancy.positionDescription.selectionCriteria && (
                <PdField
                  label="Selection criteria"
                  value={vacancy.positionDescription.selectionCriteria}
                />
              )}
              {vacancy.positionDescription.qualifications && (
                <PdField
                  label="Qualifications"
                  value={vacancy.positionDescription.qualifications}
                />
              )}
            </div>
          )}

          {/* Candidates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">
                Candidates ({vacancy.candidates?.length || 0})
              </h4>
              <div className="flex items-center gap-2">
                <AiButton
                  templateSlug="recruitment/resume-screen"
                  variables={{
                    vacancyRole: ROLE_LABELS[vacancy.role] || vacancy.role,
                    vacancyQualification: vacancy.qualificationRequired?.replace("_", " ") || "none",
                    vacancyNotes: vacancy.notes || "None",
                    serviceName: vacancy.service?.name || "Amana OSHC",
                    candidates: (vacancy.candidates || [])
                      .filter((c: { stage: string }) => ["applied", "screened"].includes(c.stage))
                      .map((c: { id: string; name: string; source: string; notes: string | null; resumeText?: string | null }) =>
                        `ID:${c.id} | Name: ${c.name} | Source: ${c.source} | Resume: ${c.resumeText || c.notes || "No resume provided"}`
                      )
                      .join("\n") || "No candidates to screen.",
                  }}
                  onResult={(text) => setScreenResults(text)}
                  label="Screen Candidates"
                  size="sm"
                  section="recruitment"
                  disabled={!vacancy.candidates?.some((c: { stage: string }) => ["applied", "screened"].includes(c.stage))}
                />
                <button
                  onClick={() => setShowAddCandidate(!showAddCandidate)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Candidate
                </button>
              </div>
            </div>

            {/* Add Candidate Form */}
            {showAddCandidate && (
              <form onSubmit={handleAddCandidate} className="bg-surface/50 rounded-lg p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Name *"
                    aria-label="Candidate name (required)"
                    value={candidateForm.name}
                    onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })}
                    className="px-3 py-2 text-sm border border-border rounded-lg"
                    required
                  />
                  <select
                    value={candidateForm.source}
                    onChange={(e) => setCandidateForm({ ...candidateForm, source: e.target.value })}
                    className="px-3 py-2 text-sm border border-border rounded-lg"
                  >
                    <option value="indeed">Indeed</option>
                    <option value="seek">Seek</option>
                    <option value="referral">Referral</option>
                    <option value="community">Community</option>
                    <option value="mosque">Mosque</option>
                    <option value="university">University</option>
                    <option value="walkin">Walk-in</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="email"
                    placeholder="Email"
                    aria-label="Candidate email"
                    value={candidateForm.email}
                    onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
                    className="px-3 py-2 text-sm border border-border rounded-lg"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    aria-label="Candidate phone"
                    value={candidateForm.phone}
                    onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
                    className="px-3 py-2 text-sm border border-border rounded-lg"
                  />
                </div>
                {/* Resume Upload */}
                <div className="col-span-2">
                  <label className="block text-xs text-muted mb-1">Resume / CV</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={handleFileUpload}
                      className="text-xs text-muted file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-surface file:text-foreground/80 hover:file:bg-border"
                    />
                    {uploading && <span className="text-xs text-blue-600">Uploading...</span>}
                    {candidateForm.resumeFileUrl && <span className="text-xs text-emerald-600">Uploaded</span>}
                  </div>
                </div>

                {/* Resume Text Paste */}
                <textarea
                  placeholder="Or paste resume text here..."
                  aria-label="Resume text"
                  value={candidateForm.resumeText}
                  onChange={(e) => setCandidateForm({ ...candidateForm, resumeText: e.target.value })}
                  className="col-span-2 px-3 py-2 text-sm border border-border rounded-lg h-20 resize-none"
                />

                <div className="col-span-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCandidate(false)}
                    className="px-3 py-1.5 text-xs text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || uploading}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? "Adding..." : "Add"}
                  </button>
                </div>
              </form>
            )}

            {/* AI Screening Results */}
            {screenResults && (
              <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> AI Screening Results
                  </span>
                  <button onClick={() => setScreenResults(null)} className="text-purple-400 hover:text-purple-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="text-sm text-purple-900 whitespace-pre-wrap max-h-48 overflow-y-auto">{screenResults}</div>
              </div>
            )}

            {/* Candidate List */}
            <div className="space-y-2">
              {vacancy.candidates?.length === 0 && (
                <p className="text-sm text-muted text-center py-4">No candidates yet</p>
              )}
              {vacancy.candidates?.map((c: {
                id: string;
                name: string;
                email: string | null;
                source: string;
                stage: string;
                appliedAt: string;
                resumeText: string | null;
                aiScreenScore: number | null;
                aiScreenSummary: string | null;
              }) => (
                <div key={c.id} className="bg-surface/50 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCandidateId(c.id)}
                      className="min-w-0 flex-1 text-left hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      aria-label={`Open ${c.name} details`}
                    >
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{c.name}</span>
                        {c.aiScreenScore !== null && (
                          <AiScreenBadge score={c.aiScreenScore} summary={c.aiScreenSummary} />
                        )}
                      </span>
                      <span className="block text-xs text-muted">
                        {c.source} &middot; Applied {new Date(c.appliedAt).toLocaleDateString("en-AU")}
                      </span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => aiScreen.mutate(c.id)}
                        disabled={aiScreen.isPending || !c.resumeText}
                        title={!c.resumeText ? "Candidate has no resume text to screen" : undefined}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-border text-foreground/80 hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Sparkles className="h-3 w-3" />
                        {c.aiScreenScore !== null ? "Re-screen" : "AI Screen"}
                      </button>
                      {c.stage === "accepted" && canConvert && (
                        <button
                          type="button"
                          onClick={() =>
                            setConvertTarget({ id: c.id, name: c.name, email: c.email })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        >
                          <UserPlus className="h-3 w-3" />
                          Convert to employee
                        </button>
                      )}
                      {c.stage === "hired" ? (
                        <span
                          className={`text-xs rounded-full px-3 py-1 font-medium ${STAGE_STYLES.hired}`}
                        >
                          Hired
                        </span>
                      ) : (
                        <select
                          value={c.stage}
                          aria-label={`Stage for ${c.name}`}
                          onChange={(e) => handleStageChange(c.id, e.target.value)}
                          className={`text-xs rounded-full px-3 py-1 font-medium border-0 ${STAGE_STYLES[c.stage] || "bg-surface text-foreground/80"}`}
                        >
                          {Object.entries(STAGE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedCandidateId && (
        <CandidateDetailPanel
          candidateId={selectedCandidateId}
          vacancyId={vacancyId}
          onClose={() => setSelectedCandidateId(null)}
        />
      )}

      {convertTarget && (
        <ConvertCandidateDialog
          candidate={convertTarget}
          viewerRole={viewerRole}
          onClose={() => setConvertTarget(null)}
          onConverted={() => {
            setConvertTarget(null);
            queryClient.invalidateQueries({
              queryKey: ["recruitment-vacancy", vacancyId],
            });
            onUpdated();
          }}
        />
      )}
    </div>
  );
}

function ConvertCandidateDialog({
  candidate,
  viewerRole,
  onClose,
  onConverted,
}: {
  candidate: { id: string; name: string; email: string | null };
  viewerRole: Role | undefined;
  onClose: () => void;
  onConverted: () => void;
}) {
  const convert = useConvertCandidate();
  const { data: packs } = useOnboardingPacks();
  const [role, setRole] = useState<Role>("staff");
  const [startDate, setStartDate] = useState("");
  const [newStarter, setNewStarter] = useState(true);
  const [onboardingPackId, setOnboardingPackId] = useState("");
  const [sendInvite, setSendInvite] = useState(true);

  const roleOptions =
    viewerRole === "owner"
      ? [...CONVERT_BASE_ROLES, "head_office" as Role]
      : CONVERT_BASE_ROLES;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newStarter && !startDate) {
      toast({
        variant: "destructive",
        description: "A start date is required for a new starter.",
      });
      return;
    }
    convert.mutate(
      {
        candidateId: candidate.id,
        role,
        newStarter,
        ...(startDate
          ? { startDate: new Date(startDate).toISOString() }
          : {}),
        ...(onboardingPackId ? { onboardingPackId } : {}),
        sendInvite,
      },
      { onSuccess: onConverted },
    );
  }

  const labelCls = "block text-sm font-medium text-foreground/80 mb-1";
  const inputCls =
    "w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-lg font-heading font-semibold text-foreground mb-1">
          Convert {candidate.name} to employee
        </DialogTitle>
        <p className="text-sm text-muted mb-4">
          Creates their staff account on this vacancy&apos;s centre, marks the
          vacancy filled, and can start their onboarding.
        </p>

        {!candidate.email && (
          <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4">
            This candidate has no email address — add one on their profile
            before converting.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="convert-role" className={labelCls}>Role</label>
            <select
              id="convert-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={inputCls}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>{ROLE_DISPLAY_NAMES[r]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="convert-start" className={labelCls}>Start date</label>
            <input
              id="convert-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
              required={newStarter}
            />
          </div>

          <div>
            <label htmlFor="convert-pack" className={labelCls}>Onboarding pack</label>
            <select
              id="convert-pack"
              value={onboardingPackId}
              onChange={(e) => setOnboardingPackId(e.target.value)}
              className={inputCls}
            >
              <option value="">No onboarding pack</option>
              {(packs ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.service ? ` — ${p.service.name}` : ""}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border bg-surface/50 p-3">
            <input
              type="checkbox"
              checked={newStarter}
              onChange={(e) => setNewStarter(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                New starter — require induction
              </span>
              <span className="block text-xs text-muted mt-0.5">
                They can&apos;t be rostered or clock in until essential training
                is complete and their week-1 practical is signed off.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-sm text-foreground">
              Email a welcome invite with sign-in details
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={convert.isPending}
              disabled={!candidate.email}
            >
              Convert to employee
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PdField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-900/70 mb-0.5">
        {label}
      </p>
      <p className="text-sm text-blue-900 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
