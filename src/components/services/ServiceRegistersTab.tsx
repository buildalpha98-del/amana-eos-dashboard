"use client";

/**
 * The three registers a service gets asked for and had nowhere to keep:
 * who came into the building, staff injuries, and illness with the
 * family notification attached.
 *
 * One tab with three views rather than three tabs, because they're all
 * "the book you show someone official" and nobody looks for them
 * separately — they look for them when asked.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, DoorOpen, HeartPulse, Plus, UserX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

type View = "visitors" | "staff" | "illness";

const VIEWS: Array<{ key: View; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "visitors", label: "Visitors", icon: DoorOpen },
  { key: "staff", label: "Staff incidents", icon: UserX },
  { key: "illness", label: "Illness", icon: HeartPulse },
];

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
const dateAU = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function ServiceRegistersTab({
  serviceId,
  canSeeStaffIncidents,
}: {
  serviceId: string;
  canSeeStaffIncidents: boolean;
}) {
  const [view, setView] = useState<View>("visitors");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {VIEWS.filter((v) => v.key !== "staff" || canSeeStaffIncidents).map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
              view === v.key
                ? "bg-brand text-white"
                : "border border-border text-muted hover:bg-surface"
            }`}
          >
            <v.icon className="h-3.5 w-3.5" />
            {v.label}
          </button>
        ))}
      </div>

      {view === "visitors" && <VisitorsPanel serviceId={serviceId} />}
      {view === "staff" && canSeeStaffIncidents && (
        <StaffIncidentsPanel serviceId={serviceId} />
      )}
      {view === "illness" && <IllnessPanel serviceId={serviceId} />}
    </div>
  );
}

/* ── Visitors ───────────────────────────────────────────────────────── */

interface VisitorRow {
  id: string;
  name: string;
  organisation: string | null;
  purpose: string | null;
  visitingWhom: string | null;
  signedInAt: string;
  signedOutAt: string | null;
  wwccSighted: boolean;
}

