"use client";

/**
 * The public-facing details of a job ad (2026-10-16): headline, state, pay,
 * when, closing date. Shown on the careers pages, the job feed and every
 * job board the ad is copied to.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";

interface Ad {
  id: string;
  title: string | null;
  state: string | null;
  payRate: string | null;
  workPeriod: string | null;
  closesAt: string | null;
}

export function AdDetailsEditor({ vacancy, onSaved }: { vacancy: Ad; onSaved: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: vacancy.title ?? "",
    state: vacancy.state ?? "",
    payRate: vacancy.payRate ?? "",
    workPeriod: vacancy.workPeriod ?? "",
    closesAt: vacancy.closesAt ? vacancy.closesAt.slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);
  const dirty =
    form.title !== (vacancy.title ?? "") ||
    form.state !== (vacancy.state ?? "") ||
    form.payRate !== (vacancy.payRate ?? "") ||
    form.workPeriod !== (vacancy.workPeriod ?? "") ||
    form.closesAt !== (vacancy.closesAt ? vacancy.closesAt.slice(0, 10) : "");

  async function save() {
    setSaving(true);
    try {
      await mutateApi(`/api/recruitment/${vacancy.id}`, {
        method: "PATCH",
        body: {
          title: form.title.trim() || null,
          state: form.state || null,
          payRate: form.payRate.trim() || null,
          workPeriod: form.workPeriod.trim() || null,
          closesAt: form.closesAt || null,
        },
      });
      toast({ description: "Ad details saved." });
      qc.invalidateQueries({ queryKey: ["recruitment-vacancy", vacancy.id] });
      onSaved();
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground";
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-semibold text-foreground">Ad details</p>
      <label className="block text-xs font-medium text-muted">
        Headline
        <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={160} placeholder="e.g. Holiday Quest Educator — South-West Sydney" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-muted">
          State
          <select className={field} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
            <option value="">From the centre</option>
            <option value="NSW">NSW</option>
            <option value="VIC">VIC</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-muted">
          Pay
          <input className={field} value={form.payRate} onChange={(e) => setForm({ ...form, payRate: e.target.value })} maxLength={120} placeholder="e.g. $35–$45 an hour + super (casual)" />
        </label>
        <label className="block text-xs font-medium text-muted">
          When
          <input className={field} value={form.workPeriod} onChange={(e) => setForm({ ...form, workPeriod: e.target.value })} maxLength={200} placeholder="e.g. End of term – Christmas, then 4 Jan – late Jan 2027" />
        </label>
        <label className="block text-xs font-medium text-muted">
          Applications close
          <input type="date" className={field} value={form.closesAt} onChange={(e) => setForm({ ...form, closesAt: e.target.value })} />
        </label>
      </div>
      <p className="text-xs text-muted">The ad comes off the careers page after its closing date. Leave it blank to keep it up until you close it.</p>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
          Save ad details
        </Button>
      </div>
    </div>
  );
}
