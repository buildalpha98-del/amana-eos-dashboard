/**
 * Renders a CockpitSummary snapshot as a markdown body that becomes the
 * draft of the weekly marketing report. Akram edits this body in the
 * review screen before sending.
 */

import type { CockpitSummary } from "@/lib/cockpit/summary";

function ragIcon(status: "green" | "amber" | "red"): string {
  return status === "green" ? "🟢" : status === "amber" ? "🟡" : "🔴";
}

function line(label: string, m: { current: number; target: number; status: "green" | "amber" | "red" }): string {
  return `- ${ragIcon(m.status)} **${label}** — ${m.current} / ${m.target}`;
}

export function renderWeeklyReportMarkdown(snapshot: CockpitSummary): string {
  const t = snapshot.tiles;
  const rows: string[] = [];

  rows.push(`# Weekly Marketing Report`);
  rows.push(`**Week:** ${snapshot.weekStart.slice(0, 10)} → ${snapshot.weekEnd.slice(0, 10)}`);
  rows.push(`**Term:** ${snapshot.term.year} — Term ${snapshot.term.term}`);
  rows.push("");

  rows.push(`## Brand & Social`);
  rows.push(line("Feed posts", t.brandSocial.feed));
  rows.push(line("Stories", t.brandSocial.stories));
  rows.push(line("Reels", t.brandSocial.reels));
  rows.push(
    `- ${ragIcon(t.brandSocial.ctaCompliance.status)} **CTA compliance** — ${Math.round(
      t.brandSocial.ctaCompliance.current * 100,
    )}%`,
  );
  rows.push("");

  rows.push(`## Content Team`);
  rows.push(line("Hires", t.contentTeam.hires));
  rows.push(
    `- ${ragIcon(t.contentTeam.briefs24h.status)} **Briefs approved <24hr** — ${Math.round(
      t.contentTeam.briefs24h.current * 100,
    )}%`,
  );
  rows.push(`- Claude drafts this week: ${t.contentTeam.claudeThisWeek ? "✅" : "⚠️ none"}`);
  rows.push("");

  rows.push(`## School Liaison`);
  rows.push(line("Term placements", t.schoolLiaison.termPlacements));
  const weakCentres = t.schoolLiaison.perCentre.filter((c) => c.status !== "green");
  if (weakCentres.length > 0) {
    rows.push(`Centres needing attention:`);
    for (const c of weakCentres) {
      rows.push(`- ${ragIcon(c.status)} ${c.serviceName} (${c.count} placements)`);
    }
  }
  rows.push("");

  rows.push(`## Activations`);
  rows.push(line("Term activations", t.activations.termActivations));
  rows.push("");

  rows.push(`## WhatsApp`);
  rows.push(line("Coordinator posts (7d)", t.whatsapp.coordinator));
  rows.push(line("Engagement", t.whatsapp.engagement));
  rows.push(line("Announcements", t.whatsapp.announcements));
  rows.push("");

  rows.push(`## Centre Intelligence`);
  rows.push(line("Fresh avatars (<30d)", t.centreIntel.fresh));
  if (t.centreIntel.stale.length > 0) {
    rows.push(`Stale (>30d):`);
    for (const s of t.centreIntel.stale.slice(0, 3)) {
      rows.push(`- ${s.serviceName} — ${s.daysStale}d stale`);
    }
  }
  if (t.centreIntel.pendingInsightsCount > 0) {
    rows.push(`Pending insights to review: ${t.centreIntel.pendingInsightsCount}`);
  }
  rows.push("");

  rows.push(`## AI Drafts`);
  rows.push(
    `- ${snapshot.aiDrafts.total} pending (posts: ${snapshot.aiDrafts.breakdown.posts}, campaigns: ${snapshot.aiDrafts.breakdown.campaigns}, other: ${snapshot.aiDrafts.breakdown.other})`,
  );
  rows.push("");

  rows.push(`## Vendor Briefs`);
  rows.push(`- In flight: ${snapshot.vendorBriefs.inFlight}`);
  rows.push(`- Missing for next term: ${snapshot.vendorBriefs.missingForNextTerm}`);
  if (snapshot.vendorBriefs.slaWatch.length > 0) {
    rows.push(`SLA watch:`);
    for (const s of snapshot.vendorBriefs.slaWatch) {
      const reason = s.reason === "no_ack_48h" ? "no acknowledgement 48hr" : "no quote 5d";
      rows.push(`- ${s.title} — ${reason} (${s.daysOverdue}d overdue)`);
    }
  }
  rows.push("");

  if (snapshot.escalations.length > 0) {
    rows.push(`## Escalations`);
    for (const e of snapshot.escalations) {
      rows.push(`- ${e.context}`);
    }
    rows.push("");
  }

  if (snapshot.priorities.length > 0) {
    rows.push(`## This Week's Top 3 (carried over)`);
    for (const p of snapshot.priorities) {
      rows.push(`1. ${p}`);
    }
    rows.push("");
  }

  rows.push(`## Wins`);
  rows.push(`_Akram to fill in before sending._`);
  rows.push("");
  rows.push(`## Blockers`);
  rows.push(`_Akram to fill in before sending._`);
  rows.push("");
  rows.push(`## Next Week's Top 3`);
  rows.push(`_Akram to set before sending._`);

  return rows.join("\n");
}
