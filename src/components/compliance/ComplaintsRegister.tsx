"use client";

/**
 * The complaints and feedback register — Reg 168(2)(o), and the 24-hour
 * clock from s.174(2)(b).
 *
 * The register leads with the clock, not the list. A complaint alleging
 * a serious incident or a breach of the Law must reach the Regulatory
 * Authority within 24 hours of the service becoming aware, and missing
 * that is an offence whether or not the allegation turns out to be true.
 * Everything else on this screen is secondary to "is anything running
 * out of time".
 *
 * Intake asks whether it's notifiable up front rather than at review.
 * The person taking the phone call knows what was alleged; by the time a
 * manager triages it next morning a third of the window is gone.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, MessageSquareWarning, Plus, Timer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import {
  COMPLAINT_CATEGORIES,
  NOTIFIABLE_REASONS,
} from "@/lib/complaint-reference";
import { describeClock, type ClockStatus } from "@/lib/compliance-clocks";

interface Complaint {
  id: string;
  reference: string;
  receivedAt: string;
  source: string;
  complainantName: string | null;
  anonymous: boolean;
  childName: string | null;
  category: string;
  summary: string;
  notifiable: boolean;
  notifiableReason: string | null;
  notificationDueAt: string | null;
  regulatorNotifiedAt: string | null;
  regulatorReference: string | null;
  status: string;
  acknowledgedAt: string | null;
  outcome: string | null;
  service: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  clock: ClockStatus;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

const STATUSES = [
  "new",
  "acknowledged",
  "investigating",
  "resolved",
  "closed",
  "escalated",
];

export function ComplaintsRegister({
  services,
}: {
  services: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    serviceId: services[0]?.id ?? "",
    source: "phone",
    complainantName: "",
    complainantEmail: "",
    anonymous: false,
    childName: "",
    category: "other",
    summary: "",
    details: "",
    notifiable: false,
    notifiableReason: "serious_incident",
  });

  const key = ["compliance", "complaints", status, serviceId];
  const { data, isLoading } = useQuery<{ complaints: Complaint[] }>({
    queryKey: key,
    queryFn: () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (serviceId) p.set("serviceId", serviceId);
      const qs = p.toString();
      return fetchApi(`/api/compliance/complaints${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi("/api/compliance/complaints", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance", "complaints"] });
      setAdding(false);
      setForm((f) => ({
        ...f,
        complainantName: "",
        complainantEmail: "",
        childName: "",
        summary: "",
        details: "",
        notifiable: false,
      }));
      toast({ description: "Complaint logged." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const markNotified = useMutation({
    mutationFn: (v: { id: string; reference: string }) =>
      mutateApi(`/api/compliance/complaints/${v.id}`, {
        method: "PATCH",
        body: {
          regulatorNotifiedAt: new Date().toISOString(),
          regulatorReference: v.reference || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance", "complaints"] });
      toast({ description: "Notification recorded." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const complaints = data?.complaints ?? [];

  /**
   * The only number that matters on load: notifiable, not yet lodged,
   * and past its deadline.
   */
  const overdue = complaints.filter(
    (c) => c.notifiable && !c.regulatorNotifiedAt && c.clock.state === "overdue",
  );
  const running = complaints.filter(
    (c) => c.notifiable && !c.regulatorNotifiedAt && c.clock.state === "due",
  );

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      {/* The clock, before anything else. */}
      {(overdue.length > 0 || running.length > 0) && (
        <div
          className={`rounded-lg border p-4 ${
            overdue.length > 0
              ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          }`}
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Timer className="h-4 w-4" />
            {overdue.length > 0
              ? `${overdue.length} notification${overdue.length === 1 ? "" : "s"} overdue`
              : `${running.length} notification${running.length === 1 ? "" : "s"} due`}
          </p>
          <ul className="mt-2 space-y-1">
            {[...overdue, ...running].map((c) => (
              <li key={c.id} className="text-xs text-foreground">
                <strong>{c.reference}</strong> — {describeClock(c.clock)} ·{" "}
                {c.summary.slice(0, 80)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          className={`${field} max-w-[14rem]`}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          aria-label="Filter by centre"
        >
          <option value="">All centres</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className={`${field} max-w-[12rem]`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        {!adding && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Log a complaint
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-muted">
              Centre
              <select
                className={`${field} mt-1`}
                value={form.serviceId}
                onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              How it came in
              <select
                className={`${field} mt-1`}
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              >
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
                <option value="email">Email</option>
                <option value="letter">Letter</option>
                <option value="parent_portal">Parent portal</option>
                <option value="staff">From a staff member</option>
                <option value="anonymous">Anonymously</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Category
              <select
                className={`${field} mt-1`}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {COMPLAINT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-muted">
              Who complained
              <input
                className={`${field} mt-1`}
                disabled={form.anonymous}
                value={form.complainantName}
                onChange={(e) =>
                  setForm({ ...form, complainantName: e.target.value })
                }
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              Their email
              <input
                className={`${field} mt-1`}
                disabled={form.anonymous}
                value={form.complainantEmail}
                onChange={(e) =>
                  setForm({ ...form, complainantEmail: e.target.value })
                }
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              Child involved (if any)
              <input
                className={`${field} mt-1`}
                value={form.childName}
                onChange={(e) => setForm({ ...form, childName: e.target.value })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.anonymous}
              onChange={(e) =>
                setForm({ ...form, anonymous: e.target.checked })
              }
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            Made anonymously
          </label>

          <label className="block text-xs font-medium text-muted">
            What was said <span className="text-red-600">*</span>
            <textarea
              className={`${field} mt-1`}
              rows={3}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </label>

          {/* The 24-hour question, asked at intake. */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={form.notifiable}
                onChange={(e) =>
                  setForm({ ...form, notifiable: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
              />
              <span className="text-sm text-amber-900 dark:text-amber-200">
                This complaint <strong>alleges</strong> a serious incident, or
                that the Law or Regulations have been breached
                <span className="mt-0.5 block text-xs">
                  If so, the Regulatory Authority must be told within 24 hours
                  of us becoming aware — whether or not it turns out to be
                  true. Tick it now and decide later; the clock has already
                  started.
                </span>
              </span>
            </label>
            {form.notifiable && (
              <select
                className={`${field} mt-2`}
                value={form.notifiableReason}
                onChange={(e) =>
                  setForm({ ...form, notifiableReason: e.target.value })
                }
              >
                {NOTIFIABLE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              disabled={create.isPending || !form.summary.trim() || !form.serviceId}
              onClick={() =>
                create.mutate({
                  serviceId: form.serviceId,
                  source: form.source,
                  category: form.category,
                  summary: form.summary.trim(),
                  ...(form.details.trim() ? { details: form.details.trim() } : {}),
                  anonymous: form.anonymous,
                  ...(form.anonymous
                    ? {}
                    : {
                        ...(form.complainantName.trim()
                          ? { complainantName: form.complainantName.trim() }
                          : {}),
                        ...(form.complainantEmail.trim()
                          ? { complainantEmail: form.complainantEmail.trim() }
                          : {}),
                      }),
                  ...(form.childName.trim()
                    ? { childName: form.childName.trim() }
                    : {}),
                  notifiable: form.notifiable,
                  ...(form.notifiable
                    ? { notifiableReason: form.notifiableReason }
                    : {}),
                })
              }
            >
              {create.isPending ? "Logging…" : "Log complaint"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {complaints.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="No complaints recorded"
          description="Reg 168(2)(o) requires a register. Log every complaint here, including the ones that turn out to be nothing."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Reference", "Received", "Category", "Summary", "Notifiable", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="py-2 pr-3 text-xs font-medium uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {complaints.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-3 whitespace-nowrap font-medium text-foreground">
                    {c.reference}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted">
                    {fmt(c.receivedAt)}
                  </td>
                  <td className="py-2 pr-3 text-muted">
                    {COMPLAINT_CATEGORIES.find((x) => x.value === c.category)
                      ?.label ?? c.category}
                  </td>
                  <td className="py-2 pr-3 text-foreground">
                    {c.summary.length > 90
                      ? `${c.summary.slice(0, 90)}…`
                      : c.summary}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {c.notifiable ? (
                      c.regulatorNotifiedAt ? (
                        <span className="text-2xs text-muted">
                          {describeClock(c.clock)}
                          {c.regulatorReference && ` · ${c.regulatorReference}`}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 text-2xs font-medium ${
                            c.clock.state === "overdue"
                              ? "text-red-700 dark:text-red-300"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {describeClock(c.clock)}
                          <button
                            type="button"
                            onClick={() =>
                              markNotified.mutate({
                                id: c.id,
                                reference:
                                  window.prompt(
                                    "NQA ITS reference (optional) — leave blank if you don't have it yet",
                                  ) ?? "",
                              })
                            }
                            className="ml-1 underline"
                          >
                            Mark notified
                          </button>
                        </span>
                      )
                    ) : (
                      <span className="text-2xs text-muted">No</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted">
                    {c.status.replace("_", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
