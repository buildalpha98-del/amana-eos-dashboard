"use client";

/**
 * The pool's shareable front-door link, with the channel baked in.
 *
 * Not every ad is a vacancy. Most casual advertising is standing — "educators
 * wanted across Eastern Melbourne" on Indeed, a flyer at the mosque, a post in
 * a university group — and all of it should land in the same pool. This copies
 * /careers/register with the right `?src=`, so three months later the funnel
 * can say which of those channels actually produced the people we hired.
 *
 * Pick the channel BEFORE copying: the link is the only place attribution can
 * come from, and nobody goes back to correct a source by hand.
 */
import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import {
  POOL_SOURCES,
  POOL_SOURCE_LABELS,
  type PoolSource,
} from "@/lib/recruitment/pool";
import { trackedRegisterUrl } from "@/lib/recruitment/indeed-ad";
import { toast } from "@/hooks/useToast";
import { useOrigin } from "@/hooks/useOrigin";

/** Channels you'd actually advertise through — the rest describe how someone
 *  reached us in person, and a link can't come from a walk-in. */
const SHAREABLE_SOURCES: PoolSource[] = POOL_SOURCES.filter(
  (s): s is PoolSource => s !== "walkin" && s !== "referral",
);

export function PoolLinkCopy() {
  const [source, setSource] = useState<PoolSource>("indeed");
  const [copied, setCopied] = useState(false);
  // Empty on the server, so a preview deployment hands out preview links
  // rather than production ones.
  const origin = useOrigin();

  const url = origin ? trackedRegisterUrl(origin, source) : "";

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({
        description: `${POOL_SOURCE_LABELS[source]} link copied — anyone who registers through it is tagged ${POOL_SOURCE_LABELS[source]}.`,
      });
    } catch {
      toast({
        variant: "destructive",
        description: "Couldn't copy — select the link and copy it manually.",
      });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/40 px-3 py-2">
      <Link2 className="h-4 w-4 shrink-0 text-muted" />
      <span className="text-xs text-muted">Advertising somewhere? Link to</span>
      <select
        aria-label="Advertising channel"
        value={source}
        onChange={(e) => setSource(e.target.value as PoolSource)}
        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {SHAREABLE_SOURCES.map((s) => (
          <option key={s} value={s}>
            {POOL_SOURCE_LABELS[s]}
          </option>
        ))}
      </select>
      <code className="min-w-0 flex-1 truncate text-xs text-foreground/80">
        {url || "…"}
      </code>
      <button
        type="button"
        onClick={copy}
        disabled={!url}
        aria-label="Copy registration link"
        className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-card hover:text-foreground disabled:opacity-40"
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
