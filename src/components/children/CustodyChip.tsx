"use client";

import { useState } from "react";
import { Shield, X, ExternalLink } from "lucide-react";

interface CustodyArrangements {
  type: "shared" | "sole" | "court_order" | "informal";
  primaryGuardian?: string;
  details?: string;
  courtOrderUrl?: string;
}

const TYPE_LABEL: Record<CustodyArrangements["type"], string> = {
  shared: "Shared custody",
  sole: "Sole custody",
  court_order: "Court order",
  informal: "Informal",
};

/// Severity colour: court_order gets a stronger amber to draw the eye.
const TYPE_TONE: Record<
  CustodyArrangements["type"],
  { chipBg: string; chipText: string }
> = {
  shared: { chipBg: "bg-blue-50", chipText: "text-blue-700" },
  sole: { chipBg: "bg-blue-50", chipText: "text-blue-700" },
  court_order: { chipBg: "bg-amber-100", chipText: "text-amber-800" },
  informal: { chipBg: "bg-blue-50", chipText: "text-blue-700" },
};

export function CustodyChip({
  custody,
  childName,
  compact = false,
}: {
  custody: CustodyArrangements | null | undefined;
  childName?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!custody) return null;

  const tone = TYPE_TONE[custody.type];
  const label = TYPE_LABEL[custody.type];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View custody arrangements${childName ? ` for ${childName}` : ""}`}
        className={`inline-flex items-center gap-1 ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"} rounded-full ${tone.chipBg} ${tone.chipText} font-semibold hover:brightness-95 transition`}
      >
        <Shield className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        {compact && custody.type !== "court_order" ? "Custody" : label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Custody arrangements"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card rounded-t-2xl sm:rounded-xl border border-border w-full sm:max-w-md p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-foreground inline-flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-600" />
                Custody arrangements
                {childName && (
                  <span className="text-muted font-normal text-sm">
                    — {childName}
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">
                  Type
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">{label}</dd>
              </div>
              {custody.primaryGuardian && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    Primary guardian
                  </dt>
                  <dd className="mt-0.5 text-foreground">
                    {custody.primaryGuardian}
                  </dd>
                </div>
              )}
              {custody.details && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    Details
                  </dt>
                  <dd className="mt-0.5 text-foreground whitespace-pre-wrap">
                    {custody.details}
                  </dd>
                </div>
              )}
              {custody.courtOrderUrl && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">
                    Court order
                  </dt>
                  <dd className="mt-0.5">
                    <a
                      href={custody.courtOrderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View document
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            <p className="text-xs text-muted mt-4">
              Confirm pickup against this arrangement before signing out.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
