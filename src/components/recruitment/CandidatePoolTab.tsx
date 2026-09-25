"use client";

/**
 * Hiring → Candidates: the casual staff pool.
 *
 * The list answers the question the pool exists for — "who can work this
 * session, near here, and are they cleared to start?" — so readiness and
 * availability are columns, not details behind a click. Filtering is
 * server-side (see /api/recruitment/candidates).
 */

import { useState } from "react";
import { UserPlus, Search, Star, Phone, Mail, FileText } from "lucide-react";
import {
  useCandidatePool,
  type PoolCandidate,
  type PoolFilters,
} from "@/hooks/useCandidatePool";
import {
  POOL_STAGES,
  POOL_STAGE_LABELS,
  POOL_SESSIONS,
  POOL_SESSION_LABELS,
  POOL_DAYS,
  POOL_DAY_LABELS,
  stageLabel,
  sourceLabel,
  poolReadiness,
  daysSinceContact,
  STALE_CONTACT_DAYS,
} from "@/lib/recruitment/pool";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { CandidatePoolPanel } from "./CandidatePoolPanel";
import { AddCandidateModal } from "./AddCandidateModal";
import { PoolLinkCopy } from "./PoolLinkCopy";

const QUALIFICATION_LABELS: Record<string, string> = {
  cert_iii: "Cert III",
  diploma: "Diploma",
  bachelor: "Bachelor",
  masters: "Masters",
  other: "Other",
};

function ReadinessPill({ c }: { c: PoolCandidate }) {
  const { status, reason } = poolReadiness({
    wwccNumber: c.wwccNumber,
    wwccExpiry: c.wwccExpiry,
    hasFirstAid: c.hasFirstAid,
  });
  const styles =
    status === "ready"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
      : status === "expiring"
        ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800"
        : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800";
  return (
    <span
      title={reason}
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded border text-2xs font-medium whitespace-nowrap",
        styles,
      )}
    >
      {reason}
    </span>
  );
}

function AvailabilityCells({ c }: { c: PoolCandidate }) {
  if (c.availableSessions.length === 0 && c.availableDays.length === 0) {
    return <span className="text-2xs text-muted">Not stated</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs text-foreground">
        {c.availableSessions.length > 0
          ? c.availableSessions
              .map((s) => POOL_SESSION_LABELS[s as keyof typeof POOL_SESSION_LABELS] ?? s)
              .join(" · ")
          : "Any session"}
      </span>
      <span className="text-2xs text-muted">
        {c.availableDays.length > 0
          ? c.availableDays
              .map((d) => POOL_DAY_LABELS[d as keyof typeof POOL_DAY_LABELS] ?? d)
              .join(" ")
          : "Any day"}
      </span>
    </div>
  );
}

function ContactAge({ c }: { c: PoolCandidate }) {
  const days = daysSinceContact(c.lastContactedAt);
  if (days === null) {
    return <span className="text-2xs text-amber-700 dark:text-amber-300">Never contacted</span>;
  }
  const stale = days >= STALE_CONTACT_DAYS;
  return (
    <span className={cn("text-2xs", stale ? "text-amber-700 dark:text-amber-300" : "text-muted")}>
      {days === 0 ? "Today" : `${days}d ago`}
    </span>
  );
}