function VisitorsPanel({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "visitors"];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [purpose, setPurpose] = useState("");
  const [wwcc, setWwcc] = useState(false);

  const { data, isLoading } = useQuery<{
    visitors: VisitorRow[];
    stillOnSite: Array<{ id: string; name: string; signedInAt: string }>;
  }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/visitors`),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/visitors`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setAdding(false);
      setName("");
      setOrg("");
      setPurpose("");
      setWwcc(false);
      toast({ description: "Signed in." });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const signOut = useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/services/${serviceId}/visitors/${id}`, {
        method: "PATCH",
        body: { signOut: true },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;

  const rows = data?.visitors ?? [];
  const onSite = data?.stillOnSite ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted">
          Everyone who isn&apos;t staff or a child. Signing out matters as
          much as signing in — at close, whoever is left here is either
          still in the building or forgot.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Sign in
          </Button>
        )}
      </div>

      {onSite.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Still on site ({onSite.length})
          </p>
          <ul className="mt-1 space-y-1">
            {onSite.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-100"
              >
                <span>
                  {v.name} — in since {time(v.signedInAt)}
                </span>
                <button
                  type="button"
                  onClick={() => signOut.mutate(v.id)}
                  className="rounded border border-amber-300 px-2 py-0.5 dark:border-amber-800"
                >
                  Sign out
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="v-name" className="block text-sm font-medium text-foreground mb-1">
                Name
              </label>
              <input id="v-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="v-org" className="block text-sm font-medium text-foreground mb-1">
                Organisation <span className="text-muted">(optional)</span>
              </label>
              <input id="v-org" className={field} value={org} onChange={(e) => setOrg(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="v-purpose" className="block text-sm font-medium text-foreground mb-1">
              Why are they here?
            </label>
            <input
              id="v-purpose"
              className={field}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Air-con repair, centre tour"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={wwcc}
              onChange={(e) => setWwcc(e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            Working with Children Check sighted
          </label>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                create.mutate({
                  name: name.trim(),
                  ...(org.trim() ? { organisation: org.trim() } : {}),
                  ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
                  wwccSighted: wwcc,
                })
              }
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? "Signing in…" : "Sign in"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nobody signed in today.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {v.name}
                  {v.organisation && (
                    <span className="text-muted"> · {v.organisation}</span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {v.purpose && `${v.purpose} · `}
                  In {time(v.signedInAt)}
                  {v.signedOutAt ? ` · out ${time(v.signedOutAt)}` : " · still here"}
                  {v.wwccSighted && " · WWCC sighted"}
                </p>
              </div>
              {!v.signedOutAt && (
                <button
                  type="button"
                  onClick={() => signOut.mutate(v.id)}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:bg-surface"
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Staff incidents ────────────────────────────────────────────────── */

interface StaffIncidentRow {
  id: string;
  staffName: string;
  occurredAt: string;
  incidentType: string;
  severity: string;
  description: string;
  bodyPart: string | null;
  reportableToAuthority: boolean;
  reportedToAuthorityAt: string | null;
  followUpRequired: boolean;
  followUpCompleted: boolean;
  reportedBy: string | null;
}

function StaffIncidentsPanel({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "staff-incidents"];
  const [adding, setAdding] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [when, setWhen] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [description, setDescription] = useState("");
  const [bodyPart, setBodyPart] = useState("");

  const { data, isLoading } = useQuery<{
    incidents: StaffIncidentRow[];
    notifiableUnreported: number;
    openFollowUps: number;
  }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/staff-incidents`),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/staff-incidents`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setAdding(false);
      setStaffName("");
      setWhen("");
      setDescription("");
      setBodyPart("");
      setSeverity("minor");
      toast({ description: "Recorded." });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;

  const rows = data?.incidents ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted">
          Injuries and near-misses to staff. Kept apart from child
          incidents because the questions asked afterwards are different.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Record
          </Button>
        )}
      </div>

      {(data?.notifiableUnreported ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {data!.notifiableUnreported} notifiable{" "}
          {data!.notifiableUnreported === 1 ? "incident has" : "incidents have"}{" "}
          no record of being reported to the regulator.
        </div>
      )}

      {adding && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="si-name" className="block text-sm font-medium text-foreground mb-1">
                Who was hurt?
              </label>
              <input
                id="si-name"
                className={field}
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="si-when" className="block text-sm font-medium text-foreground mb-1">
                When
              </label>
              <input
                id="si-when"
                type="datetime-local"
                className={field}
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="si-sev" className="block text-sm font-medium text-foreground mb-1">
                How serious
              </label>
              <select
                id="si-sev"
                className={field}
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="serious">Serious</option>
                <option value="notifiable">Notifiable to the regulator</option>
              </select>
            </div>
            <div>
              <label htmlFor="si-body" className="block text-sm font-medium text-foreground mb-1">
                Body part <span className="text-muted">(optional)</span>
              </label>
              <input
                id="si-body"
                className={field}
                value={bodyPart}
                onChange={(e) => setBodyPart(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="si-desc" className="block text-sm font-medium text-foreground mb-1">
              What happened
            </label>
            <textarea
              id="si-desc"
              rows={3}
              className={field}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                create.mutate({
                  staffName: staffName.trim(),
                  occurredAt: new Date(when).toISOString(),
                  severity,
                  description: description.trim(),
                  ...(bodyPart.trim() ? { bodyPart: bodyPart.trim() } : {}),
                  followUpRequired: severity !== "minor",
                })
              }
              disabled={
                create.isPending || !staffName.trim() || !when || !description.trim()
              }
            >
              {create.isPending ? "Recording…" : "Record"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing recorded.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="p-3 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{r.staffName}</p>
                <span className="text-2xs uppercase tracking-wide text-muted">
                  {r.severity}
                </span>
              </div>
              <p className="text-xs text-muted">
                {dateAU(r.occurredAt)} · {r.incidentType.replace("_", " ")}
                {r.bodyPart && ` · ${r.bodyPart}`}
                {r.reportedBy && ` · recorded by ${r.reportedBy}`}
              </p>
              <p className="text-sm text-foreground/85">{r.description}</p>
              {r.reportableToAuthority && (
                <p
                  className={`text-xs ${
                    r.reportedToAuthorityAt
                      ? "text-green-700 dark:text-green-400"
                      : "text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {r.reportedToAuthorityAt ? (
                    <>
                      <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                      Reported {dateAU(r.reportedToAuthorityAt)}
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                      Notifiable — no record of it being reported
                    </>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Illness ────────────────────────────────────────────────────────── */

interface IllnessRow {
  id: string;
  personName: string;
  personType: string;
  illness: string;
  infectious: boolean;
  onsetDate: string;
  returnDate: string | null;
  familiesNotifiedAt: string | null;
  notifiedBy: string | null;
  recordedBy: string | null;
}

function IllnessPanel({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "illness"];
  const [adding, setAdding] = useState(false);
  const [personName, setPersonName] = useState("");
  const [illness, setIllness] = useState("");
  const [infectious, setInfectious] = useState(false);
  const [onsetDate, setOnsetDate] = useState("");
  const [returnDate, setReturnDate] = useState("");

  const { data, isLoading } = useQuery<{
    records: IllnessRow[];
    infectiousUnnotified: number;
    currentlyExcluded: number;
  }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/illness`),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/illness`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setAdding(false);
      setPersonName("");
      setIllness("");
      setInfectious(false);
      setOnsetDate("");
      setReturnDate("");
      toast({ description: "Recorded." });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const notify = useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/services/${serviceId}/illness/${id}`, {
        method: "PATCH",
        body: { notifyFamilies: true },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ description: "Marked as notified." });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;

  const rows = data?.records ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted">
          Illness and infectious disease. For anything infectious, the
          date families were told is the thing you&apos;ll be asked for.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Record
          </Button>
        )}
      </div>

      {(data?.infectiousUnnotified ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {data!.infectiousUnnotified} infectious{" "}
          {data!.infectiousUnnotified === 1 ? "case where families haven't" : "cases where families haven't"}{" "}
          been told.
        </div>
      )}

      {adding && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="il-name" className="block text-sm font-medium text-foreground mb-1">
                Who
              </label>
              <input
                id="il-name"
                className={field}
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="il-what" className="block text-sm font-medium text-foreground mb-1">
                What
              </label>
              <input
                id="il-what"
                className={field}
                value={illness}
                onChange={(e) => setIllness(e.target.value)}
                placeholder="e.g. Gastro, hand foot and mouth"
              />
            </div>
            <div>
              <label htmlFor="il-onset" className="block text-sm font-medium text-foreground mb-1">
                First unwell
              </label>
              <input
                id="il-onset"
                type="date"
                className={field}
                value={onsetDate}
                onChange={(e) => setOnsetDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="il-return" className="block text-sm font-medium text-foreground mb-1">
                May return <span className="text-muted">(optional)</span>
              </label>
              <input
                id="il-return"
                type="date"
                className={field}
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={infectious}
              onChange={(e) => setInfectious(e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            Infectious — families need to be told
          </label>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                create.mutate({
                  personName: personName.trim(),
                  illness: illness.trim(),
                  infectious,
                  onsetDate,
                  ...(returnDate ? { returnDate } : {}),
                })
              }
              disabled={
                create.isPending || !personName.trim() || !illness.trim() || !onsetDate
              }
            >
              {create.isPending ? "Recording…" : "Record"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing recorded.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="p-3 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {r.personName}
                <span className="text-muted"> · {r.illness}</span>
              </p>
              <p className="text-xs text-muted">
                Unwell from {dateAU(r.onsetDate)}
                {r.returnDate && ` · back ${dateAU(r.returnDate)}`}
                {r.personType === "staff" && " · staff"}
              </p>
              {r.infectious &&
                (r.familiesNotifiedAt ? (
                  <p className="text-xs text-green-700 dark:text-green-400">
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                    Families told {dateAU(r.familiesNotifiedAt)}
                    {r.notifiedBy && ` by ${r.notifiedBy}`}
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                      Families not told yet
                    </span>
                    <button
                      type="button"
                      onClick={() => notify.mutate(r.id)}
                      className="rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:bg-surface"
                    >
                      Mark as told
                    </button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
