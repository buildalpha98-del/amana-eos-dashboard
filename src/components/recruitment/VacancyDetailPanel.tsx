"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus, UserPlus, ChevronRight, Sparkles } from "lucide-react";
import { AiButton } from "@/components/ui/AiButton";
import { AiScreenBadge } from "@/components/recruitment/AiScreenBadge";
import { CandidateDetailPanel } from "@/components/recruitment/CandidateDetailPanel";
import { useAiScreenCandidate } from "@/hooks/useRecruitment";

const ROLE_LABELS: Record<string, string> = {
  educator: "Educator",
  senior_educator: "Senior Educator",
  coordinator: "Coordinator",
  director: "Director",
};

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
  screened: "bg-blue-100 text-blue-700",
  interviewed: "bg-amber-100 text-amber-700",
  offered: "bg-purple-100 text-purple-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-surface text-muted",
};

interface VacancyDetailPanelProps {
  vacancyId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function VacancyDetailPanel({ vacancyId, onClose, onUpdated }: VacancyDetailPanelProps) {
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

  const { data: vacancy, isLoading } = useQuery({
    queryKey: ["recruitment-vacancy", vacancyId],
    queryFn: async () => {
      const res = await fetch(`/api/recruitment/${vacancyId}`);
      if (!res.ok) throw new Error("Failed to fetch vacancy");
      return res.json();
    },
  });

  const handleStatusChange = async (status: string) => {
    await fetch(`/api/recruitment/${vacancyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    queryClient.invalidateQueries({ queryKey: ["recruitment-vacancy", vacancyId] });
    onUpdated();
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
    } catch {
      alert("Failed to add candidate");
    } finally {
      setSaving(false);
    }
  };

  const handleStageChange = async (candidateId: string, stage: string) => {
    await fetch(`/api/recruitment/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    queryClient.invalidateQueries({ queryKey: ["recruitment-vacancy", vacancyId] });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("File must be under 10 MB");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setCandidateForm((prev) => ({ ...prev, resumeFileUrl: data.url }));
    } catch {
      alert("Failed to upload file");
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
                    value={candidateForm.email}
                    onChange={(e) => setCandidateForm({ ...candidateForm, email: e.target.value })}
                    className="px-3 py-2 text-sm border border-border rounded-lg"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
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
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 mb-4">
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
                      <select
                        value={c.stage}
                        onChange={(e) => handleStageChange(c.id, e.target.value)}
                        className={`text-xs rounded-full px-3 py-1 font-medium border-0 ${STAGE_STYLES[c.stage] || "bg-surface text-foreground/80"}`}
                      >
                        {Object.entries(STAGE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
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
    </div>
  );
}
