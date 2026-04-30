"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AiButton } from "@/components/ui/AiButton";

interface NewVacancyModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewVacancyModal({ onClose, onCreated }: NewVacancyModalProps) {
  const [form, setForm] = useState({
    serviceId: "",
    role: "educator",
    employmentType: "casual",
    qualificationRequired: "",
    targetFillDate: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: services = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["services-list-recruitment"],
    queryFn: async () => {
      const res = await fetch("/api/services?limit=100");
      if (!res.ok) return [];
      const d = await res.json();
      if (Array.isArray(d)) return d;
      if (Array.isArray(d.items)) return d.items;
      if (Array.isArray(d.services)) return d.services;
      return [];
    },
    retry: 2,
    staleTime: 30_000,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serviceId || !form.role) return;

    setSaving(true);
    try {
      const res = await fetch("/api/recruitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          qualificationRequired: form.qualificationRequired || null,
          targetFillDate: form.targetFillDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create vacancy");
      onCreated();
    } catch {
      alert("Failed to create vacancy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-foreground">New Vacancy</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Centre *</label>
            <select
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg"
              required
            >
              <option value="">Select centre...</option>
              {services.map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg"
              >
                <option value="educator">Educator</option>
                <option value="senior_educator">Senior Educator</option>
                <option value="member">Coordinator</option>
                <option value="director">Director</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Employment Type *</label>
              <select
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg"
              >
                <option value="casual">Casual</option>
                <option value="part_time">Part Time</option>
                <option value="permanent">Permanent</option>
                <option value="fixed_term">Fixed Term</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Qualification Required</label>
              <select
                value={form.qualificationRequired}
                onChange={(e) => setForm({ ...form, qualificationRequired: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg"
              >
                <option value="">None</option>
                <option value="cert_iii">Certificate III</option>
                <option value="diploma">Diploma</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Target Fill Date</label>
              <input
                type="date"
                value={form.targetFillDate}
                onChange={(e) => setForm({ ...form, targetFillDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-foreground/80">Notes</label>
              <AiButton
                templateSlug="recruitment/job-ad"
                variables={{
                  role: form.role.replace(/_/g, " "),
                  employmentType: form.employmentType.replace(/_/g, " "),
                  qualification: form.qualificationRequired || "none specified",
                  serviceName: services.find((s: { id: string; name: string }) => s.id === form.serviceId)?.name || "Amana OSHC",
                }}
                onResult={(text) => setForm({ ...form, notes: text })}
                label="Draft Job Ad"
                size="sm"
                section="recruitment"
              />
            </div>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg"
              placeholder="Any additional details..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.serviceId}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Vacancy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