export function CandidatePoolTab() {
  const [filters, setFilters] = useState<PoolFilters>({ scope: "active", sort: "recent" });
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading, error } = useCandidatePool(filters);
  const candidates = data?.items ?? [];

  function set<K extends keyof PoolFilters>(key: K, value: PoolFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-semibold tracking-tight text-foreground">
            Candidate pool
          </h2>
          <p className="text-sm text-muted mt-1">
            Everyone who has registered interest or applied — draw on them for
            cover, Holiday Quest, and new centres.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus className="w-4 h-4 mr-1.5" />
          Add candidate
        </Button>
      </div>

      {/* The link that feeds this list. Attribution can only be set at the
          point of advertising, so the link lives where the pool is read. */}
      <PoolLinkCopy />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <form
          className="relative flex-1 min-w-[200px]"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", search.trim());
          }}
        >
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => set("q", search.trim())}
            placeholder="Name, email, phone, suburb or postcode…"
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </form>

        <select
          aria-label="Stage"
          value={filters.stage ?? ""}
          onChange={(e) => set("stage", e.target.value)}
          className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-foreground"
        >
          <option value="">All stages</option>
          {POOL_STAGES.map((s) => (
            <option key={s} value={s}>{POOL_STAGE_LABELS[s]}</option>
          ))}
        </select>

        <select
          aria-label="Session"
          value={filters.session ?? ""}
          onChange={(e) => set("session", e.target.value)}
          className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-foreground"
        >
          <option value="">Any session</option>
          {POOL_SESSIONS.map((s) => (
            <option key={s} value={s}>{POOL_SESSION_LABELS[s]}</option>
          ))}
        </select>

        <select
          aria-label="Day"
          value={filters.day ?? ""}
          onChange={(e) => set("day", e.target.value)}
          className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-foreground"
        >
          <option value="">Any day</option>
          {POOL_DAYS.map((d) => (
            <option key={d} value={d}>{POOL_DAY_LABELS[d]}</option>
          ))}
        </select>

        <select
          aria-label="Sort"
          value={filters.sort ?? "recent"}
          onChange={(e) => set("sort", e.target.value as PoolFilters["sort"])}
          className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-foreground"
        >
          <option value="recent">Newest first</option>
          <option value="name">Name</option>
          <option value="rating">Highest rated</option>
          <option value="stale">Least recently contacted</option>
        </select>

        <select
          aria-label="Scope"
          value={filters.scope ?? "active"}
          onChange={(e) => set("scope", e.target.value as PoolFilters["scope"])}
          className="px-3 py-2 border border-border rounded-lg bg-card text-sm text-foreground"
        >
          <option value="active">Active pool</option>
          <option value="all">Everyone</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted">
          Couldn&apos;t load the candidate pool. {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <p className="text-sm text-foreground font-medium">No candidates yet</p>
          <p className="text-sm text-muted mt-1">
            People who register interest on the careers page land here
            automatically. You can also add someone manually.
          </p>
        </div>
      ) : (
        <>
          <p className="text-2xs text-muted">
            {data?.total ?? candidates.length} candidate
            {(data?.total ?? 0) === 1 ? "" : "s"}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-surface">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-muted">Name</th>
                  <th className="px-4 py-3 font-medium text-muted">Location</th>
                  <th className="px-4 py-3 font-medium text-muted">Qualification</th>
                  <th className="px-4 py-3 font-medium text-muted">Availability</th>
                  <th className="px-4 py-3 font-medium text-muted">Readiness</th>
                  <th className="px-4 py-3 font-medium text-muted">Stage</th>
                  <th className="px-4 py-3 font-medium text-muted">Contacted</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    className="border-t border-border hover:bg-surface cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        {c.name}
                        {c.rating ? (
                          <span className="inline-flex items-center gap-0.5 text-2xs text-amber-600 dark:text-amber-400">
                            <Star className="w-3 h-3 fill-current" />
                            {c.rating}
                          </span>
                        ) : null}
                        {c.resumeFileUrl ? (
                          <FileText className="w-3 h-3 text-muted" aria-label="Has résumé" />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 text-2xs text-muted mt-0.5">
                        {c.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />{c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />{c.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-2xs text-foreground">
                        {[c.suburb, c.postcode].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="text-2xs text-muted">
                        {c.preferredRegion ?? sourceLabel(c.source)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-2xs text-foreground">
                      {c.qualification
                        ? QUALIFICATION_LABELS[c.qualification] ?? c.qualification
                        : "None"}
                      {c.studying && (
                        <span className="block text-2xs text-muted">Studying</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><AvailabilityCells c={c} /></td>
                    <td className="px-4 py-3"><ReadinessPill c={c} /></td>
                    <td className="px-4 py-3 text-2xs text-foreground">{stageLabel(c.stage)}</td>
                    <td className="px-4 py-3"><ContactAge c={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openId && (
        <CandidatePoolPanel
          candidate={candidates.find((c) => c.id === openId) ?? null}
          onClose={() => setOpenId(null)}
        />
      )}
      {adding && <AddCandidateModal onClose={() => setAdding(false)} />}
    </div>
  );
}
