"use client";

import { useState } from "react";
import { useUpdateService } from "@/hooks/useServices";
import { cn } from "@/lib/utils";
import { Handshake, Edit3, Save, X } from "lucide-react";

export function MarketingCard({
  service,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any;
}) {
  const updateService = useUpdateService();
  const onUpdate = (data: Record<string, unknown>) =>
    updateService.mutate({ id: service.id, ...data });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    contractStartDate: "",
    contractEndDate: "",
    licenceFeeAnnual: "",
    schoolPrincipalName: "",
    schoolPrincipalEmail: "",
    schoolBusinessManagerName: "",
    schoolBusinessManagerEmail: "",
    lastPrincipalVisit: "",
    buildAlphaKidsActive: false,
  });

  const startEdit = () => {
    setForm({
      contractStartDate: service.contractStartDate?.split("T")[0] || "",
      contractEndDate: service.contractEndDate?.split("T")[0] || "",
      licenceFeeAnnual: service.licenceFeeAnnual?.toString() || "",
      schoolPrincipalName: service.schoolPrincipalName || "",
      schoolPrincipalEmail: service.schoolPrincipalEmail || "",
      schoolBusinessManagerName: service.schoolBusinessManagerName || "",
      schoolBusinessManagerEmail: service.schoolBusinessManagerEmail || "",
      lastPrincipalVisit: service.lastPrincipalVisit?.split("T")[0] || "",
      buildAlphaKidsActive: service.buildAlphaKidsActive ?? false,
    });
    setEditing(true);
  };

  const handleSave = () => {
    onUpdate({
      contractStartDate: form.contractStartDate || null,
      contractEndDate: form.contractEndDate || null,
      licenceFeeAnnual: form.licenceFeeAnnual ? parseFloat(form.licenceFeeAnnual) : null,
      schoolPrincipalName: form.schoolPrincipalName || null,
      schoolPrincipalEmail: form.schoolPrincipalEmail || null,
      schoolBusinessManagerName: form.schoolBusinessManagerName || null,
      schoolBusinessManagerEmail: form.schoolBusinessManagerEmail || null,
      lastPrincipalVisit: form.lastPrincipalVisit || null,
      buildAlphaKidsActive: form.buildAlphaKidsActive,
    });
    setEditing(false);
  };

  // Original component called Date.now() during render; preserved here for zero-behaviour-change refactor.
  /* eslint-disable react-hooks/purity */
  const daysUntilRenewal = service.contractEndDate
    ? Math.ceil((new Date(service.contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const daysSinceVisit = service.lastPrincipalVisit
    ? Math.floor((Date.now() - new Date(service.lastPrincipalVisit).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  /* eslint-enable react-hooks/purity */

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake className="w-4 h-4 text-brand" />
          <label className="text-xs font-medium text-muted uppercase tracking-wider">
            School Partnership
          </label>
        </div>
        {!editing ? (
          <button onClick={startEdit} className="text-muted hover:text-brand">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="flex gap-1">
            <button onClick={handleSave} className="text-emerald-600 hover:text-emerald-700">
              <Save className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(false)} className="text-muted hover:text-red-500">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3 p-4 border border-border rounded-xl bg-surface/30">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Contract Start</label>
              <input type="date" value={form.contractStartDate} onChange={(e) => setForm((f) => ({ ...f, contractStartDate: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Contract End</label>
              <input type="date" value={form.contractEndDate} onChange={(e) => setForm((f) => ({ ...f, contractEndDate: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Licence Fee (Annual)</label>
              <input type="number" step="0.01" value={form.licenceFeeAnnual} onChange={(e) => setForm((f) => ({ ...f, licenceFeeAnnual: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" placeholder="$0.00" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Last Principal Visit</label>
              <input type="date" value={form.lastPrincipalVisit} onChange={(e) => setForm((f) => ({ ...f, lastPrincipalVisit: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Principal Name</label>
              <input type="text" value={form.schoolPrincipalName} onChange={(e) => setForm((f) => ({ ...f, schoolPrincipalName: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Principal Email</label>
              <input type="email" value={form.schoolPrincipalEmail} onChange={(e) => setForm((f) => ({ ...f, schoolPrincipalEmail: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Business Manager</label>
              <input type="text" value={form.schoolBusinessManagerName} onChange={(e) => setForm((f) => ({ ...f, schoolBusinessManagerName: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-0.5">Business Manager Email</label>
              <input type="email" value={form.schoolBusinessManagerEmail} onChange={(e) => setForm((f) => ({ ...f, schoolBusinessManagerEmail: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.buildAlphaKidsActive} onChange={(e) => setForm((f) => ({ ...f, buildAlphaKidsActive: e.target.checked }))} className="w-4 h-4 rounded border-border text-brand focus:ring-brand" />
            <span className="text-foreground/80">Build Alpha Kids Active</span>
          </label>
        </div>
      ) : (
        <div className="p-4 border border-border rounded-xl bg-card space-y-3">
          {/* Contract row */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-[10px] text-muted block">Contract Start</span>
              <span className="text-foreground">{service.contractStartDate ? new Date(service.contractStartDate).toLocaleDateString("en-AU") : "—"}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted block">Contract End</span>
              <div className="flex items-center gap-1.5">
                <span className="text-foreground">{service.contractEndDate ? new Date(service.contractEndDate).toLocaleDateString("en-AU") : "—"}</span>
                {daysUntilRenewal !== null && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", daysUntilRenewal <= 0 ? "bg-red-100 text-red-700" : daysUntilRenewal <= 180 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                    {daysUntilRenewal <= 0 ? "Expired" : `${daysUntilRenewal}d`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-[10px] text-muted block">Licence Fee</span>
              <span className="text-foreground">{service.licenceFeeAnnual ? `$${Number(service.licenceFeeAnnual).toLocaleString()}/yr` : "—"}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted block">Last Principal Visit</span>
              <div className="flex items-center gap-1.5">
                <span className="text-foreground">{service.lastPrincipalVisit ? new Date(service.lastPrincipalVisit).toLocaleDateString("en-AU") : "—"}</span>
                {daysSinceVisit !== null && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", daysSinceVisit > 90 ? "bg-red-100 text-red-700" : daysSinceVisit > 60 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                    {daysSinceVisit}d ago
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span className="text-[10px] text-muted block">Principal</span>
              <span className="text-foreground">{service.schoolPrincipalName || "—"}</span>
              {service.schoolPrincipalEmail && <span className="text-[10px] text-muted block">{service.schoolPrincipalEmail}</span>}
            </div>
            <div>
              <span className="text-[10px] text-muted block">Business Manager</span>
              <span className="text-foreground">{service.schoolBusinessManagerName || "—"}</span>
              {service.schoolBusinessManagerEmail && <span className="text-[10px] text-muted block">{service.schoolBusinessManagerEmail}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={cn("w-2 h-2 rounded-full", service.buildAlphaKidsActive ? "bg-emerald-500" : "bg-border")} />
            <span className="text-muted">Build Alpha Kids: {service.buildAlphaKidsActive ? "Active" : "Inactive"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
