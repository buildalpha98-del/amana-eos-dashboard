"use client";

/**
 * Hazards & maintenance (2026-10-09, OWNA parity; mock-up in "Staff Side vs
 * OWNA"). Anyone at the centre reports in a few taps, with a photo if it
 * helps; the Coordinator says who's fixing it and by when, and closes it
 * off. Open ones count in the Coordinator's "Needs you" on Today.
 */
import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Loader2, MapPin, Plus, Wrench } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { uploadFileSmart } from "@/lib/upload-client";
import { toast } from "@/hooks/useToast";
import { isAdminRole } from "@/lib/role-permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";

type Priority = "low" | "medium" | "high";
type Status = "open" | "in_progress" | "waiting" | "fixed";

interface Hazard {
  id: string;
  title: string;
  details: string | null;
  location: string | null;
  priority: Priority;
  status: Status;
  photoUrl: string | null;
  reportedByName: string;
  assignedTo: string | null;
  dueDate: string | null;
  fixedAt: string | null;
  fixedByName: string | null;
  fixNotes: string | null;
  createdAt: string;
}

const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200" },
  medium: { label: "Medium", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  low: { label: "Low", cls: "bg-surface text-foreground" },
};
const STATUS: Record<Status, string> = {
  open: "Not started",
  in_progress: "Being fixed",
  waiting: "Waiting on someone",
  fixed: "Fixed",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" });

export function ServiceHazardsTab({ serviceId }: { serviceId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canManage = isAdminRole(role) || (role === "member" && session?.user?.serviceId === serviceId);
  const [show, setShow] = useState<"open" | "all">("open");
  const [reporting, setReporting] = useState(false);
  const key = ["hazards", serviceId, show];

  const { data, isLoading } = useQuery<{ hazards: Hazard[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/hazards?show=${show}`),
    retry: 2,
  });
  const hazards = data?.hazards ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" className="bg-accent text-brand hover:bg-accent/90" onClick={() => setReporting(true)}>
          <Plus className="h-5 w-5" />
          Report a hazard
        </Button>
        <div className="ml-auto flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Show">
          {(["open", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={show === v}
              onClick={() => setShow(v)}
              className={cn(
                "min-h-9 rounded-md px-3 text-sm font-medium",
                show === v ? "bg-brand text-white" : "text-muted hover:text-foreground",
              )}
            >
              {v === "open" ? "Still to fix" : "Everything"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : hazards.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={show === "open" ? "Nothing waiting to be fixed" : "No hazards reported yet"}
          description="Spotted something broken or unsafe? Report it here and your Coordinator will be told."
        />
      ) : (
        <ul className="space-y-2">
          {hazards.map((h) => (
            <HazardCard key={h.id} hazard={h} serviceId={serviceId} canManage={canManage} />
          ))}
        </ul>
      )}

      {reporting && <ReportDialog serviceId={serviceId} onClose={() => setReporting(false)} />}
    </div>
  );
}

function HazardCard({ hazard: h, serviceId, canManage }: { hazard: Hazard; serviceId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [assignedTo, setAssignedTo] = useState(h.assignedTo ?? "");
  const [dueDate, setDueDate] = useState(h.dueDate?.slice(0, 10) ?? "");
  const [fixNotes, setFixNotes] = useState(h.fixNotes ?? "");
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/hazards/${h.id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hazards", serviceId] });
      qc.invalidateQueries({ queryKey: ["centre-day", serviceId] });
      setEditing(false);
      toast({ description: "Hazard updated." });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  const fixed = h.status === "fixed";

  return (
    <li className={cn("rounded-xl border border-border bg-card p-4", fixed && "opacity-75")}>
      <div className="flex gap-3">
        {h.photoUrl && (
          <a href={h.photoUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted photo */}
            <img src={h.photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
          </a>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{h.title}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold", PRIORITY[h.priority].cls)}>
              {PRIORITY[h.priority].label}
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {h.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden />
                {h.location}
              </span>
            )}
            <span>
              {fmtDate(h.createdAt)} · {h.reportedByName}
            </span>
          </p>
          {h.details && <p className="mt-1 text-sm text-foreground">{h.details}</p>}
          <p className="mt-1.5 text-sm">
            <span className={cn("font-medium", fixed ? "text-green-700 dark:text-green-400" : "text-foreground")}>
              {STATUS[h.status]}
            </span>
            {!fixed && h.assignedTo && <span className="text-muted"> · {h.assignedTo}</span>}
            {!fixed && h.dueDate && <span className="text-muted"> · due {fmtDate(h.dueDate)}</span>}
            {fixed && h.fixedAt && (
              <span className="text-muted">
                {" "}
                · {fmtDate(h.fixedAt)}
                {h.fixedByName ? ` · ${h.fixedByName}` : ""}
              </span>
            )}
          </p>
          {fixed && h.fixNotes && <p className="mt-0.5 text-sm text-muted">{h.fixNotes}</p>}
        </div>
      </div>

      {canManage && !editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!fixed ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <Wrench className="h-4 w-4" />
                Who&rsquo;s fixing it
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => update.mutate({ status: "fixed", fixNotes: fixNotes || null })}
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark fixed
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ status: "open" })} disabled={update.isPending}>
              Reopen
            </Button>
          )}
        </div>
      )}

      {canManage && editing && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              assignedTo: assignedTo || null,
              dueDate: dueDate || null,
              status: h.status === "open" && assignedTo ? "in_progress" : h.status,
            });
          }}
        >
          <label className="text-sm font-medium text-foreground">
            Who&rsquo;s fixing it
            <input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="e.g. Ahmed (maintenance), the school"
              className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <label className="text-sm font-medium text-foreground">
            Fix by
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2" role="group" aria-label="Status">
            {(["open", "in_progress", "waiting"] as const).map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={h.status === st}
                onClick={() => update.mutate({ status: st })}
                className={cn(
                  "min-h-10 rounded-full border px-3 text-sm",
                  h.status === st ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground",
                )}
              >
                {STATUS[st]}
              </button>
            ))}
          </div>
          <label className="text-sm font-medium text-foreground sm:col-span-2">
            Note for when it&rsquo;s fixed (optional)
            <input
              value={fixNotes}
              onChange={(e) => setFixNotes(e.target.value)}
              placeholder="e.g. Latch replaced by the school"
              className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={update.isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function ReportDialog({ serviceId, onClose }: { serviceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const report = useMutation({
    mutationFn: () =>
      mutateApi(`/api/services/${serviceId}/hazards`, {
        method: "POST",
        body: {
          title: title.trim(),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(details.trim() ? { details: details.trim() } : {}),
          priority,
          ...(photoUrl ? { photoUrl } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hazards", serviceId] });
      qc.invalidateQueries({ queryKey: ["centre-day", serviceId] });
      toast({
        description:
          priority === "high" ? "Reported — your Coordinator has been told." : "Reported. Thanks for flagging it.",
      });
      onClose();
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  async function onPhoto(file: File) {
    setUploading(true);
    try {
      const r = await uploadFileSmart(file);
      setPhotoUrl(r.fileUrl);
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof Error ? e.message : "Couldn't upload that photo" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Report a hazard</DialogTitle>
        <DialogDescription>Anything broken, unsafe or needing repair.</DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length >= 3) report.mutate();
          }}
        >
          <label className="block text-sm font-medium text-foreground">
            What&rsquo;s wrong?
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Back gate latch doesn't catch"
              className="mt-1 block min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Where?
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Playground, kitchen, hall"
              className="mt-1 block min-h-12 w-full rounded-lg border border-border bg-card px-3 text-base"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-foreground">How urgent?</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["low", "medium", "high"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={priority === p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "min-h-12 rounded-xl border-2 text-sm font-semibold",
                    priority === p ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground",
                  )}
                >
                  {p === "high" ? "High — unsafe now" : PRIORITY[p].label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-foreground">
            More detail (optional)
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-border bg-card px-3 py-2 text-base"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {photoUrl ? "Change photo" : "Add a photo"}
            </Button>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- just-uploaded Blob photo
              <img src={photoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onPhoto(f);
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={title.trim().length < 3 || report.isPending || uploading}>
              {report.isPending ? "Sending…" : "Report it"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
