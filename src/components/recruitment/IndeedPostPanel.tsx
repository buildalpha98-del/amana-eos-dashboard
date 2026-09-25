"use client";

/**
 * "Post to Indeed" — the copy-paste kit for getting a vacancy onto Indeed and
 * the applicants back into the pool.
 *
 * Indeed has no self-serve API (see src/lib/recruitment/indeed-ad.ts for the
 * detail), so the ad itself is posted by hand. The one thing that DOES connect
 * the two systems is the apply link: point Indeed's "apply on company website"
 * field at the URL below and every applicant lands in the pool tagged Indeed,
 * with their availability and WWCC already captured.
 *
 * The warnings matter as much as the fields. An ad whose apply link 404s
 * because the vacancy was never published, or whose pay line still reads
 * "[PAY RATE — e.g. $30–$35 per hour]", costs real applicants — and you only
 * find out days later when nobody has applied.
 */
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, AlertTriangle } from "lucide-react";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { useOrigin } from "@/hooks/useOrigin";
import {
  buildIndeedAd,
  formatIndeedAd,
  type IndeedAdVacancy,
} from "@/lib/recruitment/indeed-ad";

function CopyRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        variant: "destructive",
        description: "Couldn't copy — select the text and copy it manually.",
      });
    }
  };

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <span className="text-2xs uppercase tracking-wide text-muted">
          {label}
        </span>
        {multiline ? (
          <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface p-3 font-sans text-xs text-foreground/90">
            {value || "—"}
          </pre>
        ) : (
          <p className="mt-0.5 truncate text-sm text-foreground">
            {value || "—"}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={copy}
        disabled={!value}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="mt-4 shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-40"
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export function IndeedPostPanel({ vacancy }: { vacancy: IndeedAdVacancy }) {
  // Empty until the client renders — see useOrigin for why it isn't hard-coded.
  const origin = useOrigin();

  const ad = useMemo(() => buildIndeedAd(vacancy, origin), [vacancy, origin]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(formatIndeedAd(ad));
      toast({ description: "Ad copied — paste it into Indeed field by field." });
    } catch {
      toast({
        variant: "destructive",
        description: "Couldn't copy — select the text and copy it manually.",
      });
    }
  };

  return (
    <CollapsibleSection
      title="Post to Indeed"
      description="Copy the ad across, then paste the apply link so applicants land in your pool"
    >
      <div className="space-y-4">
        {ad.blockers.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-medium">Fix before you post:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {ad.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {ad.placeholders.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-medium">
                The ad still has {ad.placeholders.length} blank
                {ad.placeholders.length === 1 ? "" : "s"} to fill in:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {ad.placeholders.map((p) => (
                  <li key={p} className="font-mono">
                    {p}
                  </li>
                ))}
              </ul>
              <p className="mt-1">
                Edit the vacancy Notes — they are the ad copy, on Indeed and on
                our own careers page.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <CopyRow label="Job title" value={ad.title} />
          <CopyRow label="Company" value={ad.company} />
          <CopyRow label="Location" value={ad.location} />
          <CopyRow label="Job type" value={ad.jobType} />
          <CopyRow label="Apply on company website" value={ad.applyUrl} />
          <CopyRow label="Description" value={ad.description} multiline />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <Button size="sm" onClick={copyAll} disabled={!origin}>
            Copy everything
          </Button>
          {ad.applyUrl && (
            <a
              href={ad.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
            >
              Preview the apply page
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        <p className="text-xs text-muted">
          Set Indeed&apos;s application method to &ldquo;apply on company
          website&rdquo; and paste the link above. Anyone who applies through it
          appears under Candidates, tagged <strong>Indeed</strong>, with their
          availability, WWCC and right to work already captured.
        </p>
      </div>
    </CollapsibleSection>
  );
}
