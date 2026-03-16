"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus, UserPlus, ChevronRight, Sparkles } from "lucide-react";
import { AiButton } from "@/components/ui/AiButton";

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
  applied: "bg-gray-100 text-gray-700",
  screened: "bg-blue-100 text-blue-700",
  interviewed: "bg-amber-100 text-amber-700",
  offered: "bg-purple-100 text-purple-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-500",
};

interface VacancyDetailPanelProps {
  vacancyId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function VacancyDetailPanel({ vacancyId, onClose, onUpdated }: VacancyDetailPanelProps) {
  const queryClient = useQueryClient();
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
        <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!vacancy) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {ROLE_LABELS[vacancy.role] || vacancy.role}
            </h3>
            <p className="text-sm text-gray-500">
              {vacancy.service?.name} &middot; {vacancy.employmentType.replace("_", " ")}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="flex flex-wrap gap-2">
              {["open", "interviewing", "offered", "filled", "cancelled"].map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`px-3 py-1.5 text-xs rounded-full font-medium capitalize transition-colors ${
                    vacancy.status === s
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
              <span className="text-gray-500">Qualification</span>
              <p className="font-medium text-gray-900 capitalize">
                {vacancy.qualificationRequired?.replace("_", " ") || "None"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Assigned To</span>
              <p className="font-medium text-gray-900">
                {vacancy.assignedTo?.name || "Unassigned"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Target Fill Date</span>
              <p className="font-medium text-gray-900">
                {vacancy.targetFillDate
                  ? new Date(vacancy.targetFillDate).toLocaleDateString("en-AU")
                  : "—"}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Created</span>
              <p className="font-medium text-gray-900">
                {new Date(vacancy.createdAt).toLocaleDateString("en-AU")}
              </p>
            </div>
          </div>

          {vacancy.notes && (
            <div>
              <span className="text-sm text-gray-500">Notes</span>
              <p className="text-sm text-gray-700 mt-1">{vacancy.notes}</p>
            </div>
          )}

          {/* Candidates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900">
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
              <form onSubmit={handleAddCandidate} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Name *"
                    value={candidateForm.name}
                    onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    required
                  />
                  <select
                    value={candidateForm.source}
                    onChange={(e) => setCandidateForm({ ...candidateForm, source: e.target.value })}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
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
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={candidateForm.phone}
                    onChange={(e) => setCandidateForm({ ...candidateForm, phone: e.target.value })}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
                {/* Resume Upload */}
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Resume / CV</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={handleFileUpload}
                      className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
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
                  className="col-span-2 px-3 py-2 text-sm border border-gray-300 rounded-lg h-20 resize-none"
                />

                <div className="col-span-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCandidate(false)}
                    className="px-3 py-1.5 text-xs text-gray-600"
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
                <p className="text-sm text-gray-400 text-center py-4">No candidates yet</p>
              )}
              {vacancy.candidates?.map((c: {
                id: string;
                name: string;
                email: string | null;
                source: string;
                stage: string;
                appliedAt: string;
              }) => (
                <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">
                      {c.source} &middot; Applied {new Date(c.appliedAt).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  <select
                    value={c.stage}
                    onChange={(e) => handleStageChange(c.id, e.target.value)}
                    className={`text-xs rounded-full px-3 py-1 font-medium border-0 ${STAGE_STYLES[c.stage] || "bg-gray-100 text-gray-700"}`}
                  >
                    {Object.entries(STAGE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
