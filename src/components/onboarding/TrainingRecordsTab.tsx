"use client";

/**
 * The completed-training register — "who has completed what, and when?".
 *
 * Nothing answered that before. The compliance report queries
 * `status: { not: "completed" }` because it exists to show who is
 * BEHIND; the Assignments tab can filter to completed but shows the
 * assigned date rather than the completion date; and the only real
 * evidence — certificate and transcript PDFs — was reachable one person
 * at a time by drilling into a specific course.
 *
 * Person-first and COLLAPSED by default. A flat list of every completion
 * in the organisation is the wrong shape for the question actually being
 * asked, which is nearly always about a person: you scan for a name, then
 * open it. Expanding is where the detail lives — dates, scores, whether
 * it was finished after the due date.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/hooks/useToast";
import { fetchApi } from "@/lib/fetch-api";
import { exportToCsv } from "@/lib/csv-export";

interface TrainingRecord {
  enrollmentId: string;
  completedAt: string | null;
  dueDate: string | null;
  score: number | null;
  completedLate: boolean | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    service: { id: string; name: string } | null;
  };
  course: { id: string; title: string; track: string };
}

interface RecordsResponse {
  records: TrainingRecord[];
  summary: {
    completions: number;
    staff: number;
    courses: number;
    late: number;
    undated: number;
    averageScore: number | null;
    truncated: boolean;
  };
}

const TRACKS = [
  { value: "", label: "All training types" },
  { value: "essential", label: "Essential — induction" },
  { value: "monthly", label: "Monthly — refreshers" },
  { value: "library", label: "Library — optional" },
];

const field =
  "px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

/** Certificate + transcript downloads, generated client-side on demand. */
function RecordDownloads({ row }: { row: TrainingRecord }) {
  const [busy, setBusy] = useState<null | "cert" | "transcript">(null);

  async function certificate() {
    setBusy("cert");
    try {
      const { downloadCertificateSafe } = await import("@/lib/certificate-pdf");
      await downloadCertificateSafe({
        learnerName: row.user.name,
        courseTitle: row.course.title,
        completedAt: row.completedAt,
        score: row.score,
        reference: row.enrollmentId,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Couldn't build the certificate.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function transcript() {
    setBusy("transcript");
    try {
      const data = await fetchApi<{
        learnerName: string;
        learnerEmail: string | null;
        generatedAt: string;
        rows: import("@/lib/transcript-pdf").TranscriptRow[];
      }>(`/api/lms/transcript?userId=${row.user.id}`);
      const { downloadTranscript } = await import("@/lib/transcript-pdf");
      await downloadTranscript(data);
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Couldn't build the transcript.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={certificate}
        disabled={busy !== null}
        aria-label={`Download certificate for ${row.course.title}`}
        title="Certificate"
        className="rounded-lg p-2 text-muted hover:bg-surface hover:text-brand disabled:opacity-50"
      >
        {busy === "cert" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Award className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={transcript}
        disabled={busy !== null}
        aria-label={`Download full transcript for ${row.user.name}`}
        title="Full transcript"
        className="rounded-lg p-2 text-muted hover:bg-surface hover:text-brand disabled:opacity-50"
      >
        {busy === "transcript" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export function TrainingRecordsTab() {
  const [track, setTrack] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<RecordsResponse>({
    queryKey: ["lms", "training-records", track, serviceId, from, to],
    queryFn: () => {
      const p = new URLSearchParams();
      if (track) p.set("track", track);
      if (serviceId) p.set("serviceId", serviceId);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      return fetchApi(`/api/lms/training-records${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });

  const records = useMemo(() => data?.records ?? [], [data]);

  /**
   * Centre options come from the rows themselves, so the dropdown only
   * offers a filter with completions behind it. Built from the unfiltered
   * response so choosing a centre doesn't collapse the list of centres to
   * the one already chosen.
   */
  const serviceOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of records) {
      if (r.user.service) byId.set(r.user.service.id, r.user.service.name);
    }
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [records]);

  /** One entry per person, newest completion first inside each. */
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? records.filter(
          (r) =>
            r.user.name.toLowerCase().includes(q) ||
            r.user.email.toLowerCase().includes(q) ||
            r.course.title.toLowerCase().includes(q),
        )
      : records;

    const byUser = new Map<
      string,
      { user: TrainingRecord["user"]; items: TrainingRecord[] }
    >();
    for (const r of matched) {
      // Grouped by id, not name — two staff can share a name, and
      // collapsing them would file one person's training under another's.
      let g = byUser.get(r.user.id);
      if (!g) {
        g = { user: r.user, items: [] };
        byUser.set(r.user.id, g);
      }
      g.items.push(r);
    }
    return [...byUser.values()].sort((a, b) =>
      a.user.name.localeCompare(b.user.name),
    );
  }, [records, search]);

  const toggle = (userId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const exportCsv = () =>
    exportToCsv(
      "training-records",
      people.flatMap((p) => p.items),
      [
        { header: "Staff", accessor: (r) => r.user.name },
        { header: "Email", accessor: (r) => r.user.email },
        { header: "Role", accessor: (r) => r.user.role },
        { header: "Centre", accessor: (r) => r.user.service?.name ?? "" },
        { header: "Course", accessor: (r) => r.course.title },
        { header: "Type", accessor: (r) => r.course.track },
        {
          header: "Completed",
          accessor: (r) => (r.completedAt ? r.completedAt.slice(0, 10) : ""),
        },
        {
          header: "Due",
          accessor: (r) => (r.dueDate ? r.dueDate.slice(0, 10) : ""),
        },
        {
          header: "Score %",
          accessor: (r) => (typeof r.score === "number" ? Math.round(r.score) : ""),
        },
        {
          // Blank rather than "No" when it can't be known — an absent due
          // date is not evidence of being on time.
          header: "Late",
          accessor: (r) =>
            r.completedLate === null ? "" : r.completedLate ? "Yes" : "No",
        },
      ],
    );

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className={`${field} flex-1 min-w-[12rem]`}
          placeholder="Search staff or course…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search training records"
        />
        <select
          className={field}
          value={track}
          onChange={(e) => setTrack(e.target.value)}
          aria-label="Filter by training type"
        >
          {TRACKS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {serviceOptions.length > 1 && (
          <select
            className={field}
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            aria-label="Filter by centre"
          >
            <option value="">All centres</option>
            {serviceOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted">
          From
          <input
            type="date"
            className={field}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Completed on or after"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          To
          <input
            type="date"
            className={field}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Completed on or before"
          />
        </label>
      </div>

      {summary && summary.completions > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-sm text-foreground">
            <strong>{summary.completions}</strong>{" "}
            {summary.completions === 1 ? "completion" : "completions"} by{" "}
            <strong>{summary.staff}</strong>{" "}
            {summary.staff === 1 ? "person" : "people"} across{" "}
            <strong>{summary.courses}</strong>{" "}
            {summary.courses === 1 ? "course" : "courses"}
            {summary.averageScore !== null && (
              <> · average score {summary.averageScore}%</>
            )}
            {summary.late > 0 && (
              <> · {summary.late} finished after the due date</>
            )}
          </p>
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      )}

      {/* Undated rows are real completions with no timestamp — usually
          pre-dating the column. Saying so beats a date filter quietly
          returning fewer rows than the register shows. */}
      {summary && summary.undated > 0 && !from && !to && (
        <p className="text-2xs text-muted">
          {summary.undated}{" "}
          {summary.undated === 1 ? "completion has" : "completions have"} no
          recorded date and won&apos;t appear when you filter by period.
        </p>
      )}

      {summary?.truncated && (
        <p className="text-2xs text-muted">
          Showing the most recent 5,000 completions. Narrow the filters for a
          complete answer.
        </p>
      )}

      {people.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No completed training yet"
          description={
            records.length === 0
              ? "Once staff finish a course it will be recorded here, with the date and score."
              : "Nobody matches that search."
          }
        />
      ) : (
        <div className="space-y-2">
          {people.map(({ user, items }) => {
            const isOpen = open.has(user.id);
            const late = items.filter((i) => i.completedLate === true).length;
            const newest = items[0]?.completedAt ?? null;

            return (
              <div
                key={user.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => toggle(user.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {user.email}
                      {user.role ? ` · ${user.role}` : ""}
                      {user.service ? ` · ${user.service.name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {items.length}{" "}
                      <span className="font-normal text-muted">
                        completed
                      </span>
                    </p>
                    <p className="text-2xs text-muted">
                      {late > 0 ? `${late} late · ` : ""}
                      latest {fmtDate(newest)}
                    </p>
                  </div>
                </button>

                {isOpen && (
                  <ul className="divide-y divide-border border-t border-border">
                    {items.map((r) => (
                      <li
                        key={r.enrollmentId}
                        className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">
                            {r.course.title}
                          </p>
                          <p className="text-2xs text-muted">
                            {r.course.track} · completed{" "}
                            {fmtDate(r.completedAt)}
                            {typeof r.score === "number" && (
                              <> · {Math.round(r.score)}%</>
                            )}
                            {r.completedLate === true && (
                              <> · due {fmtDate(r.dueDate)}</>
                            )}
                          </p>
                        </div>
                        {r.completedLate === true && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-2xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                            late
                          </span>
                        )}
                        <RecordDownloads row={r} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
