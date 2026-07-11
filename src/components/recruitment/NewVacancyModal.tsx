"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AiButton } from "@/components/ui/AiButton";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import { buildJobAdTemplate } from "@/lib/recruitment/job-ad-templates";

interface NewVacancyModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function NewVacancyModal({ onClose, onCreated }: NewVacancyModalProps) {
  useEscapeClose(onClose);
  const [form, setForm] = useState({
    serviceId: "",
    role: "educator",
    employmentType: "casual",
    qualificationRequired: "",
    targetFillDate: "",
    notes: "",
    positionDescriptionId: "",
    publishToWebsite: false,
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

  // Published PDs only — drafts shouldn't be linkable from a vacancy.
  const { data: pdList } = useQuery<{
    items: Array<{ id: string; title: string; targetRole: string | null }>;
  }>({
    queryKey: ["position-descriptions-published"],
    queryFn: async () => {
      const res = await fetch("/api/position-descriptions?status=published");
      if (!res.ok) return { items: [] };
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Pre-fill the Notes (public job ad) with a role-based template whenever the
  // role, centre or employment type changes — but never clobber a manual edit.
  // We only overwrite when Notes is empty or still equals the template we last
  // inserted (tracked via the ref).
  const lastTemplateRef = useRef("");
  useEffect(() => {
    const centreName = services.find((s) => s.id === form.serviceId)?.name;
    const template = buildJobAdTemplate(form.role, centreName, form.employmentType);
    setForm((prev) => {
      if (prev.notes === "" || prev.notes === lastTemplateRef.current) {
        lastTemplateRef.current = template;
        return { ...prev, notes: template };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role, form.serviceId, form.employmentType, services]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serviceId || !form.role) return;

    setSaving(true);
    try {
      const res = await fetch("/api/recruitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: form.serviceId,
          role: form.role,
          employmentType: form.employmentType,
          notes: form.notes,
          qualificationRequired: form.qualificationRequired || null,
          targetFillDate: form.targetFillDate || null,
          positionDescriptionId: form.positionDescriptionId || null,
          postedChannels: form.publishToWebsite ? ["website"] : [],
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
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-foreground">New Vacancy</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
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
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Position Description{" "}
              <span className="text-muted font-normal">(optional)</span>
            </label>
            <select
              value={form.positionDescriptionId}
              onChange={(e) =>
                setForm({ ...form, positionDescriptionId: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-border rounded-lg"
            >
              <option value="">— None —</option>
              {pdList?.items?.map((pd) => (
                <option key={pd.id} value={pd.id}>
                  {pd.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">
              Linking a PD surfaces the selection criteria on the
              vacancy detail page for the interview panel.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-foreground/80">Notes / job ad</label>
              <AiButton
                templateSlug="recruitment/job-ad"
                variables={{
                  role: form.role.replace(/_/g, " "),
                  employmentType: form.employmentType.replace(/_/g, " "),
                  qualification: form.qualificationRequired || "none specified",
                  serviceName: services.find((s: { id: string; name: string }) => s.id === form.serviceId)?.name || "Amana OSHC",
                }}
                onResult={(text) => setForm({ ...form, notes: text })}
                label="Draft with AI"
                size="sm"
                section="recruitment"
              />
            </div>
            <p className="text-xs text-muted mb-1">
              Pre-filled from a template for this role. Just replace the{" "}
              <span className="font-medium">[BRACKETED]</span> blanks (pay rate, hours, etc.).
              This becomes the public job ad if you publish to the website.
            </p>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg leading-relaxed"
              placeholder="Any additional details..."
            />
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.publishToWebsite}
              onChange={(e) => setForm({ ...form, publishToWebsite: e.target.checked })}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium text-foreground/90">Show on public careers page</span>
              <span className="block text-xs text-muted mt-0.5">
                Lists this role at amanaoshc.com.au/careers with an apply link. The
                Notes above become the public job ad. You can toggle this off any time.
              </span>
            </span>
          </label>

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
