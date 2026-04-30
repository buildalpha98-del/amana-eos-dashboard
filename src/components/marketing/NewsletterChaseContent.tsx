"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { useChaseCurrent, useMarkChaseSent, type ChaseDraftView } from "@/hooks/useNewsletterChase";
import { Check, Copy } from "lucide-react";
import { toast } from "@/hooks/useToast";

interface ParsedEntry {
  serviceId: string;
  serviceName: string;
  schoolName: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  body: string;
  alreadySent: boolean;
}

function parseEntries(draft: ChaseDraftView): ParsedEntry[] {
  // Split the bundled body on the "## " centre headers and pair with metadata.
  const sections = draft.content.split(/\n## /).slice(1);
  const parsed: ParsedEntry[] = [];

  for (const section of sections) {
    const lines = section.split("\n");
    const headerLine = lines[0]?.trim() ?? "";
    const arrowSplit = headerLine.split(" → ");
    const serviceName = (arrowSplit[0] ?? "").trim();
    const schoolName = (arrowSplit[1] ?? "").trim();

    const toLine = lines.find((l) => l.startsWith("To: ")) ?? "";
    const subjectLine = lines.find((l) => l.startsWith("Subject: ")) ?? "";

    const contactMatch = toLine.match(/^To: (.+?) <(.+)>$/);
    const contactName = contactMatch?.[1] ?? "";
    const contactEmail = contactMatch?.[2] ?? "";
    const subject = subjectLine.replace(/^Subject: /, "").trim();

    const subjectIdx = lines.findIndex((l) => l.startsWith("Subject: "));
    const dividerIdx = lines.findIndex((l, i) => i > subjectIdx && l.trim() === "---");
    const bodyEndIdx = dividerIdx === -1 ? lines.length : dividerIdx;
    const body = lines.slice(subjectIdx + 2, bodyEndIdx).join("\n").trim();

    const meta = draft.entries.find((e) => e.serviceName === serviceName);
    if (!meta) continue;
    parsed.push({
      serviceId: meta.serviceId,
      serviceName,
      schoolName,
      contactName,
      contactEmail,
      subject,
      body,
      alreadySent: !!meta.alreadySent,
    });
  }
  return parsed;
}

export default function NewsletterChaseContent() {
  const { data, isLoading, isError, error, refetch } = useChaseCurrent();
  const markSent = useMarkChaseSent();
  const [openId, setOpenId] = useState<string | null>(null);

  const draft = data?.draft;
  const entries = useMemo<ParsedEntry[]>(() => {
    if (!draft) return [];
    return parseEntries(draft);
  }, [draft]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Newsletter Chase"
        description="Pre-drafted emails for next-term newsletter placements. Send each manually, then click Mark sent."
      />

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Couldn't load chase data"
          error={error ?? undefined}
          onRetry={() => refetch()}
        />
      )}

      {data && !data.draft && (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
          No active chase draft. The cron creates one automatically in the last 1–2 weeks of each term.
          {data.eligibility.weeksUntilTermEnd !== null && (
            <div className="mt-1 text-xs">
              Term {data.eligibility.currentTerm?.number} ends in {data.eligibility.weeksUntilTermEnd} week(s).
              {data.eligibility.eligible ? " Trigger the cron to draft now." : " Outside the chase window."}
            </div>
          )}
        </div>
      )}

      {data?.draft && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <header>
            <h3 className="text-sm font-semibold">{data.draft.title}</h3>
            <p className="text-xs text-muted">
              Drafted {new Date(data.draft.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}.
              Send each email manually from your inbox, then mark it sent here so the cron skips it next run.
            </p>
          </header>

          <ul className="space-y-2">
            {entries.length === 0 && (
              <li className="text-xs text-muted">No centres need chasing this period — all booked.</li>
            )}
            {entries.map((entry) => {
              const open = openId === entry.serviceId;
              const sent = entry.alreadySent;
              return (
                <li
                  key={entry.serviceId}
                  className={`rounded-md border p-3 text-sm ${sent ? "border-green-200 bg-green-50" : "border-border bg-surface"}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-medium text-foreground">
                        {entry.serviceName} → {entry.schoolName}
                      </div>
                      <div className="text-xs text-muted">
                        {entry.contactName} &lt;{entry.contactEmail}&gt;
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setOpenId(open ? null : entry.serviceId)}
                      >
                        {open ? "Hide email" : "View email"}
                      </Button>
                      {sent ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                          Sent
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          iconLeft={<Check className="w-4 h-4" />}
                          loading={markSent.isPending}
                          onClick={async () => {
                            try {
                              await markSent.mutateAsync({
                                serviceId: entry.serviceId,
                                subject: entry.subject,
                                body: entry.body,
                                contactName: entry.contactName || undefined,
                                contactEmail: entry.contactEmail.includes("@") ? entry.contactEmail : undefined,
                                termYear: data.draft?.metadata.nextTerm?.year,
                                termNumber: data.draft?.metadata.nextTerm?.number,
                              });
                              toast({ description: `Marked sent for ${entry.serviceName}` });
                            } catch {
                              // hook toast
                            }
                          }}
                        >
                          Mark sent
                        </Button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs">
                        <span className="text-muted">Subject:</span> <span className="font-medium">{entry.subject}</span>
                      </div>
                      <pre className="whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-xs">
{entry.body}
                      </pre>
                      <Button
                        size="sm"
                        variant="secondary"
                        iconLeft={<Copy className="w-4 h-4" />}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(`Subject: ${entry.subject}\n\n${entry.body}`);
                            toast({ description: "Email copied to clipboard" });
                          } catch {
                            toast({ variant: "destructive", description: "Could not copy" });
                          }
                        }}
                      >
                        Copy email
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
