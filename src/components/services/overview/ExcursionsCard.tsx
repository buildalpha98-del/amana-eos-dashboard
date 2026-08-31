"use client";

/**
 * Excursions and incursions.
 *
 * The point of this card is one line per outing carrying the two numbers
 * a coordinator needs the night before: how many children are going, and
 * how many have been signed for. Plus whether the risk assessment exists
 * and whether anyone senior has actually read it — the thing that gets
 * asked for after something goes wrong.
 *
 * Creating an outing mints its permission form automatically, so nobody
 * has to remember to publish one; families see it in their portal under
 * Forms like any other signature request.
 */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { activeSessionKeys, roomLabel, type SessionTimes } from "@/lib/service-settings";

interface ExcursionRow {
  id: string;
  kind: string;
  title: string;
  destination: string | null;
  date: string;
  sessionType: string | null;
  programmeName: string | null;
  departTime: string | null;
  returnTime: string | null;
  transport: string | null;
  status: string;
  riskAssessmentUrl: string | null;
  riskAssessmentFileName: string | null;
  riskAssessmentReviewedAt: string | null;
  riskAssessmentReviewedBy: string | null;
  formId: string | null;
  signedCount: number;
  attendingCount: number | null;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const dateAU = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function ExcursionsCard({
  serviceId,
  sessionTimes,
  canEdit,
}: {
  serviceId: string;
  sessionTimes: SessionTimes | null | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const riskRef = useRef<HTMLInputElement>(null);

  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"excursion" | "incursion">("excursion");
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [sessionType, setSessionType] = useState("");
  const [departTime, setDepartTime] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [transport, setTransport] = useState("");
  const [riskUrl, setRiskUrl] = useState("");
  const [riskName, setRiskName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const key = ["service", serviceId, "excursions"];
  const { data } = useQuery<{ excursions: ExcursionRow[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/excursions`),
    retry: 1,
  });
  const rows = data?.excursions ?? [];

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/excursions`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["service", serviceId, "parent-forms"] });
      setCreating(false);
      setTitle("");
      setDestination("");
      setDate("");
      setSessionType("");
      setDepartTime("");
      setReturnTime("");
      setTransport("");
      setRiskUrl("");
      setRiskName("");
      toast({
        description:
          "Excursion added — families have a permission slip to sign.",
      });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      mutateApi(`/api/services/${serviceId}/excursions/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  async function upload(file: File, onDone: (url: string, name: string) => void) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/content-uploads", { method: "POST", body: form });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error || `Upload failed (${res.status})`);
      }
      const b = (await res.json()) as { url: string };
      onDone(b.url, file.name);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  }

  const upcoming = rows.filter((r) => r.status === "planned");
  const past = rows.filter((r) => r.status !== "planned");
  const programmes = activeSessionKeys(sessionTimes);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-brand" />
            Excursions &amp; incursions
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Each outing keeps its risk assessment and its permission slips
            together. Adding one sends families the slip automatically.
          </p>
        </div>
        {canEdit && !creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-3 w-3" /> New
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="flex gap-2">
            {(["excursion", "incursion"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                  kind === k
                    ? "bg-brand text-white"
                    : "border border-border text-muted"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="ex-title" className="block text-sm font-medium text-foreground mb-1">
              What is it?
            </label>
            <input
              id="ex-title"
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "excursion"
                  ? "e.g. Holiday Quest movie day"
                  : "e.g. Reptile show in the hall"
              }
            />
          </div>

          {kind === "excursion" && (
            <div>
              <label htmlFor="ex-dest" className="block text-sm font-medium text-foreground mb-1">
                Where are they going?
              </label>
              <input
                id="ex-dest"
                className={field}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Hoyts Broadway"
              />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="ex-date" className="block text-sm font-medium text-foreground mb-1">
                Date
              </label>
              <input
                id="ex-date"
                type="date"
                className={field}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ex-prog" className="block text-sm font-medium text-foreground mb-1">
                Programme
              </label>
              <select
                id="ex-prog"
                className={field}
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
              >
                <option value="">Choose…</option>
                {programmes.map((p) => (
                  <option key={p} value={p}>
                    {roomLabel(sessionTimes, p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ex-depart" className="block text-sm font-medium text-foreground mb-1">
                Leaves
              </label>
              <input
                id="ex-depart"
                type="time"
                className={field}
                value={departTime}
                onChange={(e) => setDepartTime(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ex-return" className="block text-sm font-medium text-foreground mb-1">
                Back by
              </label>
              <input
                id="ex-return"
                type="time"
                className={field}
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ex-transport" className="block text-sm font-medium text-foreground mb-1">
              Getting there <span className="text-muted">(optional)</span>
            </label>
            <input
              id="ex-transport"
              className={field}
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              placeholder="e.g. Walking, chartered bus"
            />
          </div>

          <div>
            {riskUrl ? (
              <p className="text-sm text-foreground flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-muted" />
                {riskName}
                <button
                  type="button"
                  onClick={() => {
                    setRiskUrl("");
                    setRiskName("");
                  }}
                  className="text-xs text-muted underline underline-offset-2 ml-1"
                >
                  remove
                </button>
              </p>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                Attach the risk assessment
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f)
                  void upload(f, (url, name) => {
                    setRiskUrl(url);
                    setRiskName(name);
                  });
              }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={() =>
                create.mutate({
                  kind,
                  title: title.trim(),
                  date,
                  ...(destination.trim() ? { destination: destination.trim() } : {}),
                  ...(sessionType ? { sessionType } : {}),
                  ...(departTime ? { departTime } : {}),
                  ...(returnTime ? { returnTime } : {}),
                  ...(transport.trim() ? { transport: transport.trim() } : {}),
                  ...(riskUrl
                    ? { riskAssessmentUrl: riskUrl, riskAssessmentFileName: riskName }
                    : {}),
                })
              }
              disabled={create.isPending || !title.trim() || !date}
            >
              {create.isPending ? "Adding…" : "Add and send permission slips"}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 && !creating ? (
        <p className="text-sm text-muted">
          Nothing planned. Excursions added here collect their own
          permissions and keep the risk assessment attached.
        </p>
      ) : (
        <div className="space-y-4">
          {[
            { label: "Coming up", items: upcoming },
            { label: "Past", items: past },
          ]
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.label}>
                <p className="text-xs font-medium text-muted mb-1">
                  {group.label}
                </p>
                <ul className="divide-y divide-border">
                  {group.items.map((e) => {
                    const outstanding =
                      e.attendingCount != null &&
                      e.signedCount < e.attendingCount;
                    return (
                      <li key={e.id} className="py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {e.title}
                            </p>
                            <p className="text-xs text-muted">
                              {dateAU(e.date)}
                              {e.programmeName && ` · ${e.programmeName}`}
                              {e.destination && ` · ${e.destination}`}
                              {e.departTime &&
                                e.returnTime &&
                                ` · ${e.departTime}–${e.returnTime}`}
                            </p>
                          </div>
                          {e.status !== "planned" && (
                            <span className="text-2xs text-muted capitalize shrink-0">
                              {e.status}
                            </span>
                          )}
                        </div>

                        {/* The two numbers, on one line. */}
                        <p
                          className={`text-xs ${
                            outstanding
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-muted"
                          }`}
                        >
                          {e.formId ? (
                            e.attendingCount != null ? (
                              <>
                                {e.signedCount} of {e.attendingCount} signed
                                {outstanding &&
                                  ` — ${e.attendingCount - e.signedCount} still to come`}
                              </>
                            ) : (
                              `${e.signedCount} signed`
                            )
                          ) : (
                            "No permission slip for this one"
                          )}
                        </p>

                        {/* Risk assessment: exists, and has it been read. */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {e.riskAssessmentUrl ? (
                            <>
                              <a
                                href={e.riskAssessmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-brand underline underline-offset-2"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Risk assessment
                              </a>
                              {e.riskAssessmentReviewedAt ? (
                                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Reviewed
                                  {e.riskAssessmentReviewedBy &&
                                    ` by ${e.riskAssessmentReviewedBy}`}
                                </span>
                              ) : canEdit ? (
                                <button
                                  type="button"
                                  disabled={busyId === e.id}
                                  onClick={() => {
                                    setBusyId(e.id);
                                    patch.mutate(
                                      { id: e.id, body: { reviewRiskAssessment: true } },
                                      { onSettled: () => setBusyId(null) },
                                    );
                                  }}
                                  className="rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:bg-surface"
                                >
                                  {busyId === e.id ? "Signing…" : "Mark as reviewed"}
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Not yet reviewed
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              No risk assessment attached
                              {canEdit && (
                                <>
                                  {" · "}
                                  <button
                                    type="button"
                                    onClick={() => riskRef.current?.click()}
                                    className="underline underline-offset-2"
                                    data-excursion={e.id}
                                    onFocus={() => setBusyId(e.id)}
                                    onMouseEnter={() => setBusyId(e.id)}
                                  >
                                    attach one
                                  </button>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}

      <input
        ref={riskRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          const target = busyId;
          if (f && target)
            void upload(f, (url, name) =>
              patch.mutate({
                id: target,
                body: { riskAssessmentUrl: url, riskAssessmentFileName: name },
              }),
            );
        }}
      />
    </div>
  );
}
