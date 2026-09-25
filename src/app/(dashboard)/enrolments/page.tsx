"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Download,
  Search,
  Baby,
  User,
  Calendar,
  UserPlus,
  Users,
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react";
import {
  useEnrolments,
  fetchAllEnrolments,
  ENROLMENTS_PAGE_SIZE,
  type EnrolmentSubmission,
} from "@/hooks/useEnrolments";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEnrolmentApplications } from "@/hooks/useEnrolmentApplications";
import { EnrolmentDetailPanel } from "@/components/enrolments/EnrolmentDetailPanel";
import { SiblingEnrolmentInbox } from "@/components/enrolments/SiblingEnrolmentInbox";
import { BackfillServiceDialog } from "@/components/enrolments/BackfillServiceDialog";
import { BackfillBookingGridDialog } from "@/components/enrolments/BackfillBookingGridDialog";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCsv } from "@/lib/csv-export";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Reviewing" },
  { key: "processed", label: "Confirmed" },
  { key: "needs_info", label: "Needs Info" },
  { key: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  submitted: { label: "Submitted", color: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" },
  under_review: { label: "Reviewing", color: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" },
  processed: { label: "Confirmed", color: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300" },
  needs_info: { label: "Needs Info", color: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300" },
  archived: { label: "Archived", color: "bg-surface text-muted" },
};

export default function EnrolmentsPage() {
  const router = useRouter();
  const [view, setView] = useState<"submissions" | "sibling">("submissions");
  const [activeTab, setActiveTab] = useState("all");
  const [showBackfill, setShowBackfill] = useState(false);
  const [showGridBackfill, setShowGridBackfill] = useState(false);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Search hits the server now, so it waits for a pause in typing.
  const debouncedSearch = useDebouncedValue(search, 300);
  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useEnrolments(activeTab, debouncedSearch);
  const { data: siblingData } = useEnrolmentApplications("pending");

  const pages = data?.pages ?? [];
  /*
   * Every page loaded so far. The server has already applied the status tab
   * and the search, so there is nothing left to filter here — and filtering
   * here is exactly what used to hide every submission past the first 100.
   *
   * Deduped because paging is offset-based: a submission arriving between two
   * "Load more" clicks shifts the window, and the same row can land in both
   * pages. Rendering it twice is a duplicate React key, not just a repeat.
   */
  const submissions = Array.from(
    new Map(
      pages.flatMap((p) => p.submissions).map((s) => [s.id, s]),
    ).values(),
  );
  const total = pages[0]?.total ?? 0;
  const counts = pages[0]?.counts ?? {};
  const unplaced = pages[0]?.unplaced ?? 0;
  const searchPending = search.trim() !== debouncedSearch.trim();

  const handleExport = async () => {
    setExporting(true);
    try {
      // Walks every page rather than writing out the rows on screen — a
      // truncated CSV is worse than none when it is being reconciled to OWNA.
      const rows = await fetchAllEnrolments(activeTab, debouncedSearch);
      exportToCsv(
        `amana-enrolments-${new Date().toISOString().slice(0, 10)}`,
        rows,
        [
          { header: "ID", accessor: (s) => s.id },
          { header: "Parent First Name", accessor: (s) => s.primaryParent.firstName },
          { header: "Parent Surname", accessor: (s) => s.primaryParent.surname },
          { header: "Email", accessor: (s) => s.primaryParent.email ?? "" },
          { header: "Mobile", accessor: (s) => s.primaryParent.mobile ?? "" },
          { header: "Children", accessor: (s) => s.children.map((c) => `${c.firstName} ${c.surname}`).join("; ") },
          { header: "Status", accessor: (s) => s.status },
          { header: "Referral Source", accessor: (s) => s.referralSource ?? "" },
          { header: "Submitted", accessor: (s) => new Date(s.createdAt).toLocaleDateString("en-AU") },
        ],
      );
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Couldn't build the export.",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      data-v2="staff"
      className="space-y-6"
    >
      {/* Header */}
      <PageHeader
        title="Enrolments"
        description="Review and process parent enrolment submissions"
        secondaryActions={[
          // 2026-07-12 (nav fold): Children left the sidebar — browsing
          // enrolled children is the other half of this lifecycle.
          { label: "Children", icon: Users, onClick: () => router.push("/children") },
          // A waitlist entry is a ParentEnquiry at stage "waitlisted" — an
          // enrolment worked to that stage is owned by /waitlist next, but
          // there was no route into it from here.
          { label: "Waitlist", icon: Clock, onClick: () => router.push("/waitlist") },
        ]}
      >
        <ExportButton
          onClick={handleExport}
          label={exporting ? "Exporting…" : "Export"}
          disabled={exporting || total === 0}
        />
      </PageHeader>

      {/* View Toggle */}
      <div className="flex gap-1 bg-surface rounded-xl p-1 w-fit">
        <button
          onClick={() => setView("submissions")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            view === "submissions"
              ? "bg-background text-foreground shadow-sm"
              : "text-foreground/50 hover:text-foreground"
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Submissions
        </button>
        <button
          onClick={() => setView("sibling")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            view === "sibling"
              ? "bg-background text-foreground shadow-sm"
              : "text-foreground/50 hover:text-foreground"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          Sibling Applications
          {(siblingData?.total ?? 0) > 0 && (
            <span className="px-1.5 py-0.5 text-2xs font-bold rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
              {siblingData?.total}
            </span>
          )}
        </button>
      </div>

      {view === "sibling" ? (
        <SiblingEnrolmentInbox />
      ) : (
      <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", count: counts.all ?? 0, color: "text-brand" },
          { label: "Pending Review", count: counts.submitted ?? 0, color: "text-blue-600" },
          { label: "In Review", count: counts.under_review ?? 0, color: "text-amber-600" },
          { label: "Confirmed", count: counts.processed ?? 0, color: "text-green-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background border border-border rounded-xl p-4">
            <p className="text-xs text-foreground/50">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
          </div>
        ))}
      </div>

      {unplaced > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
            <strong>{unplaced}</strong>{" "}
            {unplaced === 1 ? "enrolment isn't" : "enrolments aren't"} linked to
            a service — those children don&apos;t appear on any roll or invoice.
          </p>
          <button
            onClick={() => setShowBackfill(true)}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors whitespace-nowrap"
          >
            Match to services
          </button>
        </div>
      )}

      {/*
        Sits under the stats rather than behind a banner: unlike unplaced
        enrolments there's no cheap count to gate it on, and the scan
        itself reports "nothing to do" when the backlog is cleared.
      */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowGridBackfill(true)}
          className="text-xs font-medium text-foreground/50 hover:text-foreground transition-colors"
        >
          Recover booking preferences
        </button>
      </div>

      <BackfillServiceDialog open={showBackfill} onOpenChange={setShowBackfill} />
      <BackfillBookingGridDialog
        open={showGridBackfill}
        onOpenChange={setShowGridBackfill}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-surface rounded-xl p-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {tab.label}
              {(counts[tab.key] ?? 0) > 0 && (
                <span className="ml-1.5 text-foreground/30">
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search every enrolment..."
            aria-label="Search enrolments"
            className="w-full pl-9 pr-9 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          {(searchPending || (isFetching && !isFetchingNextPage)) && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-foreground/30" />
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <div className="bg-background border border-border rounded-xl p-12 text-center">
          <ClipboardList className="h-12 w-12 text-foreground/20 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No Enrolments</h3>
          <p className="text-sm text-foreground/50">
            {debouncedSearch.trim()
              ? `Nothing matches "${debouncedSearch.trim()}" — this searches every submission, not just the ones on screen.`
              : "Enrolment submissions will appear here when parents complete the form."}
          </p>
        </div>
      ) : (
        <>
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 bg-surface/50 text-xs font-medium text-foreground/50 border-b border-border">
            <div className="col-span-3">Parent</div>
            <div className="col-span-3">Children</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {submissions.map((s) => (
            <EnrolmentRow key={s.id} submission={s} onClick={() => setSelectedId(s.id)} />
          ))}
        </div>

        {/*
          Says what is on screen and what is not. The old list showed the
          newest 100 with nothing to indicate there was more, so "it doesn't
          show older enrolments" was indistinguishable from "they are gone".
        */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-foreground/50">
            Showing {submissions.length} of {total}
            {debouncedSearch.trim() ? " matching" : ""}
            {total === 1 ? " enrolment" : " enrolments"}
          </p>
          {hasNextPage && (
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage
                ? "Loading…"
                : `Load ${Math.max(1, Math.min(ENROLMENTS_PAGE_SIZE, total - submissions.length))} more`}
            </Button>
          )}
        </div>
        </>
      )}

      {/* Detail panel */}
      {selectedId && (
        <EnrolmentDetailPanel
          enrolmentId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
      </>
      )}
    </div>
  );
}

function EnrolmentRow({
  submission: s,
  onClick,
}: {
  submission: EnrolmentSubmission;
  onClick: () => void;
}) {
  const pp = s.primaryParent;
  const childNames = s.children.map((c) => c.firstName).join(", ");
  const badge = STATUS_BADGE[s.status] || STATUS_BADGE.submitted;

  return (
    <button
      onClick={onClick}
      className="w-full grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3.5 text-left border-b border-border last:border-b-0 hover:bg-surface/30 transition-colors"
    >
      {/* Parent */}
      <div className="sm:col-span-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {pp.firstName} {pp.surname}
            </p>
            <p className="text-xs text-foreground/50 truncate">{pp.email}</p>
          </div>
        </div>
      </div>

      {/* Children */}
      <div className="sm:col-span-3 flex items-center gap-1.5">
        <Baby className="h-3.5 w-3.5 text-foreground/30 shrink-0 hidden sm:block" />
        <span className="text-sm text-foreground/70 truncate">
          {childNames}
          {s.children.length > 1 && (
            <span className="text-foreground/40 ml-1">({s.children.length})</span>
          )}
        </span>
      </div>

      {/* Date */}
      <div className="sm:col-span-2 flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-foreground/30 shrink-0 hidden sm:block" />
        <span className="text-xs text-foreground/50">
          {new Date(s.createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>

      {/* Status */}
      <div className="sm:col-span-2 flex items-center gap-1.5 flex-wrap">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
          {badge.label}
        </span>
        {/*
          An enrolment with no service has children on no roll and no
          invoices. It looks perfectly healthy in this list otherwise, so
          it needs to say so here — open it and use "Assign to service".
        */}
        {!s.serviceId && (
          <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
            No service
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="sm:col-span-2 flex items-center justify-end">
        <a
          href={`/api/enrolments/${s.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-2 py-1 text-xs text-brand hover:bg-brand/5 rounded-lg transition-colors"
        >
          <Download className="h-3 w-3" />
          PDF
        </a>
      </div>
    </button>
  );
}
