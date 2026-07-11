"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  GraduationCap,
  CheckCircle2,
  Circle,
  PlayCircle,
  AlertTriangle,
  ShieldCheck,
  Clock,
  ArrowRight,
  Award,
  Loader2,
} from "lucide-react";
import { useMyEnrollments } from "@/hooks/useLMS";
import { useInductionReadiness } from "@/hooks/useInduction";
import { Skeleton } from "@/components/ui/Skeleton";

type Enrollment = {
  id: string;
  status: "enrolled" | "in_progress" | "completed" | "expired";
  dueDate: string | null;
  completedAt?: string | null;
  score?: number | null;
  course: {
    id: string;
    title: string;
    description: string | null;
    track?: "essential" | "monthly" | "library";
    sortOrder?: number;
    modules: { id: string }[];
  };
};

const bySortOrder = (a: Enrollment, b: Enrollment) =>
  (a.course.sortOrder ?? 0) - (b.course.sortOrder ?? 0);

function statusIcon(status: string) {
  if (status === "completed") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (status === "in_progress") return <PlayCircle className="h-5 w-5 text-brand" />;
  return <Circle className="h-5 w-5 text-muted" />;
}

function CourseCard({ e, learnerName }: { e: Enrollment; learnerName: string }) {
  const done = e.status === "completed";
  const [downloading, setDownloading] = useState(false);

  async function handleCertificate() {
    setDownloading(true);
    try {
      const { downloadCertificateSafe } = await import("@/lib/certificate-pdf");
      await downloadCertificateSafe({
        learnerName,
        courseTitle: e.course.title,
        completedAt: e.completedAt ?? null,
        score: e.score ?? null,
        reference: e.id,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface/50 p-4">
      <div className="shrink-0">{statusIcon(e.status)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{e.course.title}</p>
        {e.course.description && (
          <p className="truncate text-xs text-muted">{e.course.description}</p>
        )}
        <p className="mt-0.5 text-xs text-muted">
          {e.course.modules.length} section{e.course.modules.length === 1 ? "" : "s"}
          {e.dueDate && !done ? ` · due ${new Date(e.dueDate).toLocaleDateString()}` : ""}
        </p>
      </div>
      {done && (
        <button
          onClick={handleCertificate}
          disabled={downloading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface disabled:opacity-60"
          title="Download certificate of completion"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
          {/* Icon-only on phones so the title keeps breathing room. */}
          <span className="hidden sm:inline">Certificate</span>
        </button>
      )}
      <a
        href={`/learn/${e.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold ${
          done
            ? "border border-border text-foreground hover:bg-surface"
            : "bg-brand text-white hover:bg-brand-hover"
        }`}
      >
        {done ? "Review" : e.status === "in_progress" ? "Continue" : "Start"}
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}

export function MyTrainingContent() {
  const { data: session } = useSession();
  const learnerName = session?.user?.name ?? "Staff Member";
  const { data: readiness, isLoading: rLoading } = useInductionReadiness();
  const { data: enrollments, isLoading: eLoading } = useMyEnrollments();

  if (rLoading || eLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const all = (enrollments ?? []) as unknown as Enrollment[];
  const essential = all.filter((e) => e.course.track === "essential").sort(bySortOrder);
  const monthly = all.filter((e) => e.course.track === "monthly").sort(bySortOrder);
  const other = all
    .filter((e) => e.course.track !== "essential" && e.course.track !== "monthly")
    .sort(bySortOrder);

  const status = readiness?.status ?? "cleared";
  const inInduction = status === "new_starter" || status === "in_training" || status === "awaiting_signoff";
  const essentialDone = essential.filter((e) => e.status === "completed").length;

  return (
    <div className="space-y-8">
      {/* Induction banner for new starters */}
      {inInduction && (
        <section className="rounded-2xl border border-brand/30 bg-brand/5 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-brand/10 p-3">
              <GraduationCap className="h-7 w-7 text-brand" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">
                {status === "awaiting_signoff"
                  ? "Almost there — awaiting your practical sign-off"
                  : "Welcome to Amana — let's get you ready for day one"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {status === "awaiting_signoff"
                  ? "You've finished the essential training. A State Manager or Admin will observe and sign off your week-1 practical, then you're cleared to work."
                  : "Complete the essential training below before your first shift. It covers OWNA, our policies, and how we do things at Amana."}
              </p>

              {/* Progress */}
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>Essential training</span>
                  <span>
                    {essentialDone}/{essential.length} complete
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{
                      width: `${essential.length ? Math.round((essentialDone / essential.length) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Blockers */}
              {readiness && readiness.blockers.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {readiness.blockers.map((b) => (
                    <li key={b.kind} className="flex items-center gap-2 text-sm text-foreground">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span>{b.label}</span>
                      <Link href={b.href} className="text-brand hover:underline">
                        Fix
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {readiness?.ready && status === "awaiting_signoff" && (
                <p className="mt-4 flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                  <ShieldCheck className="h-4 w-4" />
                  All requirements met — waiting on your practical sign-off.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Essential courses */}
      {essential.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Essential training
          </h3>
          <div className="space-y-3">
            {essential.map((e) => (
              <CourseCard key={e.id} e={e} learnerName={learnerName} />
            ))}
          </div>
        </section>
      )}

      {/* This month's training */}
      {monthly.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <Clock className="h-4 w-4" />
            This month&apos;s training
          </h3>
          <div className="space-y-3">
            {monthly.map((e) => (
              <CourseCard key={e.id} e={e} learnerName={learnerName} />
            ))}
          </div>
        </section>
      )}

      {/* Other / library courses */}
      {other.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Other courses
          </h3>
          <div className="space-y-3">
            {other.map((e) => (
              <CourseCard key={e.id} e={e} learnerName={learnerName} />
            ))}
          </div>
        </section>
      )}

      {all.length === 0 && (
        <div className="rounded-xl border border-border bg-surface/50 p-10 text-center text-muted">
          You have no training assigned right now. Nice work — you&apos;re all caught up.
        </div>
      )}
    </div>
  );
}
